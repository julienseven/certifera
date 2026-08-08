import { executionEvents } from "@/db/schema";

export const PROTOCOL_FEE_BPS = 500;
export const REPUTATION_REWARD = 8;
export const REPUTATION_DISPUTE_PENALTY = -12;
export const REPUTATION_SLA_BREACH_PENALTY = -6;
export const EXECUTION_GRACE_BPS = 2_000;
export const MIN_EXECUTION_GRACE_MINUTES = 15;
export const REVIEW_WINDOW_MINUTES = 360;

type LifecycleDb = {
  insert: (table: typeof executionEvents) => {
    values: (value: typeof executionEvents.$inferInsert) => Promise<unknown>;
  };
};

export function calculateExecutionDueAt(etaMinutes: number) {
  const graceMinutes = Math.max(MIN_EXECUTION_GRACE_MINUTES, Math.ceil((etaMinutes * EXECUTION_GRACE_BPS) / 10_000));
  return new Date(Date.now() + (etaMinutes + graceMinutes) * 60_000);
}

export function calculateReviewDueAt() {
  return new Date(Date.now() + REVIEW_WINDOW_MINUTES * 60_000);
}

export function calculatePayout(quoteCents: number) {
  const protocolFeeCents = Math.round((quoteCents * PROTOCOL_FEE_BPS) / 10_000);
  return {
    grossCents: quoteCents,
    protocolFeeCents,
    netCents: quoteCents - protocolFeeCents,
  };
}

export async function recordLifecycleEvent(
  tx: LifecycleDb,
  input: {
    workOrderId: string;
    type: string;
    actor: string;
    summary: string;
    data?: Record<string, string | number | boolean | null>;
  },
) {
  await tx.insert(executionEvents).values({
    workOrderId: input.workOrderId,
    type: input.type,
    actor: input.actor,
    summary: input.summary,
    data: input.data ?? {},
  });
}
