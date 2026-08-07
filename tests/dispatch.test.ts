import { describe, expect, it } from "vitest";
import { rankDispatchCandidates } from "@/lib/dispatch";

describe("dispatch ranking", () => {
  it("prefers available local relays with matching coverage", () => {
    const ranked = rankDispatchCandidates({
      category: "Infrastructure",
      location: "New York, NY",
      relays: [
        { id: "far", handle: "far", zone: "Boston, MA", specialty: "delivery", coverageCategories: ["Delivery"], availabilityStatus: "available", serviceRadiusKm: 25, reputation: 990, lastHeartbeatAt: null },
        { id: "local", handle: "local", zone: "New York, NY", specialty: "field proof", coverageCategories: ["Infrastructure"], availabilityStatus: "available", serviceRadiusKm: 25, reputation: 900, lastHeartbeatAt: new Date() },
        { id: "away", handle: "away", zone: "New York, NY", specialty: "field proof", coverageCategories: ["Infrastructure"], availabilityStatus: "offline", serviceRadiusKm: 25, reputation: 999, lastHeartbeatAt: new Date() },
      ],
    });
    expect(ranked.map((relay) => relay.id)).toEqual(["local", "far"]);
    expect(ranked[0].reasons).toContain("category coverage");
    expect(ranked[0].reasons).toContain("local zone");
  });
});
