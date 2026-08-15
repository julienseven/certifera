import "dotenv/config";
import { pool } from "@/db";
import { seedSandboxData } from "@/lib/sandbox";

/**
 * Seeds the demonstration relays, outcomes, and bids.
 *
 * This used to run implicitly: every one of seven route handlers awaited
 * ensureSandboxData() before doing its own work, so ordinary API traffic wrote
 * demo rows into the same tables as real data. It was on by default whenever
 * NODE_ENV was not "production", which included every developer machine and CI
 * run, and a single environment variable turned it on in production as well.
 *
 * Seeding is a deployment step, not a side effect of serving a request, so it
 * is explicit here and refuses to run against production unless forced.
 *
 *   npm run db:seed:sandbox
 */
function seedAllowed() {
  if (process.env.CERTIFERA_ALLOW_PRODUCTION_SEED === "true") return true;
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

async function main() {
  if (!seedAllowed()) {
    throw new Error(
      "Refusing to seed sandbox data into a production environment.\n" +
        "Set CERTIFERA_ALLOW_PRODUCTION_SEED=true only if the demo walkthrough is meant to be visible there.",
    );
  }

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "the configured host";
  console.log(`Seeding sandbox demonstration data into ${host}`);
  await seedSandboxData();
  console.log("Sandbox data seeded.");
}

main()
  .catch((error) => {
    console.error("Sandbox seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
