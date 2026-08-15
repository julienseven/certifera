import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies the versioned migrations in ./drizzle.
 *
 * This replaces `drizzle-kit push`, which diffed schema.ts straight against
 * whatever database DATABASE_URL pointed at and executed the result. That had
 * no review artifact, no ordering, and no rollback: a renamed column reached
 * production as DROP + ADD, and the data in it was gone with nothing in the
 * repository recording that it happened.
 *
 * Migrations run in a single transaction per file and are recorded in
 * drizzle.__drizzle_migrations, so re-running is a no-op and a partially
 * applied file rolls back rather than leaving the schema half-changed.
 *
 * DATABASE_URL is the target, and an explicit MIGRATE_DATABASE_URL overrides it.
 * DATABASE_URL_UNPOOLED is used only as the unpooled companion of the *same*
 * host DATABASE_URL already names — never as a fallback that could redirect the
 * run somewhere else. Preferring it outright meant an explicit
 * `DATABASE_URL=localhost npm run db:migrate` silently applied DDL to the
 * production branch still sitting in .env.
 */
function resolveTarget() {
  const explicit = process.env.MIGRATE_DATABASE_URL;
  if (explicit) return explicit;

  const target = process.env.DATABASE_URL;
  if (!target) throw new Error("DATABASE_URL is required to run migrations.");

  // DDL through a transaction-mode pooler can land on different backends
  // between statements, so use the direct endpoint when it is the same host.
  const unpooled = process.env.DATABASE_URL_UNPOOLED;
  if (unpooled && hostOf(unpooled).replace("-pooler", "") === hostOf(target).replace("-pooler", "")) {
    return unpooled;
  }
  return target;
}

function hostOf(url: string) {
  return url.match(/@([^/?]+)/)?.[1] ?? "";
}

const databaseUrl = resolveTarget();

function sslConfig(url: string) {
  if (process.env.DATABASE_SSL === "disable") return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (isLocal && process.env.DATABASE_SSL !== "require") return undefined;
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" };
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, ssl: sslConfig(databaseUrl) });
  try {
    const host = databaseUrl.match(/@([^/?]+)/)?.[1] ?? "the configured host";
    console.log(`Applying migrations to ${host}`);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
