import { db } from "@/db";
import { apiKeys, apiRateLimits, emailVerificationTokens, maintenanceRuns, passwordResetTokens, payouts, sessions, workOrders } from "@/db/schema";
import { recordOperationalEvent, reportException } from "@/lib/observability";
import { escalateOverdueSla } from "@/lib/sla";
import { and, eq, lt, ne, or } from "drizzle-orm";

const DEMO_API_KEY_NAME = "Demo (auto-issued)";

/**
 * How long a payout may sit claimed for release before it is treated as stuck.
 *
 * A row in "releasing" means a transfer was about to be attempted at the
 * provider. It is deliberately never auto-reverted to "authorized": doing so
 * could double-pay if the transfer did in fact land. It is surfaced instead, so
 * a human reconciles it against the provider using its release_attempt_id.
 */
const RELEASE_CLAIM_STUCK_MS = Number.parseInt(process.env.CERTIFERA_RELEASE_STUCK_MS ?? "", 10) || 15 * 60 * 1000;

/**
 * Ceiling on SLA escalations per run. Each escalation is its own transaction, so
 * an unbounded backlog would run until the platform kills the function — leaving
 * the run row stuck at "running" and the work half-applied. Bounded work plus an
 * `overdueRemaining` count means a backlog drains across runs and stays visible.
 */
const MAX_ESCALATIONS_PER_RUN = Number.parseInt(process.env.CERTIFERA_MAINTENANCE_BATCH ?? "", 10) || 50;

export async function runMaintenance(trigger: string) {
  const [run] = await db.insert(maintenanceRuns).values({ trigger, status: "running" }).returning();
  try {
    const now = new Date();
    const overdue = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(or(
        and(eq(workOrders.status, "matched"), lt(workOrders.executionDueAt, now)),
        // An escalated review keeps its status and its expired deadline, so it
        // matches this predicate on every later run too. Excluding the ones
        // already escalated is what stops a few undecided reviews from
        // occupying the whole per-run budget while outcomes that breached since
        // wait for a slot. Reopening an execution changes its status, so that
        // branch drops out on its own.
        and(eq(workOrders.status, "review"), lt(workOrders.reviewDueAt, now), ne(workOrders.slaStatus, "review_breached")),
      ))
      .limit(MAX_ESCALATIONS_PER_RUN + 1);
    // Overshoot by one to detect a backlog without a second count query.
    const batch = overdue.slice(0, MAX_ESCALATIONS_PER_RUN);
    const overdueRemaining = overdue.length > MAX_ESCALATIONS_PER_RUN ? overdue.length - MAX_ESCALATIONS_PER_RUN : 0;
    let executionReopened = 0;
    let reviewEscalated = 0;
    for (const workOrder of batch) {
      const result = await escalateOverdueSla(workOrder.id, "maintenance/worker");
      if (result.ok && result.action === "execution_reopened") executionReopened += 1;
      if (result.ok && result.action === "review_escalated") reviewEscalated += 1;
    }
    const [expiredSessions, expiredVerification, expiredResets, expiredRateWindows, expiredDemoKeys] = await Promise.all([
      db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
      db.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, now)).returning({ id: emailVerificationTokens.id }),
      db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now)).returning({ id: passwordResetTokens.id }),
      db.delete(apiRateLimits).where(lt(apiRateLimits.windowStart, new Date(Date.now() - 2 * 60 * 60 * 1000))).returning({ id: apiRateLimits.id }),
      // Scoped strictly to auto-issued demo keys by name, never a real key a
      // user might still want an audit trail for after it expires.
      db.delete(apiKeys).where(and(eq(apiKeys.name, DEMO_API_KEY_NAME), lt(apiKeys.expiresAt, now))).returning({ id: apiKeys.id }),
    ]);
    const stuckReleases = await db
      .select({ id: payouts.id, releaseAttemptId: payouts.releaseAttemptId, releaseClaimedAt: payouts.releaseClaimedAt, netCents: payouts.netCents })
      .from(payouts)
      .where(and(eq(payouts.status, "releasing"), lt(payouts.releaseClaimedAt, new Date(now.getTime() - RELEASE_CLAIM_STUCK_MS))))
      .limit(MAX_ESCALATIONS_PER_RUN);
    for (const payout of stuckReleases) {
      await recordOperationalEvent({
        level: "critical",
        service: "settlement",
        code: "payout_release_stuck",
        message: "A payout has been claimed for release without resolving. Reconcile it against the settlement provider before retrying.",
        resourceType: "payout",
        resourceId: payout.id,
        data: {
          attemptId: payout.releaseAttemptId,
          claimedAt: payout.releaseClaimedAt?.toISOString() ?? null,
          netCents: payout.netCents,
        },
      });
    }

    const result = {
      overdueChecked: batch.length,
      overdueRemaining,
      executionReopened,
      reviewEscalated,
      stuckReleases: stuckReleases.length,
      expiredSessionsDeleted: expiredSessions.length,
      expiredVerificationTokensDeleted: expiredVerification.length,
      expiredResetTokensDeleted: expiredResets.length,
      expiredRateWindowsDeleted: expiredRateWindows.length,
      expiredDemoKeysDeleted: expiredDemoKeys.length,
    };
    await db.update(maintenanceRuns).set({ status: "completed", result, finishedAt: new Date() }).where(eq(maintenanceRuns.id, run.id));
    if (overdueRemaining > 0) {
      await recordOperationalEvent({
        level: "warning",
        service: "maintenance",
        code: "sla_backlog",
        message: `${overdueRemaining} overdue outcomes were left for the next maintenance run.`,
        resourceType: "maintenance_run",
        resourceId: run.id,
        data: { overdueRemaining, batchSize: MAX_ESCALATIONS_PER_RUN },
      });
    }
    return { runId: run.id, ...result };
  } catch (error) {
    await db.update(maintenanceRuns).set({ status: "failed", result: { error: error instanceof Error ? error.message : "Unknown maintenance failure" }, finishedAt: new Date() }).where(eq(maintenanceRuns.id, run.id));
    await reportException({ service: "maintenance", code: "run_failed", error, resourceType: "maintenance_run", resourceId: run.id });
    throw error;
  }
}
