import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * The unauthenticated edge of the auth surface: the three routes a stranger can
 * reach without a credential (login, password-reset request, password-reset
 * confirm) plus the maintenance entrypoint, which is reachable with an admin's
 * ambient session.
 *
 * Uses the same in-memory cookie jar as tests/auth.test.ts so routes that call
 * `cookies()` from next/headers run for real outside a request render scope.
 */
const cookieJar = vi.hoisted(() => new Map<string, { value: string; options: Record<string, unknown> }>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (value === "" || options.maxAge === 0) cookieJar.delete(name);
      else cookieJar.set(name, { value, options });
    },
  }),
}));

import { createSession, hashPassword } from "@/lib/auth";
import { resetRateLimitBreaches } from "@/lib/rate-limit-cache";
import { createTotpSetup, encryptField } from "@/lib/security";
import * as OTPAuth from "otpauth";

const suffix = randomUUID().slice(0, 8);
const PASSWORD = "correct horse battery staple";
const userIds: string[] = [];

/**
 * A fresh source address per test *and* per run.
 *
 * The anonymous limiter keys on a hash of this address and a fixed one-minute
 * window, and those rows outlive the suite — a fixed address would inherit the
 * counts of any earlier run that landed in the same minute and start the test
 * partway to its own ceiling.
 */
function nextIp() {
  const octet = () => 1 + Math.floor(Math.random() * 253);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
}

async function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `sec-hardening-${suffix}-${userIds.length}@certifera.local`,
      passwordHash: await hashPassword(PASSWORD),
      displayName: "Hardening Test User",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  userIds.push(user.id);
  return user;
}

function post(path: string, body: unknown, ip: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  cookieJar.clear();
  resetRateLimitBreaches();
});

afterAll(async () => {
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

describe("password reset request", () => {
  it("answers a registered and an unregistered address identically", async () => {
    // The dev escape hatch deliberately returns the link inline, so the shape
    // that matters is the one production serves.
    const exposed = process.env.CERTIFERA_EXPOSE_AUTH_LINKS;
    delete process.env.CERTIFERA_EXPOSE_AUTH_LINKS;
    try {
      const { POST } = await import("@/app/api/auth/password-reset/request/route");
      const user = await makeUser();

      const registered = await POST(post("/api/auth/password-reset/request", { email: user.email }, nextIp()));
      const unregistered = await POST(post("/api/auth/password-reset/request", { email: `nobody-${suffix}@certifera.local` }, nextIp()));

      expect(registered.status).toBe(unregistered.status);
      // Anything present in one body and not the other tells a stranger which
      // addresses hold accounts, one request at a time.
      expect(await registered.json()).toEqual(await unregistered.json());
    } finally {
      if (exposed !== undefined) process.env.CERTIFERA_EXPOSE_AUTH_LINKS = exposed;
    }
  });
});

describe("password reset confirm", () => {
  async function issueToken(email: string, ip: string) {
    const { POST } = await import("@/app/api/auth/password-reset/request/route");
    const previous = process.env.CERTIFERA_EXPOSE_AUTH_LINKS;
    process.env.CERTIFERA_EXPOSE_AUTH_LINKS = "true";
    const payload = (await (await POST(post("/api/auth/password-reset/request", { email }, ip))).json()) as { resetUrl: string };
    if (previous === undefined) delete process.env.CERTIFERA_EXPOSE_AUTH_LINKS;
    return decodeURIComponent(new URL(payload.resetUrl).searchParams.get("reset") || "");
  }

  it("retires the account's other outstanding reset links when one is used", async () => {
    const ip = nextIp();
    const user = await makeUser();
    const older = await issueToken(user.email, ip);
    const newer = await issueToken(user.email, ip);

    const { POST } = await import("@/app/api/auth/password-reset/confirm/route");
    expect((await POST(post("/api/auth/password-reset/confirm", { token: newer, password: "a-brand-new-password" }, ip))).status).toBe(200);

    // A link that was superseded is still a live credential to whoever holds
    // it: the mailbox it went to, an intercepted copy, a shared device. Once
    // the account has been recovered, none of them may set the password again.
    const replay = await POST(post("/api/auth/password-reset/confirm", { token: older, password: "an-attacker-password" }, ip));
    expect(replay.status).toBe(400);

    const outstanding = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    expect(outstanding).toHaveLength(0);
  });

  it("refuses two simultaneous uses of the same link", async () => {
    const ip = nextIp();
    const user = await makeUser();
    const token = await issueToken(user.email, ip);

    const { POST } = await import("@/app/api/auth/password-reset/confirm/route");
    const results = await Promise.all([
      POST(post("/api/auth/password-reset/confirm", { token, password: "first-writer-password" }, ip)),
      POST(post("/api/auth/password-reset/confirm", { token, password: "second-writer-password" }, ip)),
    ]);
    expect(results.map((response) => response.status).filter((status) => status === 200)).toHaveLength(1);
  });

  it("rate limits by source address like the rest of the unauthenticated auth surface", async () => {
    const ip = nextIp();
    const { POST } = await import("@/app/api/auth/password-reset/confirm/route");
    let refused = 0;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const response = await POST(post("/api/auth/password-reset/confirm", { token: randomUUID(), password: "not-the-real-password" }, ip));
      if (response.status === 429) refused += 1;
    }
    // Unbounded, this endpoint hands an anonymous caller a database lookup per
    // request and an unlimited run at any MFA code guarding a stolen link.
    expect(refused).toBeGreaterThan(0);
  });
});

describe("login with MFA", () => {
  it("counts a wrong authenticator code as a failed sign-in", async () => {
    const key = process.env.CERTIFERA_FIELD_ENCRYPTION_KEY;
    process.env.CERTIFERA_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    try {
      const setup = createTotpSetup(`mfa-${suffix}@certifera.local`);
      const user = await makeUser({ mfaSecret: encryptField(setup.secret), mfaEnabledAt: new Date() });
      const ip = nextIp();
      const { POST } = await import("@/app/api/auth/login/route");

      // The password is already known here; only the six digits are missing.
      // Without lockout that is a 10^6 space with nothing counting the attempts.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await POST(post("/api/auth/login", { email: user.email, password: PASSWORD, mfaCode: "000000" }, ip))).status).toBe(401);
      }

      const [afterFailures] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      expect(afterFailures.failedLoginCount).toBe(5);
      expect(afterFailures.lockedUntil).not.toBeNull();

      const totp = new OTPAuth.TOTP({ issuer: "Certifera", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(setup.secret) });
      const withCorrectCode = await POST(post("/api/auth/login", { email: user.email, password: PASSWORD, mfaCode: totp.generate() }, ip));
      expect(withCorrectCode.status).toBe(401);
    } finally {
      if (key === undefined) delete process.env.CERTIFERA_FIELD_ENCRYPTION_KEY;
      else process.env.CERTIFERA_FIELD_ENCRYPTION_KEY = key;
    }
  });
});

describe("lockout applies to every credential, not just the sign-in form", () => {
  it("refuses a live session belonging to a locked account", async () => {
    const user = await makeUser();
    await createSession(user.id);
    const { DELETE } = await import("@/app/api/auth/mfa/route");

    // The session is genuine and works right up to the moment login shuts the
    // account. Before this, only POST /api/auth/login consulted locked_until,
    // so an attacker already holding a session could keep guessing TOTP codes
    // against the endpoint that removes the second factor — roughly 30 hours
    // at the default ceiling, with no counter ever biting.
    expect((await DELETE(new Request("http://localhost/api/auth/mfa", { method: "DELETE" }))).status).not.toBe(401);

    await db.update(users).set({ lockedUntil: new Date(Date.now() + 15 * 60_000) }).where(eq(users.id, user.id));
    expect((await DELETE(new Request("http://localhost/api/auth/mfa", { method: "DELETE" }))).status).toBe(401);
  });

  it("lets the same session back in once the lock has expired", async () => {
    const user = await makeUser();
    await createSession(user.id);
    const { DELETE } = await import("@/app/api/auth/mfa/route");

    await db.update(users).set({ lockedUntil: new Date(Date.now() - 60_000) }).where(eq(users.id, user.id));
    expect((await DELETE(new Request("http://localhost/api/auth/mfa", { method: "DELETE" }))).status).not.toBe(401);
  });
});

describe("maintenance entrypoint", () => {
  const secret = `cron-secret-${suffix}`;

  function cron(method: string, authorization?: string) {
    return new Request("http://localhost/api/internal/maintenance", {
      method,
      headers: authorization ? { authorization } : {},
    });
  }

  it("will not run a sweep on a GET carrying nothing but an admin's cookie", async () => {
    const previous = process.env.CERTIFERA_CRON_SECRET;
    process.env.CERTIFERA_CRON_SECRET = secret;
    try {
      const admin = await makeUser({ role: "admin" });
      await createSession(admin.id);
      const { GET, POST } = await import("@/app/api/internal/maintenance/route");

      // GET is a link, an <img>, a prefetch. The session cookie is same-site
      // lax, so a top-level navigation an attacker chose still carries it, and
      // a state-changing endpoint must not act on that alone.
      expect((await GET(cron("GET"))).status).toBe(401);

      // The console's own trigger is a POST and keeps working.
      expect((await POST(cron("POST"))).status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.CERTIFERA_CRON_SECRET;
      else process.env.CERTIFERA_CRON_SECRET = previous;
    }
  });

  it("still answers the scheduler's GET, and only for the exact secret", async () => {
    const previous = process.env.CERTIFERA_CRON_SECRET;
    process.env.CERTIFERA_CRON_SECRET = secret;
    try {
      const { GET } = await import("@/app/api/internal/maintenance/route");
      expect((await GET(cron("GET", `Bearer ${secret}`))).status).toBe(200);
      // Same length, one byte out.
      expect((await GET(cron("GET", `Bearer ${secret.slice(0, -1)}X`))).status).toBe(401);
      expect((await GET(cron("GET", `Bearer ${secret.slice(0, -1)}`))).status).toBe(401);
      expect((await GET(cron("GET"))).status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.CERTIFERA_CRON_SECRET;
      else process.env.CERTIFERA_CRON_SECRET = previous;
    }
  });
});
