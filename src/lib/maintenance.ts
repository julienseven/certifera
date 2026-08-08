import { db } from "@/db";
import { apiKeys, apiRateLimits, emailVerificationTokens, maintenanceRuns, passwordResetTokens, sessions, workOrders } from "@/db/schema";
import { reportException } from "@/lib/observability";
import { escalateOverdueSla } from "@/lib/sla";
import { and, eq, lt, or } from "drizzle-orm";

const DEMO_API_KEY_NAME = "Demo (auto-issued)";

export async function runMaintenance(trigger: string) {
  const [run] = await db.insert(maintenanceRuns).values({ trigger, status: "running" }).returning();
  try {
    const now = new Date();
    const overdue = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(or(
        and(eq(workOrders.status, "matched"), lt(workOrders.executionDueAt, now)),
        and(eq(workOrders.status, "review"), lt(workOrders.reviewDueAt, now)),
      ));
    let executionReopened = 0;
    let reviewEscalated = 0;
    for (const workOrder of overdue) {
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
    const result = {
      overdueChecked: overdue.length,
      executionReopened,
      reviewEscalated,
      expiredSessionsDeleted: expiredSessions.length,
      expiredVerificationTokensDeleted: expiredVerification.length,
      expiredResetTokensDeleted: expiredResets.length,
      expiredRateWindowsDeleted: expiredRateWindows.length,
      expiredDemoKeysDeleted: expiredDemoKeys.length,
    };
    await db.update(maintenanceRuns).set({ status: "completed", result, finishedAt: new Date() }).where(eq(maintenanceRuns.id, run.id));
    return { runId: run.id, ...result };
  } catch (error) {
    await db.update(maintenanceRuns).set({ status: "failed", result: { error: error instanceof Error ? error.message : "Unknown maintenance failure" }, finishedAt: new Date() }).where(eq(maintenanceRuns.id, run.id));
    await reportException({ service: "maintenance", code: "run_failed", error, resourceType: "maintenance_run", resourceId: run.id });
    throw error;
  }
}
