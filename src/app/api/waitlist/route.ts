import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { enforceAnonymousRateLimit } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { eq } from "drizzle-orm";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedProfiles = new Set(["agent-builder", "operator", "protocol", "researcher"]);

export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "waitlist", 5);
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { email?: unknown; profile?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const profile = typeof body.profile === "string" ? body.profile : "agent-builder";

    if (!emailPattern.test(email)) {
      return Response.json({ error: "Please enter a valid work email." }, { status: 400 });
    }

    if (!allowedProfiles.has(profile)) {
      return Response.json({ error: "Please choose a valid profile." }, { status: 400 });
    }

    const existing = await db
      .select({ id: waitlistSignups.id })
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email))
      .limit(1);

    if (existing.length) {
      return Response.json({ ok: true, alreadyJoined: true });
    }

    await db.insert(waitlistSignups).values({ email, profile });

    try {
      await sendMail({
        to: email,
        subject: "You're on the Certifera signal list",
        text: "Thanks for your interest in Certifera. We're onboarding a small group of agent builders, operators, and field relays for the controlled beta, and we'll reach out directly when there's a fit. No spam, no token sale — just the first working group.",
      });
    } catch (error) {
      // A mail provider hiccup should not turn a successful signup into a 500.
      console.error("waitlist confirmation email failed", error);
    }

    return Response.json({ ok: true, alreadyJoined: false }, { status: 201 });
  } catch (error) {
    console.error("waitlist signup failed", error);
    return Response.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 500 },
    );
  }
}
