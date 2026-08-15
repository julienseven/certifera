import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { releaseSettlement } from "@/lib/settlement";

describe("sandbox settlement", () => {
  it("creates a Certifera sandbox reference without provider credentials", async () => {
    process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";
    const result = await releaseSettlement({ payoutId: "payout-123", workOrderId: "order-456", netCents: 9500, stripeAccountId: null, attemptId: randomUUID() });
    expect(result.provider).toBe("sandbox");
    expect(result.reference).toMatch(/^cert-sandbox-/);
  });

  it("derives the sandbox reference from the attempt, so retrying a claim is stable", async () => {
    process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";
    const attemptId = randomUUID();
    const input = { payoutId: "payout-123", workOrderId: "order-456", netCents: 9500, stripeAccountId: null, attemptId };
    const first = await releaseSettlement(input);
    const second = await releaseSettlement(input);
    expect(second.reference).toBe(first.reference);

    const other = await releaseSettlement({ ...input, attemptId: randomUUID() });
    expect(other.reference).not.toBe(first.reference);
  });
});
