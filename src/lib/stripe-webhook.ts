import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: { id?: string; metadata?: Record<string, string>; failure_message?: string | null } };
};

function signatureMatches(expected: string, actual: string) {
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyStripeWebhook(payload: string, signatureHeader: string | null, secret: string | undefined) {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter((value): value is string => Boolean(value));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => signatureMatches(expected, signature));
}

export function stripePayloadHash(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}
