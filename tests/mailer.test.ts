import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailDeliveryStatus, sendMail } from "@/lib/mailer";

const ENV_KEYS = ["CERTIFERA_RESEND_API_KEY", "CERTIFERA_MAIL_FROM"];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  clearEnv();
});
afterEach(() => {
  clearEnv();
  vi.unstubAllGlobals();
});

describe("sendMail", () => {
  it("falls back to console mode without throwing when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMail({ to: "relay@example.com", subject: "Hi", text: "Body" });
    expect(result).toEqual({ delivered: false, mode: "console" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to console mode when only one of the two required settings is present", async () => {
    process.env.CERTIFERA_RESEND_API_KEY = "re_test_key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMail({ to: "relay@example.com", subject: "Hi", text: "Body" });
    expect(result).toEqual({ delivered: false, mode: "console" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delivers through Resend when configured", async () => {
    process.env.CERTIFERA_RESEND_API_KEY = "re_test_key";
    process.env.CERTIFERA_MAIL_FROM = "no-reply@certifera.io";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMail({ to: "relay@example.com", subject: "Verify your account", text: "Click here" });
    expect(result).toEqual({ delivered: true, mode: "resend" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer re_test_key", "content-type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ from: "no-reply@certifera.io", to: ["relay@example.com"], subject: "Verify your account", text: "Click here" });
  });

  it("throws the provider's error message when delivery fails", async () => {
    process.env.CERTIFERA_RESEND_API_KEY = "re_test_key";
    process.env.CERTIFERA_MAIL_FROM = "no-reply@certifera.io";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Invalid recipient" }) }));

    await expect(sendMail({ to: "bad", subject: "Hi", text: "Body" })).rejects.toThrow("Invalid recipient");
  });

  it("falls back to a generic error when the failure response has no JSON body", async () => {
    process.env.CERTIFERA_RESEND_API_KEY = "re_test_key";
    process.env.CERTIFERA_MAIL_FROM = "no-reply@certifera.io";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("not json"); } }));

    await expect(sendMail({ to: "bad", subject: "Hi", text: "Body" })).rejects.toThrow("Could not deliver transactional email.");
  });
});

describe("mailDeliveryStatus", () => {
  it("reports console mode as unconfigured", () => {
    expect(mailDeliveryStatus()).toEqual({ configured: false, provider: "console" });
  });

  it("reports resend as configured once both settings are present", () => {
    process.env.CERTIFERA_RESEND_API_KEY = "re_test_key";
    process.env.CERTIFERA_MAIL_FROM = "no-reply@certifera.io";
    expect(mailDeliveryStatus()).toEqual({ configured: true, provider: "resend" });
  });
});

describe("certiferaUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();
  });

  it("defaults to localhost when no site URL is configured", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();
    const mod = await import("@/lib/mailer");
    expect(mod.certiferaUrl("/verify")).toBe("http://localhost:3000/verify");
  });

  it("builds an absolute URL from the configured site origin, trimming a trailing slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://certifera.io/";
    vi.resetModules();
    const mod = await import("@/lib/mailer");
    expect(mod.certiferaUrl("/verify?token=abc")).toBe("https://certifera.io/verify?token=abc");
  });
});
