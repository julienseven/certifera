import { requireIdentity } from "@/lib/auth";
import { evaluateLaunchGates, getBetaMetrics } from "@/lib/beta";
import { getProductionReadiness } from "@/lib/readiness";

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const [metrics, readiness] = await Promise.all([getBetaMetrics(), getProductionReadiness()]);
  // Kept as an explicit `false` rather than dropped: existing clients read this
  // field, and the honest answer is now "these describe the whole pilot".
  return Response.json({ metrics, readiness, sampled: false, gates: evaluateLaunchGates(metrics, readiness.ready) });
}
