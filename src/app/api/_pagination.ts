/*
 * List-bounding helpers shared by the route handlers in this tree.
 *
 * Every list route reads a table that grows with usage, and execution_events,
 * audit_logs, and operational_events are append-only and never pruned. A select
 * with no LIMIT is invisible against seed data and becomes an out-of-memory
 * serverless invocation once the table holds real rows, so each list route
 * carries a default page size plus a hard ceiling, and a caller-supplied
 * ?limit= is clamped into that range rather than trusted.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveLimit(request: Request, fallback: number, ceiling: number) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(ceiling, Math.max(1, Math.floor(parsed)));
}

/*
 * Keyset cursor over (created_at, id). created_at alone is not unique: one
 * lifecycle transition writes several ledger rows inside a single transaction
 * and defaultNow() resolves to the transaction timestamp, so paging on the
 * timestamp alone silently drops the sibling rows. The id breaks the tie.
 */
export function encodeCursor(row: { id: string; createdAt: Date }) {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export type Cursor = { id: string; createdAt: Date };

export function decodeCursor(raw: string | null): Cursor | "invalid" | null {
  if (raw === null || raw.length === 0) return null;
  const [at, id] = raw.split("|");
  const createdAt = new Date(at ?? "");
  if (Number.isNaN(createdAt.getTime()) || !UUID.test(id ?? "")) return "invalid";
  return { id, createdAt };
}
