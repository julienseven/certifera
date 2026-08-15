import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sandbox seeding must never be reachable from request handling.
 *
 * It previously was: seven route handlers awaited ensureSandboxData() before
 * their own work, which meant ordinary API traffic wrote demonstration relays,
 * outcomes, and bids into the same tables as real data, and paid a
 * 17-statement seed on the first request each cold instance served. It was
 * enabled by default whenever NODE_ENV was not "production", and one
 * environment variable turned it on in production too.
 *
 * The call sites are gone and seeding now lives in scripts/seed-sandbox.ts.
 * This is a structural assertion rather than a behavioural one because the
 * failure mode is someone reintroducing the import: nothing about a passing
 * request-level test would notice that, and the cost only appears in
 * production data.
 */

const API_ROOT = join(process.cwd(), "src/app/api");

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("sandbox seeding is not reachable from request handling", () => {
  const files = routeFiles(API_ROOT);

  it("finds the API routes it intends to check", () => {
    // Guards the assertions below from silently passing if the tree moves.
    expect(files.length).toBeGreaterThan(20);
  });

  it("no API route imports the sandbox seed", () => {
    const offenders = files.filter((file) => /from\s+["']@\/lib\/sandbox["']/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("no API route invokes a seed function", () => {
    const offenders = files.filter((file) => /\b(ensureSandboxData|seedSandboxData)\s*\(/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  it("keeps the seed exported for the deploy script that owns it", async () => {
    const sandbox = await import("@/lib/sandbox");
    expect(typeof sandbox.seedSandboxData).toBe("function");
    // The implicit, request-triggered entry point must not come back.
    expect(sandbox).not.toHaveProperty("ensureSandboxData");
  });
});
