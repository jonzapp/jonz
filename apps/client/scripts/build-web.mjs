// Vercel builds the web app with this (vercel.json's buildCommand); locally
// `npm run export:web` is the same build.
//
// Production calls /api/* on its own origin, which vercel.json passes on to
// api.jonz.app. A preview must not: it runs on staging's database, so it
// calls staging's API, https://api.staging.jonz.app (EXPO_PUBLIC_API_URL in
// Vercel's Preview environment), cross-origin: apps/api lets staging's
// origins in through ALLOWED_ORIGINS. Every preview uses that name, never a
// PR's own preview of apps/api, so one API serves them all. To try a PR's
// API, put the PR on staging (the Staging workflow).
import { spawnSync } from "node:child_process";

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  if (env.VERCEL_ENV === "preview") {
    if (env.EXPO_PUBLIC_API_URL) console.log(`Preview: the app calls ${env.EXPO_PUBLIC_API_URL}`);
    else console.warn("Preview with no EXPO_PUBLIC_API_URL: staging isn't set up in Vercel's Preview environment yet (DEPLOYMENT.md).");
  }
  const run = spawnSync("npm", ["run", "export:web"], { stdio: "inherit", env });
  process.exit(run.status ?? 1);
}
