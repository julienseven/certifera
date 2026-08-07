import { describe, expect, it } from "vitest";
import { calculateExecutionDueAt, calculatePayout, calculateReviewDueAt } from "@/lib/lifecycle";

describe("lifecycle policy", () => {
  it("splits payout using the protocol fee policy", () => {
    expect(calculatePayout(10_000)).toEqual({ grossCents: 10_000, protocolFeeCents: 500, netCents: 9_500 });
  });

  it("adds at least the configured execution grace period", () => {
    const before = Date.now();
    const dueAt = calculateExecutionDueAt(30);
    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before + 45 * 60_000 - 100);
  });

  it("sets a future review deadline", () => {
    expect(calculateReviewDueAt().getTime()).toBeGreaterThan(Date.now());
  });
});
