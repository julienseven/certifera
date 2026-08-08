export type DispatchRelay = {
  id: string;
  handle: string;
  zone: string;
  specialty: string;
  coverageCategories: string[];
  availabilityStatus: string;
  serviceRadiusKm: number;
  reputation: number;
  lastHeartbeatAt: Date | null;
};

export type DispatchCandidate = DispatchRelay & {
  score: number;
  reasons: string[];
};

function cityTerms(value: string) {
  return value.toLowerCase().split(/[,/\-]/).map((part) => part.trim()).filter((part) => part.length >= 3);
}

export function rankDispatchCandidates(input: { category: string; location: string; relays: DispatchRelay[] }) {
  const category = input.category.toLowerCase();
  const locationTerms = cityTerms(input.location);
  return input.relays
    .filter((relay) => relay.availabilityStatus === "available")
    .map((relay): DispatchCandidate => {
      const reasons: string[] = [];
      let score = Math.round(relay.reputation * 0.45);
      const categoryMatch = relay.coverageCategories.some((item) => item.toLowerCase() === category) || relay.specialty.toLowerCase().includes(category);
      if (categoryMatch) { score += 35; reasons.push("category coverage"); }
      const zoneMatch = cityTerms(relay.zone).some((term) => locationTerms.includes(term));
      if (zoneMatch) { score += 20; reasons.push("local zone"); }
      if (relay.lastHeartbeatAt && Date.now() - relay.lastHeartbeatAt.getTime() < 60 * 60 * 1000) { score += 10; reasons.push("recent heartbeat"); }
      if (!reasons.length) reasons.push("reputation-ranked fallback");
      return { ...relay, score: Math.min(1000, score), reasons };
    })
    .sort((left, right) => right.score - left.score || right.reputation - left.reputation);
}
