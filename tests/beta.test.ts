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
});
