"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

type RequestStatus = "open" | "matched" | "review" | "disputed" | "verified";
type ProofStatus = "pending_review" | "verified" | "disputed";

type Relay = {
  id: string;
  handle: string;
  zone: string;
  specialty: string;
  reputation: number;
  active: boolean;
};

type WorkOrder = {
  id: string;
  externalRef: string;
  title: string;
  category: string;
  location: string;
  rewardCents: number;
  requester: string;
  status: RequestStatus;
  proofRequirements: string[];
  selectedRelayId: string | null;
  disputeReason: string | null;
  executionDueAt: string | null;
  reviewDueAt: string | null;
  slaStatus: string;
  relayHandle: string | null;
  relayZone: string | null;
  relayReputation: number | null;
};

type DispatchCandidate = {
  id: string;
  handle: string;
  zone: string;
  specialty: string;
  availabilityStatus: string;
  reputation: number;
  score: number;
  reasons: string[];
};

type Bid = {
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

type Proof = {
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

type ActivityEvent = {
  id: string;
  type: string;
  actor: string;
  summary: string;
  data: Record<string, string | number | boolean | null>;
  createdAt: string;
};

type Payout = {
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

type Sla = {
  phase: "execution" | "review" | null;
  dueAt: string | null;
  isOverdue: boolean;
  slaStatus: string;
};

type ReputationEvent = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
  relayHandle: string;
};

type Account = {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "operator" | "reviewer" | "relay";
  relayId: string | null;
};

type Notice = { kind: "success" | "error"; text: string } | null;
type QueueFilter = "all" | "action" | "active" | "settled";
type BusyState = "create" | "bid" | "select" | "proof" | "review" | "reopen" | "release" | null;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const categories = ["Infrastructure", "Field verification", "Climate data", "Delivery"];

function Glyph({ name, size = 17 }: { name: "arrow" | "plus" | "check" | "refresh" | "bolt" | "clock" | "pin" | "shield" | "alert" | "menu" | "search" | "stack" | "activity" | "wallet"; size?: number }) {
  const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "arrow") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "plus") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "check") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
  if (name === "bolt") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m13 2-9 12h7l-1 8 10-13h-7V2Z" /></svg>;
  if (name === "clock") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.7 2" /></svg>;
  if (name === "pin") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  if (name === "shield") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 3 5.5 6v5c0 4.4 2.7 8.2 6.5 10 3.8-1.8 6.5-5.6 6.5-10V6L12 3Z" /><path d="m9.5 12 1.6 1.6 3.8-4" /></svg>;
  if (name === "alert") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 4 3.7 19h16.6L12 4Z" /><path d="M12 9v4M12 16h.01" /></svg>;
  if (name === "menu") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (name === "search") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (name === "stack") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></svg>;
  if (name === "activity") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M3 12h4l2-5 4 10 2-5h8" /></svg>;
  if (name === "wallet") return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M4 8h15M15 13h2" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20 11a8 8 0 1 0 2 5.5" /><path d="M20 4v7h-7" /></svg>;
}

function requestTone(status: RequestStatus) {
  if (status === "verified") return "border-[#73f59a]/30 bg-[#73f59a]/10 text-[#abffc0]";
  if (status === "review") return "border-[#c5a8ff]/35 bg-[#c5a8ff]/10 text-[#e0d3ff]";
  if (status === "disputed") return "border-red-300/35 bg-red-300/[0.09] text-red-100";
  if (status === "matched") return "border-sky-300/30 bg-sky-300/10 text-sky-200";
  return "border-amber-200/20 bg-amber-200/[0.07] text-amber-100";
}

function etaLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

export default function ConsolePage() {
  const [requests, setRequests] = useState<WorkOrder[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [relays, setRelays] = useState<Relay[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [dispatchCandidates, setDispatchCandidates] = useState<DispatchCandidate[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [proof, setProof] = useState<Proof | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [sla, setSla] = useState<Sla | null>(null);
  const [reputationEvents, setReputationEvents] = useState<ReputationEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", location: "", reward: "150", category: "Field verification", requester: "operator/console" });
  const [bidForm, setBidForm] = useState({ relayId: "", quote: "", etaMinutes: "60", note: "" });
  const [proofForm, setProofForm] = useState({ observation: "", evidenceUrl: "" });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  const selected = useMemo(() => requests.find((request) => request.id === selectedId) || requests[0] || null, [requests, selectedId]);
  const selectedRewardCents = selected?.rewardCents;
  const openRequests = requests.filter((request) => request.status === "open");
  const matchedRequests = requests.filter((request) => request.status === "matched");
  const reviewRequests = requests.filter((request) => request.status === "review");
  const verifiedRequests = requests.filter((request) => request.status === "verified");
  const escrowed = requests.filter((request) => !["verified", "disputed"].includes(request.status)).reduce((total, request) => total + request.rewardCents, 0);
  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesQuery = !normalizedQuery || [request.title, request.location, request.requester, request.externalRef, request.category]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesFilter = queueFilter === "all"
        || (queueFilter === "action" && ["review", "disputed"].includes(request.status))
        || (queueFilter === "active" && ["open", "matched"].includes(request.status))
        || (queueFilter === "settled" && request.status === "verified");
      return matchesQuery && matchesFilter;
    });
  }, [query, queueFilter, requests]);

  async function loadDispatch(requestId: string) {
    setDispatchLoading(true);
    try {
      const response = await fetch(`/api/requests/${requestId}/dispatch`);
      const payload = (await response.json()) as { candidates?: DispatchCandidate[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not calculate dispatch coverage.");
      setDispatchCandidates(payload.candidates || []);
    } catch (error) {
      setDispatchCandidates([]);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not calculate dispatch coverage." });
    } finally { setDispatchLoading(false); }
  }

  async function loadBids(requestId: string) {
    setBidsLoading(true);
    try {
      const response = await fetch(`/api/requests/${requestId}/bids`);
      const payload = (await response.json()) as { bids?: Bid[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the bid book.");
      setBids(payload.bids || []);
    } catch (error) {
      setBids([]);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the bid book." });
    } finally { setBidsLoading(false); }
  }

  async function loadProof(requestId: string) {
    setProofLoading(true);
    try {
      const response = await fetch(`/api/requests/${requestId}/proof`);
      const payload = (await response.json()) as { proof?: Proof | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the proof record.");
      setProof(payload.proof || null);
    } catch (error) {
      setProof(null);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the proof record." });
    } finally { setProofLoading(false); }
  }

  async function loadSla(requestId: string) {
    try {
      const response = await fetch(`/api/requests/${requestId}/sla`);
      const payload = (await response.json()) as { sla?: Sla; error?: string };
      if (!response.ok || !payload.sla) throw new Error(payload.error || "Could not load the SLA state.");
      setSla(payload.sla);
    } catch (error) {
      setSla(null);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the SLA state." });
    }
  }

  async function loadActivity(requestId: string) {
    setActivityLoading(true);
    try {
      const response = await fetch(`/api/requests/${requestId}/activity`);
      const payload = (await response.json()) as {
        events?: ActivityEvent[];
        payout?: Payout | null;
        reputation?: ReputationEvent[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load lifecycle activity.");
      setActivity(payload.events || []);
      setPayout(payload.payout || null);
      setReputationEvents(payload.reputation || []);
    } catch (error) {
      setActivity([]);
      setPayout(null);
      setReputationEvents([]);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load lifecycle activity." });
    } finally { setActivityLoading(false); }
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/auth/me");
      const payload = (await response.json()) as { user?: Account };
      if (!response.ok || !payload.user) {
        window.location.assign("/access?next=/console");
        return;
      }
      setAccount(payload.user);
      await loadData();
    } catch {
      window.location.assign("/access?next=/console");
    } finally { setAuthLoading(false); }
  }

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [requestResponse, relayResponse] = await Promise.all([fetch("/api/requests"), fetch("/api/relays")]);
      const requestPayload = (await requestResponse.json()) as { requests?: WorkOrder[]; error?: string };
      const relayPayload = (await relayResponse.json()) as { relays?: Relay[]; error?: string };
      if (!requestResponse.ok) throw new Error(requestPayload.error || "Could not load outcome requests.");
      if (!relayResponse.ok) throw new Error(relayPayload.error || "Could not load the relay network.");
      const nextRequests = requestPayload.requests || [];
      setRequests(nextRequests);
      setRelays(relayPayload.relays || []);
      setSelectedId((current) => current && nextRequests.some((request) => request.id === current) ? current : nextRequests[0]?.id || null);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the command deck." });
    } finally { setLoading(false); }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetches and derived-selection resets, not render loops */
  // Account bootstrap intentionally runs once; data loads only after session validation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadAccount(); }, []);
  useEffect(() => {
    if (!selected?.id) {
      setBids([]);
      setDispatchCandidates([]);
      setProof(null);
      setActivity([]);
      setPayout(null);
      setSla(null);
      setReputationEvents([]);
      return;
    }
    void loadBids(selected.id);
    if (selected.status === "open") void loadDispatch(selected.id);
    else setDispatchCandidates([]);
    void loadProof(selected.id);
    void loadSla(selected.id);
    void loadActivity(selected.id);
    setReviewNote("");
  }, [selected?.id, selected?.status]);
  useEffect(() => {
    if (selectedRewardCents) setBidForm((form) => ({ ...form, quote: String(Math.max(25, Math.floor(selectedRewardCents / 100 * 0.85))) }));
  }, [selected?.id, selectedRewardCents]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function updateSelected(patch: Partial<WorkOrder>) {
    if (!selected) return;
    setRequests((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setNotice(null);
    try {
      const response = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskForm) });
      const payload = (await response.json()) as { request?: WorkOrder; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "Could not publish the request.");
      setRequests((items) => [payload.request as WorkOrder, ...items]);
      setSelectedId(payload.request.id);
      setTaskForm({ title: "", location: "", reward: "150", category: "Field verification", requester: "operator/console" });
      setCreateOpen(false);
      setNotice({ kind: "success", text: "Request funded and published. Relays can now quote the outcome." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not publish the request." });
    } finally { setBusy(null); }
  }

  async function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy("bid");
    setNotice(null);
    try {
      const response = await fetch(`/api/requests/${selected.id}/bids`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bidForm) });
      const payload = (await response.json()) as { updated?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not place the bid.");
      await Promise.all([loadBids(selected.id), loadActivity(selected.id)]);
      setBidOpen(false);
      setBidForm((form) => ({ ...form, relayId: "", etaMinutes: "60", note: "" }));
      setNotice({ kind: "success", text: payload.updated ? "Relay bid updated in the quote book." : "Relay bid added to the quote book." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not place the bid." });
    } finally { setBusy(null); }
  }

  async function selectBid(bid: Bid) {
    if (!selected) return;
    setBusy("select");
    setNotice(null);
    try {
      const response = await fetch(`/api/requests/${selected.id}/bids`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidId: bid.id }) });
      const payload = (await response.json()) as { request?: WorkOrder; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "Could not select that relay.");
      updateSelected({ ...payload.request, relayHandle: bid.relayHandle, relayZone: bid.relayZone, relayReputation: bid.relayReputation, disputeReason: null });
      await Promise.all([loadBids(selected.id), loadActivity(selected.id)]);
      setNotice({ kind: "success", text: `${bid.relayHandle} is matched. The proof window is now open.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not select that relay." });
    } finally { setBusy(null); }
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy("proof");
    setNotice(null);
    try {
      if (!evidenceFile) throw new Error("Attach a private JPG, PNG, WEBP, or PDF evidence file first.");
      const upload = new FormData();
      upload.set("workOrderId", selected.id);
      upload.set("file", evidenceFile);
      const uploadResponse = await fetch("/api/evidence", { method: "POST", body: upload });
      const uploadPayload = (await uploadResponse.json()) as { asset?: { id: string }; error?: string };
      if (!uploadResponse.ok || !uploadPayload.asset) throw new Error(uploadPayload.error || "Could not securely upload the evidence file.");
      const response = await fetch(`/api/requests/${selected.id}/proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observation: proofForm.observation, evidenceAssetId: uploadPayload.asset.id }) });
      const payload = (await response.json()) as { proof?: Proof; requestStatus?: RequestStatus; error?: string };
      if (!response.ok || !payload.proof) throw new Error(payload.error || "Could not submit the proof bundle.");
      updateSelected({ status: "review" });
      setProof(payload.proof);
      setProofForm({ observation: "", evidenceUrl: "" });
      setEvidenceFile(null);
      await loadActivity(selected.id);
      setNotice({ kind: "success", text: "Evidence bundle submitted. Settlement is now waiting for operator review." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not submit the proof bundle." });
    } finally { setBusy(null); }
  }

  async function reviewProof(decision: "approve" | "dispute" | "reopen") {
    if (!selected) return;
    setBusy(decision === "reopen" ? "reopen" : "review");
    setNotice(null);
    try {
      const response = await fetch(`/api/requests/${selected.id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: reviewNote }) });
      const payload = (await response.json()) as {
        requestStatus?: RequestStatus;
        proofStatus?: ProofStatus | null;
        payout?: { id: string; netCents: number; status: "authorized" | "released" };
        reputationDelta?: number;
        error?: string;
      };
      if (!response.ok || !payload.requestStatus) throw new Error(payload.error || "Could not record the review decision.");
      if (decision === "reopen") {
        updateSelected({ status: "open", selectedRelayId: null, relayHandle: null, relayZone: null, relayReputation: null, disputeReason: null });
        setProof(null);
        await Promise.all([loadBids(selected.id), loadActivity(selected.id), loadData(true)]);
        setNotice({ kind: "success", text: "Disputed request returned to the market. Relays can quote a new execution plan." });
      } else {
        updateSelected({ status: payload.requestStatus, disputeReason: decision === "dispute" ? reviewNote : null });
        setProof((current) => current ? { ...current, status: payload.proofStatus || current.status, reviewerNote: reviewNote, reviewedAt: new Date().toISOString() } : current);
        await Promise.all([loadProof(selected.id), loadActivity(selected.id), loadData(true)]);
        setNotice({
          kind: "success",
          text: decision === "approve"
            ? `Review approved. ${payload.payout ? `${money.format(payload.payout.netCents / 100)} is authorized for release.` : "Settlement is authorized."}`
            : "Dispute opened. Reward remains held and the evidence is preserved.",
        });
      }
      setReviewNote("");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not record the review decision." });
    } finally { setBusy(null); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function escalateSla() {
    if (!selected) return;
    setBusy("review");
    setNotice(null);
    try {
      const response = await fetch(`/api/requests/${selected.id}/sla`, { method: "PATCH" });
      const payload = (await response.json()) as { result?: { action: string; status: RequestStatus; slaStatus: string; reputationDelta?: number }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Could not escalate the SLA.");
      await Promise.all([loadData(true), loadBids(selected.id), loadProof(selected.id), loadSla(selected.id), loadActivity(selected.id)]);
      setNotice({
        kind: "success",
        text: payload.result.action === "execution_reopened"
          ? "Execution breach confirmed. The request is back in the relay market with an audit trail."
          : "Review breach recorded. Evidence remains held until an operator decision.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not escalate the SLA." });
    } finally { setBusy(null); }
  }

  async function releasePayout() {
    if (!selected || !payout) return;
    setBusy("release");
    setNotice(null);
    try {
      const response = await fetch(`/api/requests/${selected.id}/settlement`, { method: "PATCH" });
      const payload = (await response.json()) as { payout?: Payout; error?: string };
      if (!response.ok || !payload.payout) throw new Error(payload.error || "Could not release the payout.");
      setPayout(payload.payout);
      await loadActivity(selected.id);
      setNotice({ kind: "success", text: `${money.format(payload.payout.netCents / 100)} released to ${payout.relayHandle}. Settlement reference created.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not release the payout." });
    } finally { setBusy(null); }
  }

  if (authLoading) {
    return <main className="console-surface grid min-h-screen place-items-center bg-[#060806] text-white"><div className="flex items-center gap-3 text-[12px] text-white/55"><span className="h-2 w-2 animate-pulse rounded-full bg-[#73f59a]" /> Securing workspace…</div></main>;
  }

  return (
    <main className="console-surface min-h-screen bg-[#060806] text-[#f4f7f2] selection:bg-[#73f59a] selection:text-[#071b0e]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060806]/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1540px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-6"><Link href="/" className="group flex items-center gap-3" aria-label="Certifera home"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#73f59a] text-[#071b0e] transition-transform group-hover:rotate-45"><span className="h-2.5 w-2.5 rotate-45 border-2 border-current" /></span><span className="text-[18px] font-medium tracking-[-0.05em]">certifera<span className="text-[#73f59a]">/</span></span></Link><span className="hidden border-l border-white/15 pl-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:block">Operator console</span></div>
          <div className="flex items-center gap-2"><span className="mr-2 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a8ffbe] xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#73f59a] shadow-[0_0_10px_2px_rgba(115,245,154,.35)]" /> Pilot network live</span><div className="mr-1 hidden border-l border-white/10 pl-3 text-right lg:block"><p className="text-[10px] font-medium text-white/75">{account?.displayName}</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-white/35">{account?.role}</p></div><button onClick={() => setNavOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 lg:hidden" aria-label="Toggle workspace navigation" aria-expanded={navOpen}><Glyph name="menu" size={17} /></button><button onClick={() => { void loadData(true); if (selected) { void Promise.all([loadBids(selected.id), loadDispatch(selected.id), loadProof(selected.id), loadSla(selected.id), loadActivity(selected.id)]); } }} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/55 transition-colors hover:border-[#73f59a]/50 hover:text-[#73f59a]" aria-label="Refresh marketplace"><Glyph name="refresh" size={16} /></button><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#73f59a] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#071b0e] transition-transform hover:-translate-y-0.5 sm:px-4"><Glyph name="plus" size={15} /><span className="hidden sm:inline">New request</span><span className="sr-only sm:hidden">New request</span></button><Link href="/security" className="hidden rounded-full border border-white/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 transition-colors hover:border-[#73f59a]/40 hover:text-[#a8ffbe] md:block">Security</Link>{account?.role === "admin" && <><Link href="/cohorts" className="hidden rounded-full border border-white/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 transition-colors hover:border-[#73f59a]/40 hover:text-[#a8ffbe] 2xl:block">Cohorts</Link><Link href="/pilot" className="hidden rounded-full border border-white/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 transition-colors hover:border-[#73f59a]/40 hover:text-[#a8ffbe] xl:block">Pilot</Link><Link href="/operations" className="hidden rounded-full border border-white/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 transition-colors hover:border-[#73f59a]/40 hover:text-[#a8ffbe] lg:block">Operations</Link></>}<button onClick={logout} className="hidden rounded-full border border-white/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 transition-colors hover:border-white/25 hover:text-white sm:block">Sign out</button></div>
        </div>
      </header>

      {navOpen && <div className="border-b border-white/10 bg-[#0a0f0b] px-5 py-4 lg:hidden"><div className="mx-auto grid max-w-[1580px] gap-2"><a onClick={() => setNavOpen(false)} href="#market" className="flex items-center gap-3 rounded-lg bg-[#73f59a]/10 px-3 py-3 text-[12px] font-medium text-[#a8ffbe]"><Glyph name="stack" size={16} /> Outcome market</a><a onClick={() => setNavOpen(false)} href="#network" className="flex items-center gap-3 rounded-lg px-3 py-3 text-[12px] text-white/55"><Glyph name="activity" size={16} /> Relay network</a><a onClick={() => setNavOpen(false)} href="#ledger" className="flex items-center gap-3 rounded-lg px-3 py-3 text-[12px] text-white/55"><Glyph name="wallet" size={16} /> Settlement ledger</a></div></div>}
      <div className="mx-auto grid max-w-[1580px] lg:grid-cols-[226px_minmax(0,1fr)] lg:px-5">
        <aside className="hidden min-h-[calc(100vh-68px)] border-r border-white/10 py-8 pr-5 lg:flex lg:flex-col">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/42">Pilot workspace</span><span className="h-2 w-2 rounded-full bg-[#73f59a] shadow-[0_0_12px_rgba(115,245,154,0.7)]" /></div>
            <p className="mt-3 text-[14px] font-medium tracking-[-0.025em] text-white">New York / beta</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/42">Live outcome network</p>
          </div>
          <nav className="mt-8" aria-label="Console navigation">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">Operate</p>
            <a href="#market" className="mt-3 flex items-center gap-3 rounded-lg bg-[#73f59a]/10 px-3 py-2.5 text-[12px] font-medium text-[#a8ffbe]"><Glyph name="stack" size={16} /> Outcome market</a>
            <a href="#network" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] text-white/48 transition-colors hover:bg-white/[0.04] hover:text-white"><Glyph name="activity" size={16} /> Relay network</a>
            <a href="#ledger" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] text-white/48 transition-colors hover:bg-white/[0.04] hover:text-white"><Glyph name="wallet" size={16} /> Settlement ledger</a>
          </nav>
          <div className="mt-auto rounded-xl border border-[#73f59a]/20 bg-[#73f59a]/[0.045] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8ffbe]">Lifecycle v0.1</p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/52">Every state change is recorded, reviewable, and ready for protocol settlement.</p>
            <div className="mt-4 flex flex-col gap-2"><Link href="/" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a8ffbe] hover:text-white">Protocol brief <Glyph name="arrow" size={13} /></Link><Link href="/launch" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 hover:text-[#a8ffbe]">Launch readiness <Glyph name="arrow" size={13} /></Link></div>
          </div>
        </aside>
        <div className="min-w-0 px-5 py-8 sm:px-8 sm:py-10 lg:px-9">
        <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">Live execution layer / pilot build</p><h1 className="mt-3 text-[clamp(2.7rem,5.5vw,5.1rem)] font-medium leading-[0.87] tracking-[-0.08em]">Outcome market<span className="text-[#73f59a]">.</span></h1></div><div className="max-w-md"><p className="text-[13px] leading-relaxed text-white/52">Fund the action, choose the relay, inspect its evidence, then authorize settlement—without a blind handoff.</p><div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35"><span>01 fund</span><span className="text-[#73f59a]">→</span><span>02 match</span><span className="text-[#73f59a]">→</span><span>03 review</span><span className="text-[#73f59a]">→</span><span>04 settle</span></div></div></div>
        {notice && <div role="status" aria-live="polite" className={`mt-5 flex items-start gap-3 border px-4 py-3 text-[12px] leading-relaxed ${notice.kind === "success" ? "border-[#73f59a]/30 bg-[#73f59a]/[0.08] text-[#b7ffca]" : "border-red-400/30 bg-red-400/[0.08] text-red-200"}`}><span className="mt-0.5">{notice.kind === "success" ? <Glyph name="check" size={15} /> : "!"}</span><span>{notice.text}</span></div>}

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Open outcomes" value={loading ? "—" : String(openRequests.length).padStart(2, "0")} helper="accepting quotes" /><Metric label="In execution" value={loading ? "—" : String(matchedRequests.length).padStart(2, "0")} helper="relay selected" accent /><Metric label="Review queue" value={loading ? "—" : String(reviewRequests.length).padStart(2, "0")} helper="evidence awaiting decision" review /><Metric label="Settled" value={loading ? "—" : String(verifiedRequests.length).padStart(2, "0")} helper={`${money.format(escrowed / 100)} still escrowed`} /></div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section id="market" className="min-w-0"><div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Demand side</p><h2 className="mt-1 text-xl font-medium tracking-[-0.045em]">Funded outcome requests</h2><p className="mt-1 text-[11px] text-white/40">{filteredRequests.length} visible · {requests.length} total in pilot</p></div><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 self-start rounded-lg border border-[#73f59a]/30 bg-[#73f59a]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#a8ffbe] transition-colors hover:border-[#73f59a] hover:bg-[#73f59a] hover:text-[#071b0e] sm:self-auto"><Glyph name="plus" size={14} /> Post outcome</button></div><div className="mb-4 rounded-xl border border-white/10 bg-white/[0.018] p-3"><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"><Glyph name="search" size={15} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests, locations, agents…" aria-label="Search outcome requests" className="w-full rounded-lg border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-[#73f59a]/60" /></div><div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">{([ ["all", "All"], ["action", "Needs action"], ["active", "Active"], ["settled", "Settled"] ] as const).map(([filter, label]) => <button key={filter} onClick={() => setQueueFilter(filter)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.04em] transition-colors ${queueFilter === filter ? "border-[#73f59a]/45 bg-[#73f59a]/10 text-[#a8ffbe]" : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"}`}>{label}</button>)}</div></div>{loading ? <div className="grid min-h-[300px] place-items-center border border-white/10 bg-white/[0.02] text-[12px] text-white/40">Connecting to the pilot network…</div> : <div className="space-y-3">{filteredRequests.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.018] px-5 py-12 text-center"><p className="text-[13px] font-medium text-white/75">No outcomes match this view</p><p className="mt-2 text-[11px] text-white/42">Try another queue filter or clear your search.</p><button onClick={() => { setQueueFilter("all"); setQuery(""); }} className="mt-4 text-[10px] font-bold uppercase tracking-[0.13em] text-[#a8ffbe] hover:text-white">Reset view</button></div> : filteredRequests.map((request) => <button key={request.id} onClick={() => setSelectedId(request.id)} className={`w-full rounded-2xl border p-5 text-left transition-all duration-200 ${selected?.id === request.id ? "border-[#73f59a]/55 bg-[#73f59a]/[0.08] shadow-[0_12px_34px_rgba(0,0,0,0.18)]" : "border-white/10 bg-[#0a0f0b]/75 hover:-translate-y-0.5 hover:border-white/25 hover:bg-[#0e1510]"}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-white/35">{request.externalRef}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${requestTone(request.status)}`}>{request.status === "review" ? "in review" : request.status}</span></div><h3 className="mt-3 text-[19px] font-medium tracking-[-0.045em]">{request.title}</h3><p className="mt-2 flex items-center gap-1.5 text-[12px] text-white/47"><Glyph name="pin" size={13} />{request.location}<span className="mx-1 text-white/20">/</span>{request.category}</p></div><div className="text-right"><p className="text-lg font-medium tracking-[-0.04em] text-[#a8ffbe]">{money.format(request.rewardCents / 100)}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">reward cap</p></div></div><div className="mt-5 flex flex-wrap gap-2">{request.proofRequirements.map((requirement) => <span key={requirement} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/42">{requirement}</span>)}</div></button>)}</div>}</section>

          <aside className="glass-panel h-fit rounded-2xl border border-white/10 p-5 sm:p-6 xl:sticky xl:top-[92px]">{!selected ? <p className="py-16 text-center text-[12px] text-white/40">Select an outcome request to review its market.</p> : <><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#73f59a]">Request detail</p><h2 className="mt-2 text-2xl font-medium leading-[0.98] tracking-[-0.055em]">{selected.title}</h2></div><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${requestTone(selected.status)}`}>{selected.status === "review" ? "in review" : selected.status}</span></div><div className="mt-6 grid grid-cols-2 gap-px border border-white/10 bg-white/10"><DetailMetric label="Reward cap" value={money.format(selected.rewardCents / 100)} accent /><DetailMetric label="Active relay" value={selected.relayHandle || "Awaiting bids"} /></div><SlaPanel sla={sla} selected={selected} onEscalate={escalateSla} escalating={busy === "review"} /><div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Proof conditions</p><ul className="mt-3 space-y-2">{selected.proofRequirements.map((item) => <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-white/65"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#73f59a]" />{item}</li>)}</ul></div>{selected.status === "open" && <><DispatchPanel candidates={dispatchCandidates} loading={dispatchLoading} /><BidBook bids={bids} loading={bidsLoading} onSelect={selectBid} onOpenBid={() => setBidOpen(true)} busy={busy === "select"} /></>}{selected.status === "matched" && <ProofForm selected={selected} proofForm={proofForm} setProofForm={setProofForm} evidenceFile={evidenceFile} setEvidenceFile={setEvidenceFile} onSubmit={submitProof} busy={busy === "proof"} />}{selected.status === "review" && <ReviewPanel proof={proof} loading={proofLoading} note={reviewNote} setNote={setReviewNote} onDecision={reviewProof} busy={busy === "review"} />}{selected.status === "disputed" && <DisputePanel proof={proof} loading={proofLoading} reason={selected.disputeReason} note={reviewNote} setNote={setReviewNote} onReopen={() => reviewProof("reopen")} busy={busy === "reopen"} />}{selected.status === "verified" && <SettledPanel proof={proof} loading={proofLoading} payout={payout} activityLoading={activityLoading} onRelease={releasePayout} releasing={busy === "release"} />}
              <LifecyclePanel events={activity} reputation={reputationEvents} loading={activityLoading} />
            </>}</aside>
        </div>

        <section id="network" className="mt-10 border-t border-white/10 pt-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Supply side</p><h2 className="mt-1 text-xl font-medium tracking-[-0.045em]">Available relay network</h2></div><p className="text-[10px] uppercase tracking-[0.12em] text-white/35">Reputation / 1000</p></div><div className="mt-4 grid gap-3 md:grid-cols-3">{relays.map((relay) => <article key={relay.id} className="rounded-xl border border-white/10 bg-[#0a0f0b]/75 p-4 transition-colors hover:border-white/20 hover:bg-[#0e1510]"><div className="flex items-start justify-between"><div><p className="text-[14px] font-medium tracking-[-0.035em]">{relay.handle}</p><p className="mt-1 text-[11px] text-white/43">{relay.zone}</p></div><span className="h-2 w-2 rounded-full bg-[#73f59a] shadow-[0_0_10px_2px_rgba(115,245,154,.3)]" /></div><p className="mt-6 text-[11px] text-white/55">{relay.specialty}</p><div className="mt-3 h-1 overflow-hidden bg-white/10"><div className="h-full bg-[#73f59a]" style={{ width: `${relay.reputation / 10}%` }} /></div><p className="mt-2 text-right font-mono text-[10px] text-[#a8ffbe]">{relay.reputation}</p></article>)}</div></section>
        </div>
      </div>

      {createOpen && <Modal eyebrow="New outcome request" title="Fund a verifiable action" close={() => setCreateOpen(false)}><form onSubmit={createRequest} className="grid gap-5 sm:grid-cols-2"><Field label="Desired outcome" className="sm:col-span-2"><input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="e.g. Verify rooftop HVAC condition" className="input" /></Field><Field label="Service location"><input required value={taskForm.location} onChange={(event) => setTaskForm({ ...taskForm, location: event.target.value })} placeholder="City, region" className="input" /></Field><Field label="Reward cap / USD"><input required type="number" min="25" max="10000" value={taskForm.reward} onChange={(event) => setTaskForm({ ...taskForm, reward: event.target.value })} className="input" /></Field><Field label="Proof category"><select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value })} className="input">{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Requester alias"><input value={taskForm.requester} onChange={(event) => setTaskForm({ ...taskForm, requester: event.target.value })} placeholder="your-agent/ops" className="input" /></Field><p className="sm:col-span-2 text-[11px] leading-relaxed text-white/40">Publishing establishes the reward cap and proof conditions. Settlement remains locked until an operator approves submitted evidence.</p><ModalActions close={() => setCreateOpen(false)} busy={busy === "create"} label="Fund & publish" /></form></Modal>}
      {bidOpen && selected && <Modal eyebrow="Relay bid / sandbox" title="Quote this outcome" close={() => setBidOpen(false)}><form onSubmit={submitBid} className="grid gap-5 sm:grid-cols-2"><Field label="Executing relay" className="sm:col-span-2"><select required value={bidForm.relayId} onChange={(event) => setBidForm({ ...bidForm, relayId: event.target.value })} className="input"><option value="">Choose a relay</option>{relays.map((relay) => <option key={relay.id} value={relay.id}>{relay.handle} · {relay.zone} · rep {relay.reputation}</option>)}</select></Field><Field label={`Quote / USD · cap ${money.format(selected.rewardCents / 100)}`}><input required type="number" min="25" max={Math.floor(selected.rewardCents / 100)} value={bidForm.quote} onChange={(event) => setBidForm({ ...bidForm, quote: event.target.value })} className="input" /></Field><Field label="Committed ETA / minutes"><input required type="number" min="15" max="1440" value={bidForm.etaMinutes} onChange={(event) => setBidForm({ ...bidForm, etaMinutes: event.target.value })} className="input" /></Field><Field label="Relay note" className="sm:col-span-2"><textarea required minLength={8} rows={3} value={bidForm.note} onChange={(event) => setBidForm({ ...bidForm, note: event.target.value })} placeholder="State your route, capability, or relevant proof detail." className="input resize-none border p-3" /></Field><p className="sm:col-span-2 text-[11px] leading-relaxed text-white/40">One live bid per relay per request. Re-submitting revises the quote until a winner is selected.</p><ModalActions close={() => setBidOpen(false)} busy={busy === "bid"} label="Place bid" /></form></Modal>}
    </main>
  );
}

function SlaPanel({ sla, selected, onEscalate, escalating }: { sla: Sla | null; selected: WorkOrder; onEscalate: () => void; escalating: boolean }) {
  if (!sla) return <div className="mt-5 border border-white/10 bg-white/[0.02] px-3 py-3 text-[11px] text-white/40">Loading commitment state…</div>;
  const dueLabel = sla.dueAt ? new Date(sla.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const hasHistoricalBreach = ["execution_breached", "review_breached"].includes(sla.slaStatus);
  if (!sla.phase) {
    return <div className={`mt-5 border px-3 py-3 ${hasHistoricalBreach ? "border-red-300/25 bg-red-300/[0.06]" : "border-white/10 bg-white/[0.02]"}`}><p className={`text-[10px] font-semibold uppercase tracking-[0.13em] ${hasHistoricalBreach ? "text-red-100" : "text-white/40"}`}>{hasHistoricalBreach ? "Prior SLA breach recorded" : "No active SLA window"}</p><p className="mt-1 text-[11px] leading-relaxed text-white/48">{hasHistoricalBreach ? "This outcome was reopened after a missed commitment. Review the execution ledger for the preserved trail." : selected.status === "verified" ? "All execution and review commitments are closed." : "A deadline begins when a relay is selected or evidence enters review."}</p></div>;
  }
  return <div className={`mt-5 border p-3 ${sla.isOverdue ? "border-red-300/35 bg-red-300/[0.07]" : "border-sky-300/25 bg-sky-300/[0.055]"}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-[10px] font-semibold uppercase tracking-[0.13em] ${sla.isOverdue ? "text-red-100" : "text-sky-100"}`}>{sla.phase === "execution" ? "Execution commitment" : "Review commitment"}</p><p className="mt-1 text-[11px] text-white/62">Due {dueLabel || "—"}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${sla.isOverdue ? "border-red-300/35 text-red-100" : "border-sky-300/25 text-sky-100"}`}>{sla.isOverdue ? "breached" : "on track"}</span></div><p className="mt-3 text-[10px] leading-relaxed text-white/42">{sla.phase === "execution" ? "The selected relay must submit its attested bundle before this deadline." : "A pending proof should receive an operator decision before this deadline."}</p>{sla.isOverdue && <button disabled={escalating} onClick={onEscalate} className="mt-3 inline-flex items-center gap-2 border border-red-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-red-100 transition-colors hover:bg-red-300/10 disabled:opacity-50">{escalating ? "Escalating…" : sla.phase === "execution" ? "Escalate & reopen market" : "Record review breach"}<Glyph name="alert" size={14} /></button>}</div>;
}

function DispatchPanel({ candidates, loading }: { candidates: DispatchCandidate[]; loading: boolean }) {
  return <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100">Dispatch preflight</p><p className="mt-1 text-[11px] text-white/42">Available coverage ranked before bids arrive.</p></div><span className="text-[10px] uppercase tracking-[0.12em] text-white/35">{candidates.length} available</span></div>{loading ? <p className="py-5 text-center text-[11px] text-white/40">Calculating local coverage…</p> : candidates.length === 0 ? <div className="mt-4 rounded-lg border border-amber-200/20 bg-amber-200/[0.05] p-3 text-[11px] leading-relaxed text-amber-100">No available relay coverage is currently ranked for this task. Open Supply Command before funding more tasks in this zone.</div> : <div className="mt-4 space-y-2">{candidates.slice(0, 3).map((relay) => <div key={relay.id} className="rounded-lg border border-sky-300/15 bg-sky-300/[0.04] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-medium text-white/82">{relay.handle}</p><p className="mt-1 text-[10px] text-white/42">{relay.zone} · rep {relay.reputation}</p></div><span className="font-mono text-[10px] text-[#a8ffbe]">{relay.score}</span></div><p className="mt-2 text-[10px] text-sky-100/75">{relay.reasons.join(" · ")}</p></div>)}</div>}</div>;
}

function BidBook({ bids, loading, onSelect, onOpenBid, busy }: { bids: Bid[]; loading: boolean; onSelect: (bid: Bid) => void; onOpenBid: () => void; busy: boolean }) {
  return <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#73f59a]">Relay bid book</p><p className="mt-1 text-[11px] text-white/42">Select a committed quote to unlock proof.</p></div><button onClick={onOpenBid} className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9affb8] hover:text-white">Simulate bid <span className="ml-1 inline-block align-[-4px]"><Glyph name="plus" size={14} /></span></button></div>{loading ? <p className="py-8 text-center text-[12px] text-white/40">Loading quote book…</p> : bids.length === 0 ? <div className="mt-4 border border-dashed border-white/15 px-4 py-7 text-center text-[12px] text-white/42">No relays have quoted yet. Add a sandbox bid to test matching.</div> : <div className="mt-4 space-y-2">{bids.map((bid) => <article key={bid.id} className={`border p-3 ${bid.status === "selected" ? "border-[#73f59a]/40 bg-[#73f59a]/[0.07]" : bid.status === "rejected" ? "border-white/5 bg-white/[0.015] opacity-45" : "border-white/10 bg-white/[0.025]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-medium tracking-[-0.025em]">{bid.relayHandle}</p><p className="mt-1 text-[10px] text-white/42">Rep {bid.relayReputation} · {bid.relayZone}</p></div><div className="text-right"><p className="text-[15px] font-medium text-[#a8ffbe]">{money.format(bid.quoteCents / 100)}</p><p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/43"><Glyph name="clock" size={12} /> {etaLabel(bid.etaMinutes)}</p></div></div><p className="mt-3 text-[11px] leading-relaxed text-white/55">{bid.note}</p>{bid.status === "open" ? <button disabled={busy} onClick={() => onSelect(bid)} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9affb8] hover:text-white disabled:opacity-50">{busy ? "Selecting…" : "Select relay"}<Glyph name="arrow" size={13} /></button> : <p className={`mt-3 text-[9px] font-bold uppercase tracking-[0.13em] ${bid.status === "selected" ? "text-[#a8ffbe]" : "text-white/50"}`}>{bid.status}</p>}</article>)}</div>}</div>;
}

function ProofForm({ selected, proofForm, setProofForm, evidenceFile, setEvidenceFile, onSubmit, busy }: { selected: WorkOrder; proofForm: { observation: string; evidenceUrl: string }; setProofForm: (form: { observation: string; evidenceUrl: string }) => void; evidenceFile: File | null; setEvidenceFile: (file: File | null) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <form onSubmit={onSubmit} className="mt-6 border-t border-white/10 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#73f59a]">Submit for review</p><div className="mt-3 flex items-center gap-2 border border-sky-300/20 bg-sky-300/[0.07] px-3 py-2 text-[11px] text-sky-100"><Glyph name="bolt" size={15} /> Assigned to <strong className="font-medium">{selected.relayHandle}</strong></div><Field label="Field observation" className="mt-4"><textarea required minLength={20} rows={3} value={proofForm.observation} onChange={(event) => setProofForm({ ...proofForm, observation: event.target.value })} placeholder="What did the assigned relay directly observe?" className="input resize-none border p-3" /></Field><Field label="Private evidence file" className="mt-4"><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} className="block w-full rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-[11px] text-white/65 file:mr-3 file:rounded-md file:border-0 file:bg-[#73f59a] file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.1em] file:text-[#071b0e]" /></Field>{evidenceFile && <p className="mt-2 flex items-center gap-2 text-[10px] text-[#a8ffbe]"><Glyph name="check" size={13} /> {evidenceFile.name} · {(evidenceFile.size / 1024 / 1024).toFixed(2)} MB</p>}<button disabled={busy || !evidenceFile} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-[#73f59a] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#071b0e] transition-colors hover:bg-[#a1ffba] disabled:cursor-wait disabled:opacity-60">{busy ? "Encrypting & submitting…" : "Submit for review"}<Glyph name="arrow" size={15} /></button><p className="mt-3 text-[10px] leading-relaxed text-white/37">JPG, PNG, WEBP, or PDF up to 8 MB. The file is hashed, stored privately, and available only to authorized actors.</p></form>;
}

function ReviewPanel({ proof, loading, note, setNote, onDecision, busy }: { proof: Proof | null; loading: boolean; note: string; setNote: (note: string) => void; onDecision: (decision: "approve" | "dispute") => void; busy: boolean }) {
  if (loading) return <p className="py-8 text-center text-[12px] text-white/40">Loading submitted evidence…</p>;
  if (!proof) return <div className="mt-6 border border-amber-200/20 bg-amber-200/[0.05] p-4 text-[12px] leading-relaxed text-amber-100">This request is marked for review, but no evidence record is available yet. Refresh the console before taking action.</div>;
  return <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center gap-2 text-[#dfd3ff]"><Glyph name="shield" size={17} /><span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Evidence review desk</span></div><ProofRecord proof={proof} /><Field label="Reviewer decision note" className="mt-5"><textarea required minLength={12} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="State why the bundle satisfies, or fails, the required proof conditions." className="input resize-none border p-3" /></Field><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busy || note.trim().length < 12} onClick={() => onDecision("dispute")} className="inline-flex items-center justify-center gap-2 border border-red-300/40 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-red-100 transition-colors hover:bg-red-300/10 disabled:opacity-40"><Glyph name="alert" size={14} /> Open dispute</button><button disabled={busy || note.trim().length < 12} onClick={() => onDecision("approve")} className="inline-flex items-center justify-center gap-2 bg-[#73f59a] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#071b0e] transition-colors hover:bg-[#a1ffba] disabled:opacity-40">{busy ? "Recording…" : "Approve & settle"}<Glyph name="check" size={14} /></button></div><p className="mt-3 text-[10px] leading-relaxed text-white/37">Approval authorizes settlement. A dispute preserves the bundle, freezes payout, and returns only through an explicit reopen action.</p></div>;
}

function DisputePanel({ proof, loading, reason, note, setNote, onReopen, busy }: { proof: Proof | null; loading: boolean; reason: string | null; note: string; setNote: (note: string) => void; onReopen: () => void; busy: boolean }) {
  return <div className="mt-6 border border-red-300/30 bg-red-300/[0.07] p-4"><div className="flex items-center gap-2 text-red-100"><Glyph name="alert" size={17} /><span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Dispute is open</span></div><p className="mt-3 text-[12px] leading-relaxed text-red-50/80">{reason || "A reviewer held settlement for this evidence bundle."}</p>{loading ? <p className="mt-4 text-[11px] text-white/40">Loading preserved evidence…</p> : proof && <ProofRecord proof={proof} compact />}<div className="mt-5 border-t border-red-300/20 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-red-100">Return to market</p><p className="mt-1 text-[11px] leading-relaxed text-white/55">Reopening clears the selected relay and lets the market submit revised execution plans. The disputed proof remains on record.</p><Field label="Reopen note" className="mt-4"><textarea minLength={12} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why is a fresh market attempt appropriate?" className="input resize-none border p-3" /></Field><button disabled={busy || note.trim().length < 12} onClick={onReopen} className="mt-4 inline-flex items-center gap-2 border border-white/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-white transition-colors hover:border-[#73f59a] hover:text-[#a8ffbe] disabled:opacity-40">{busy ? "Reopening…" : "Reopen bid market"}<Glyph name="arrow" size={14} /></button></div></div>;
}

function SettledPanel({ proof, loading, payout, activityLoading, onRelease, releasing }: { proof: Proof | null; loading: boolean; payout: Payout | null; activityLoading: boolean; onRelease: () => void; releasing: boolean }) {
  const failed = payout?.status === "failed";
  return <div className={`mt-6 border p-4 ${failed ? "border-red-300/30 bg-red-300/[0.07]" : "border-[#73f59a]/30 bg-[#73f59a]/[0.07]"}`}><div className={`flex items-center gap-2 ${failed ? "text-red-100" : "text-[#a8ffbe]"}`}><Glyph name={failed ? "alert" : "check"} size={16} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{failed ? "Settlement needs attention" : "Settlement authorized"}</span></div><p className="mt-2 text-[12px] leading-relaxed text-white/58">The proof passed operator review. The instruction below separates relay payout from protocol revenue and tracks provider reconciliation.</p>{activityLoading ? <p className="mt-4 text-[11px] text-white/40">Loading payout instruction…</p> : payout ? <div className="mt-4 border border-white/10 bg-black/15 p-3"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/42">Payout instruction</p><p className="mt-1 text-[13px] text-white/75">To {payout.relayHandle}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${payout.status === "released" ? "border-[#73f59a]/30 bg-[#73f59a]/10 text-[#a8ffbe]" : payout.status === "failed" ? "border-red-300/35 bg-red-300/[0.08] text-red-100" : "border-[#c5a8ff]/35 bg-[#c5a8ff]/10 text-[#dfd3ff]"}`}>{payout.status}</span></div><div className="mt-4 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-center"><div><p className="text-[9px] uppercase tracking-[0.11em] text-white/35">Gross</p><p className="mt-1 text-[12px] text-white/70">{money.format(payout.grossCents / 100)}</p></div><div className="border-x border-white/10"><p className="text-[9px] uppercase tracking-[0.11em] text-white/35">Protocol</p><p className="mt-1 text-[12px] text-white/70">−{money.format(payout.protocolFeeCents / 100)}</p></div><div><p className="text-[9px] uppercase tracking-[0.11em] text-white/35">Relay net</p><p className="mt-1 text-[12px] font-medium text-[#a8ffbe]">{money.format(payout.netCents / 100)}</p></div></div>{payout.status === "authorized" ? <button disabled={releasing} onClick={onRelease} className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-[#73f59a] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#071b0e] transition-colors hover:bg-[#a1ffba] disabled:cursor-wait disabled:opacity-60">{releasing ? "Releasing payout…" : "Release payout"}<Glyph name="arrow" size={14} /></button> : payout.status === "failed" ? <div className="mt-4 rounded-lg border border-red-300/20 bg-red-300/[0.06] p-3 text-[10px] leading-relaxed text-red-100"><p className="font-semibold uppercase tracking-[0.12em]">Provider reconciliation failed</p><p className="mt-1">{payout.failureReason || "Review Stripe dashboard and operational alerts before retrying."}</p></div> : <div className="mt-4 border-t border-white/10 pt-3 text-[10px] text-[#a8ffbe]"><span className="font-mono">{payout.settlementRef}</span><span className="ml-2 text-white/45">{payout.reconciledAt ? "provider reconciled" : "release awaiting provider webhook"}</span></div>}</div> : <p className="mt-4 text-[11px] text-amber-100">The proof is approved, but no payout instruction is available. Refresh before retrying review.</p>}{loading ? <p className="mt-4 text-[11px] text-white/40">Loading immutable proof record…</p> : proof && <ProofRecord proof={proof} compact />}</div>;
}

function LifecyclePanel({ events, reputation, loading }: { events: ActivityEvent[]; reputation: ReputationEvent[]; loading: boolean }) {
  return <div id="ledger" className="mt-6 border-t border-white/10 pt-5"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Execution ledger</p><p className="mt-1 text-[11px] text-white/50">Append-only lifecycle activity</p></div><span className="font-mono text-[10px] text-[#73f59a]">{events.length} EVENTS</span></div>{loading ? <p className="py-6 text-center text-[11px] text-white/40">Loading lifecycle events…</p> : events.length === 0 ? <p className="mt-4 border border-dashed border-white/15 p-4 text-[11px] leading-relaxed text-white/42">This outcome has no recorded events yet. Funding, bids, evidence, review, and settlement will write here.</p> : <ol className="mt-4 space-y-0 border-l border-white/10 pl-4">{events.slice(0, 7).map((event) => <li key={event.id} className="relative pb-4 last:pb-0"><span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a0f0b] ${event.type.includes("dispute") ? "bg-red-300" : event.type.includes("payout") ? "bg-[#73f59a]" : event.type.includes("proof") ? "bg-[#c5a8ff]" : "bg-sky-300"}`} /><div className="flex items-start justify-between gap-3"><p className="text-[11px] font-medium text-white/80">{event.summary}</p><time className="shrink-0 font-mono text-[9px] text-white/35">{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p className="mt-1 text-[10px] uppercase tracking-[0.11em] text-white/38">{event.type.replaceAll("_", " ")} · {event.actor}</p></li>)}</ol>}{reputation.length > 0 && <div className="mt-4 border border-white/10 bg-black/15 p-3">{reputation.map((entry) => <p key={entry.id} className="text-[10px] leading-relaxed text-white/52"><span className={entry.delta >= 0 ? "text-[#a8ffbe]" : "text-red-200"}>{entry.delta >= 0 ? "+" : ""}{entry.delta}</span> reputation · {entry.relayHandle} · {entry.reason}</p>)}</div>}</div>;
}

function ProofRecord({ proof, compact = false }: { proof: Proof; compact?: boolean }) {
  const flags = proof.intelligenceFlags || [];
  const metadata = proof.capturedMetadata || {};
  return <div className={`mt-4 border border-white/10 bg-black/15 ${compact ? "p-3" : "p-4"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${proof.status === "pending_review" ? "border-[#c5a8ff]/35 bg-[#c5a8ff]/10 text-[#dfd3ff]" : proof.status === "disputed" ? "border-red-300/35 bg-red-300/[0.08] text-red-100" : "border-[#73f59a]/30 bg-[#73f59a]/10 text-[#a8ffbe]"}`}>{proof.status.replace("_", " ")}</span><span className="font-mono text-[10px] text-[#a8ffbe]">{proof.verificationScore}% confidence</span></div><p className="mt-3 text-[12px] leading-relaxed text-white/72">{proof.observation}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/42"><span>Relay: {proof.relayHandle || "recorded relay"}</span><span className="font-mono">{proof.attestationHash}</span>{proof.evidenceAssetId ? <a href={`/api/evidence?id=${proof.evidenceAssetId}`} target="_blank" rel="noreferrer" className="text-[#9affb8] hover:text-white">Open private evidence ↗</a> : proof.evidenceUrl && <a href={proof.evidenceUrl} target="_blank" rel="noreferrer" className="text-[#9affb8] hover:text-white">Legacy evidence ↗</a>}</div>{proof.intelligenceScore !== null && <div className="mt-4 rounded-lg border border-sky-300/15 bg-sky-300/[0.045] p-3"><div className="flex items-center justify-between gap-3"><p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-sky-100">Evidence signals</p><span className="font-mono text-[10px] text-[#a8ffbe]">{proof.intelligenceScore}/100</span></div><p className="mt-2 text-[10px] leading-relaxed text-white/48">{metadata.capturedAt ? `Captured ${String(metadata.capturedAt)}` : "No capture time available"}{metadata.device ? ` · ${String(metadata.device)}` : ""}{metadata.latitude !== null && metadata.latitude !== undefined ? " · GPS present" : ""}</p>{flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{flags.filter((flag) => flag !== "file_signature_validated").map((flag) => <span key={flag} className="rounded-full border border-amber-200/15 px-2 py-1 text-[9px] text-amber-100/80">{flag.replaceAll("_", " ")}</span>)}</div>}<p className="mt-2 text-[9px] leading-relaxed text-white/32">Signals support review; they do not replace human verification.</p></div>}{proof.reviewerNote && <p className="mt-3 border-t border-white/10 pt-3 text-[11px] italic leading-relaxed text-white/55">“{proof.reviewerNote}”</p>}</div>;
}

function Metric({ label, value, helper, accent = false, review = false }: { label: string; value: string; helper: string; accent?: boolean; review?: boolean }) {
  return <article className={`rounded-xl border p-4 sm:p-5 ${accent ? "border-[#73f59a]/30 bg-[#73f59a]/[0.07]" : review ? "border-[#c5a8ff]/25 bg-[#c5a8ff]/[0.055]" : "border-white/10 bg-white/[0.018]"}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">{label}</p><p className={`mt-5 text-3xl font-medium tracking-[-0.06em] ${accent ? "text-[#a8ffbe]" : review ? "text-[#dfd3ff]" : "text-white"}`}>{value}</p><p className="mt-2 text-[11px] text-white/40">{helper}</p></article>;
}

function DetailMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="bg-[#0a0f0b] p-3"><p className="text-[9px] uppercase tracking-[0.13em] text-white/38">{label}</p><p className={`mt-2 truncate text-[13px] ${accent ? "font-medium text-[#a8ffbe]" : "text-white/75"}`}>{value}</p></div>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="text-[10px] uppercase tracking-[0.13em] text-white/40">{label}</span><div className="mt-2">{children}</div></label>;
}

function Modal({ eyebrow, title, close, children }: { eyebrow: string; title: string; close: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-6"><div role="dialog" aria-modal="true" aria-label={title} className="glass-panel w-full max-w-xl rounded-t-2xl border border-white/15 p-5 shadow-2xl sm:rounded-2xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#73f59a]">{eyebrow}</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.055em]">{title}</h2></div><button onClick={close} className="text-[12px] text-white/45 hover:text-white">Close</button></div><div className="mt-7">{children}</div></div></div>;
}

function ModalActions({ close, busy, label }: { close: () => void; busy: boolean; label: string }) {
  return <div className="flex items-center justify-end gap-3 sm:col-span-2"><button type="button" onClick={close} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45 hover:text-white">Cancel</button><button disabled={busy} className="inline-flex items-center gap-2 bg-[#73f59a] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#071b0e] disabled:opacity-60" type="submit">{busy ? "Working…" : label}<Glyph name="arrow" size={15} /></button></div>;
}
