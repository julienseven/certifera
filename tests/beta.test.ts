import { describe, expect, it } from "vitest";
import { evaluateLaunchGates, type BetaMetrics } from "@/lib/beta";

const strongMetrics: BetaMetrics = {
  totalTasks: 30,
  matchedTasks: 30,
  proofSubmittedTasks: 28,
  resolvedReviewTasks: 28,
  reviewsWithinSla: 27,
  competitiveBidTasks: 23,
  partnerCountWithTasks: 5,
  repeatPartners: 3,
  feedbackCount: 6,
  averageSatisfaction: 4.3,
  medianFirstBidMinutes: 18,
  unresolvedCriticalAlerts: 0,
};

describe("closed beta launch gates", () => {
  it("passes proven beta gates when thresholds are met", () => {
    const gates = evaluateLaunchGates(strongMetrics, true);
    expect(gates.every((gate) => gate.status === "pass")).toBe(true);
  });

  it("keeps small samples in insufficient state", () => {
    const gates = evaluateLaunchGates({ ...strongMetrics, totalTasks: 4 }, true);
    expect(gates.find((gate) => gate.key === "sample")?.status).toBe("insufficient");
    expect(gates.find((gate) => gate.key === "proof_completion")?.status).toBe("insufficient");
  });

  it("fails the gate when a critical alert is unresolved", () => {
    const gates = evaluateLaunchGates({ ...strongMetrics, unresolvedCriticalAlerts: 1 }, true);
    expect(gates.find((gate) => gate.key === "critical_alerts")?.status).toBe("fail");
  });

  it("reports an empty pilot as unmeasured rather than as a rate", () => {
    // Every rate here divides by a count that a pilot with no tasks has none
    // of. The answer a launch decision can survive is "not measured yet" — not
    // a 0% that reads as a failure, a 100% that reads as a pass, or a NaN.
    const empty: BetaMetrics = {
      totalTasks: 0,
      matchedTasks: 0,
      proofSubmittedTasks: 0,
      resolvedReviewTasks: 0,
      reviewsWithinSla: 0,
      competitiveBidTasks: 0,
      partnerCountWithTasks: 0,
      repeatPartners: 0,
      feedbackCount: 0,
      averageSatisfaction: null,
      medianFirstBidMinutes: null,
      unresolvedCriticalAlerts: 0,
    };
    const rateGates = evaluateLaunchGates(empty, true).filter((gate) => ["proof_completion", "review_sla", "competitive_bids", "repeat_demand"].includes(gate.key));
    expect(rateGates).toHaveLength(4);
    for (const gate of rateGates) {
      expect(gate.status).toBe("insufficient");
      expect(gate.current).toBe("—");
    }
  });
});
