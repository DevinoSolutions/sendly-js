import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["edge-tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
