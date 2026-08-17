import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    clearMocks: true,
    // Every test file shares one database, and several assert on aggregates
    // computed across all of it — the beta scorecard counts every work order
    // that exists, not the ones the calling test seeded. Run files in parallel
    // and any of the ten files that resolve a review can land inside another
    // file's before/after window and move a global count out from under it.
    // Costs about two seconds: the suite's time is import, not execution.
    fileParallelism: false,
  },
});
