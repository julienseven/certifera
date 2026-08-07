import { describe, expect, it } from "vitest";
import { releaseSettlement } from "@/lib/settlement";

describe("sandbox settlement", () => {
  it("creates a Certifera sandbox reference without provider credentials", async () => {
    process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";
    const result = await releaseSettlement({ payoutId: "payout-123", workOrderId: "order-456", netCents: 9500, stripeAccountId: null });
    expect(result.provider).toBe("sandbox");
    expect(result.reference).toMatch(/^cert-sandbox-/);
  });
});
