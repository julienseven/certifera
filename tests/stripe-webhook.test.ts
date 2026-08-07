import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhook } from "@/lib/stripe-webhook";

describe("Stripe webhook verification", () => {
  it("accepts a valid current signed payload", () => {
    const secret = "whsec_certifera";
    const payload = '{"id":"evt_123","type":"transfer.created"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    expect(verifyStripeWebhook(payload, `t=${timestamp},v1=${signature}`, secret)).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const secret = "whsec_certifera";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.original`).digest("hex");
    expect(verifyStripeWebhook("tampered", `t=${timestamp},v1=${signature}`, secret)).toBe(false);
  });
});
