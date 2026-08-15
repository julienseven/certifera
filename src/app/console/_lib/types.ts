/**
 * Shared shapes for the operator console.
 *
 * console/page.tsx had grown to hold its type declarations, its icon set, its
 * formatters, every fetch call, and every rendered panel in one client
 * component. The parts that carry no state are the low-risk half to separate:
 * these are pure declarations, so the panels can share them without importing
 * the page, and a future split of the stateful half has somewhere to land.
 */

export type RequestStatus = "open" | "matched" | "review" | "disputed" | "verified";
export type ProofStatus = "pending_review" | "verified" | "disputed";

export type Relay = {
  id: string;
  handle: string;
  zone: string;
  specialty: string;
  reputation: number;
  active: boolean;
};

export type WorkOrder = {
  id: string;
  externalRef: string;
  title: string;
  category: string;
  location: string;
  rewardCents: number;
  /** Withheld (null) for relays on outcomes they were not selected for: on partner-funded work it is the buyer's alias. */
  requester: string | null;
  status: RequestStatus;
  proofRequirements: string[];
  selectedRelayId: string | null;
  /** Withheld (null) unless staff, or the relay whose own work is being disputed. */
  disputeReason: string | null;
  executionDueAt: string | null;
  reviewDueAt: string | null;
  slaStatus: string;
  relayHandle: string | null;
  relayZone: string | null;
  relayReputation: number | null;
};

export type DispatchCandidate = {
  id: string;
  handle: string;
  zone: string;
  specialty: string;
  availabilityStatus: string;
  reputation: number;
  score: number;
  reasons: string[];
};

export type Bid = {
  id: string;
  relayId: string;
  quoteCents: number;
  etaMinutes: number;
  note: string;
  status: "open" | "selected" | "rejected";
  relayHandle: string;
  relayZone: string;
  relaySpecialty: string;
  relayReputation: number;
};

export type Proof = {
  id: string;
  relayId: string | null;
  evidenceAssetId: string | null;
  intelligenceScore: number | null;
  intelligenceFlags: string[] | null;
  capturedMetadata: Record<string, string | number | boolean | null> | null;
  observation: string;
  evidenceUrl: string | null;
  attestationHash: string;
  verificationScore: number;
  status: ProofStatus;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  relayHandle: string | null;
};

export type ActivityEvent = {
  id: string;
  type: string;
  actor: string;
  summary: string;
  data: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type Payout = {
  id: string;
  grossCents: number;
  protocolFeeCents: number;
  netCents: number;
  status: "authorized" | "released" | "failed";
  settlementRef: string | null;
  providerEventId: string | null;
  failureReason: string | null;
  reconciledAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  relayHandle: string;
};

export type Sla = {
  phase: "execution" | "review" | null;
  dueAt: string | null;
  isOverdue: boolean;
  slaStatus: string;
};

export type ReputationEvent = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
  relayHandle: string;
};

export type Account = {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "operator" | "reviewer" | "relay";
  relayId: string | null;
};

export type Notice = { kind: "success" | "error"; text: string } | null;
export type QueueFilter = "all" | "action" | "active" | "settled";
export type BusyState = "create" | "bid" | "select" | "proof" | "review" | "reopen" | "release" | null;
