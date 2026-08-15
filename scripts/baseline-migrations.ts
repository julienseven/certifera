import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/**
 * Adopts the migration system on a database that already has the schema.
 *
 * The 0000 baseline was generated from the schema that production was already
 * running, so applying it there would fail on the first CREATE TABLE. This
 * records the migrations named on the command line as already-applied, using
 * the same journal table and hash that drizzle's migrator checks, so the next
 * `db:migrate` starts from the first genuinely new file.
 *
 * Only ever stamp a migration you have confirmed is already reflected in the
 * target schema. Verify with `drizzle-kit check` and a generate-drift run
 * first; stamping an unapplied migration hides missing DDL until a query fails.
 *
 *   npm run db:baseline -- 0000_baseline
 */
const MIGRATIONS_FOLDER = "./drizzle";

function hostOf(url: string) {
  return url.match(/@([^/?]+)/)?.[1] ?? "";
}

function resolveTarget() {
  const explicit = process.env.MIGRATE_DATABASE_URL;
  if (explicit) return explicit;
  const target = process.env.DATABASE_URL;
  if (!target) throw new Error("DATABASE_URL is required to stamp migrations.");
  const unpooled = process.env.DATABASE_URL_UNPOOLED;
  if (unpooled && hostOf(unpooled).replace("-pooler", "") === hostOf(target).replace("-pooler", "")) return unpooled;
  return target;
}

function sslConfig(url: string) {
  if (process.env.DATABASE_SSL === "disable") return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (isLocal && process.env.DATABASE_SSL !== "require") return undefined;
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" };
}

type Journal = { entries: { idx: number; tag: string; when: number }[] };

async function main() {
  const tags = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
  if (tags.length === 0) {
    throw new Error("Name at least one migration to stamp, e.g. `npm run db:baseline -- 0000_baseline`.");
  }

  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as Journal;
  const databaseUrl = resolveTarget();
  const pool = new Pool({ connectionString: databaseUrl, max: 1, ssl: sslConfig(databaseUrl) });

  try {
    console.log(`Stamping ${tags.join(", ")} on ${hostOf(databaseUrl)}`);
    // Matches what drizzle's migrator creates, so the two agree on the journal.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await pool.query(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);

    for (const tag of tags) {
      const entry = journal.entries.find((candidate) => candidate.tag === tag);
      if (!entry) throw new Error(`No migration named "${tag}" exists in ${MIGRATIONS_FOLDER}/meta/_journal.json.`);

      // drizzle hashes the raw file contents and matches on that, not the tag.
      const hash = createHash("sha256").update(readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), "utf8")).digest("hex");
      const { rowCount } = await pool.query(`SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`, [hash]);
      if (rowCount) {
        console.log(`  ${tag} is already recorded, leaving it alone.`);
        continue;
      }
      await pool.query(`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`, [hash, entry.when]);
      console.log(`  recorded ${tag}`);
    }
    console.log("Done. `npm run db:migrate` will now apply only newer migrations.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Baseline stamp failed:", error);
  process.exitCode = 1;
});
