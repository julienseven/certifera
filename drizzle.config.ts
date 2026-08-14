import { defineConfig } from "drizzle-kit";

/**
 * Replaces drizzle.config.json, which hardcoded the local development URL and
 * so could only ever target localhost — pushing schema to a managed database
 * silently wrote to whatever was listening on 127.0.0.1 instead.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle-kit. Set it in .env or the shell.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    // Managed providers terminate TLS with a certificate that is not in the
    // Node CA bundle; local Postgres has no TLS at all.
    ssl: /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) ? false : { rejectUnauthorized: false },
  },
});
