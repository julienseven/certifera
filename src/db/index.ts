import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

function intFromEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Serverless connection budget.
 *
 * Every warm lambda instance holds its own pool, so the cluster-wide connection
 * count is (instances x max), not `max`. Postgres refuses new connections past
 * `max_connections` — on Railway's managed tier that is ~100 shared — so a
 * default `max: 10` exhausts the server at ~10 concurrent instances and every
 * subsequent request fails with "too many clients", including the ones that
 * would have released a connection.
 *
 * Small `max` plus a short idle timeout keeps a traffic spike from parking
 * connections in instances that are no longer serving requests. Raise
 * DATABASE_POOL_MAX only behind a real pooler (PgBouncer in transaction mode).
 */
const poolMax = intFromEnv("DATABASE_POOL_MAX", 3);

/** Railway's managed certificate is not in the Node CA bundle, so verification is opt-out. */
function sslConfig() {
  if (process.env.DATABASE_SSL === "disable") return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl!);
  if (isLocal && process.env.DATABASE_SSL !== "require") return undefined;
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" };
}

const globalForDb = globalThis as typeof globalThis & {
  __certiferaPool?: Pool;
};

function createPool() {
  const created = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    // Release idle connections quickly: a lambda that has stopped serving
    // traffic should not keep holding a slot until the server times it out.
    idleTimeoutMillis: intFromEnv("DATABASE_POOL_IDLE_MS", 10_000),
    // Fail fast when the pool is saturated instead of hanging until the
    // platform kills the function, which would surface as a 504 with no cause.
    connectionTimeoutMillis: intFromEnv("DATABASE_POOL_CONNECT_TIMEOUT_MS", 8_000),
    ssl: sslConfig(),
  });

  // An idle client erroring (server restart, network drop) emits on the pool.
  // Without a listener, `pg` escalates it to an uncaught exception that takes
  // down the whole instance rather than just that connection.
  created.on("error", (error) => {
    console.error("postgres pool error", error);
  });

  return created;
}

/**
 * Cached in every environment, production included. The previous build only
 * cached outside production, so each module evaluation on a warm lambda built a
 * fresh pool and leaked the old one's connections.
 */
export const pool = globalForDb.__certiferaPool ?? createPool();
globalForDb.__certiferaPool = pool;

export const db = drizzle(pool);
