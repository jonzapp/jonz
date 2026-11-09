import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // Pure functions only: no stack, no network, no clock.
          testTimeout: 5_000,
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          // One conversation with the database at a time.
          pool: "forks",
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 30_000,
          retry: 0,
        },
      },
    ],
  },
});
