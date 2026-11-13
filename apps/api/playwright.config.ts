import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// e2e/auth.ts mints sessions with the service role key, which lives in
// .env.local alongside the stack's URL and anon key.
dotenv.config({ path: ".env.local", quiet: true });

const PORT = 3205;
// The Expo app's web build, beside it (the e2e/client-*.spec.ts files).
const CLIENT_PORT = 8205;

// A sandbox whose preinstalled Chromium does not match this Playwright can
// point at it instead of downloading (PW_CHROMIUM=/opt/pw-browsers/chromium).
const chromium = process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {};

/**
 * E2E against the local Supabase stack (ports 54341-54344), once per row of
 * the platform matrix: the phones a house actually has, and the laptop the
 * week board is designed for. Two apps under test: the Next app on 3205 and
 * the Expo app's web build on 8205.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: process.env.CI ? 180_000 : 90_000,
  expect: { timeout: process.env.CI ? 30_000 : 15_000 },
  // No retries: green has to mean green, so a retry could only ever record
  // a trace, and a failing test's trace is kept anyway. A run with a few
  // failures stops there rather than waiting out every test's timeout.
  retries: 0,
  maxFailures: process.env.CI ? 3 : 0,
  workers: 1,
  // On CI each device runs in its own job; e2e-results.json is what the
  // `verify` job's count guard (scripts/ci/count-guard.mjs) reads to prove
  // every test ran somewhere.
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }], ["json", { outputFile: "e2e-results.json" }]]
    : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"], ...chromium } },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    // The laptop board's three-column layout starts at `lg`; this row holds it.
    {
      name: "laptop-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...chromium },
    },
  ],
  webServer: [
    {
      command: process.env.CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
      // The tick answers 401 without the secret, which is enough to know the
      // server is up.
      url: `http://localhost:${PORT}/api/cron/tick`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Exported against the same local stack (EXPO_PUBLIC_ values are baked
      // in at export), then served as Vercel serves it: serve-client.mjs
      // follows apps/client/vercel.json.
      command: `npx expo export -p web && node ../api/e2e/serve-client.mjs dist ${CLIENT_PORT} http://localhost:${PORT}`,
      cwd: "../client",
      url: `http://localhost:${CLIENT_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        EXPO_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        // No API named: as in production, the web build calls /api/* on its
        // own origin, which passes it on to the Next app beside it.
        EXPO_PUBLIC_API_URL: "",
        // Shows the style page, /style, which client-style.spec.ts checks.
        EXPO_PUBLIC_STYLE_PAGE: "1",
        // A public key made for these tests, never production's: with one, the
        // web build offers reminders, and e2e/client-web.spec.ts stands in for
        // the browser's push service.
        EXPO_PUBLIC_VAPID_PUBLIC_KEY:
          "BMFrHZeXrUELJffkpZLovnnxJr37LO27VJKlwux_3LYPhOrPPVt8Vl7h7mFLbCnxl-meHGcFuPlBOC9xwG8Ce0Q",
      },
    },
  ],
});
