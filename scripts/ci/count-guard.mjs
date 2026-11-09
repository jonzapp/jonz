#!/usr/bin/env node
/**
 * CI's count guard: proves the parallel jobs ran every test there is.
 *
 * CI runs the database tests in shards and the end-to-end tests one job per
 * device (.github/workflows/ci.yml). A test that no job picks up (a device
 * missing from the matrix, a shard flag that drops files, a run that stopped
 * early) would pass silently, so the `verify` job runs this over every job's
 * report and fails when anything that exists did not run.
 *
 *   node scripts/ci/count-guard.mjs e2e <listed.json> <device report.json>...
 *     listed.json: `playwright test --list --reporter=json` (every test, every device)
 *   node scripts/ci/count-guard.mjs db <root> <shard report.json>...
 *     root: the repo; every tests/db/**\/*.test.ts under it must appear in a shard's report
 *
 * Exit 0 with a summary when everything ran; exit 1 naming what did not.
 */
import { appendFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Every Playwright test in a JSON report, keyed by device, file and title path. */
export function playwrightTests(report) {
  const out = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        out.push({
          key: `${test.projectName} › ${spec.file} › ${[...titles, spec.title].join(" › ")}`,
          ran: (test.results ?? []).length > 0,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, child.file === child.title ? titles : [...titles, child.title]);
  };
  for (const file of report.suites ?? []) walk(file, []);
  return out;
}

/** What `--list` names that no device report ran. */
export function missingE2e(listed, reports) {
  const ran = new Set(reports.flatMap((r) => playwrightTests(r).filter((t) => t.ran).map((t) => t.key)));
  const expected = playwrightTests(listed).map((t) => t.key);
  return { expected: expected.length, ran: ran.size, missing: expected.filter((k) => !ran.has(k)) };
}

/** Test files Vitest reports, relative to the repo, with how many tests each ran. */
export function vitestFiles(report, root) {
  return (report.testResults ?? []).map((f) => ({
    file: relative(root, f.name),
    tests: (f.assertionResults ?? []).length,
  }));
}

/** Database test files that exist but are in no shard's report. */
export function missingDb(existing, reports, root) {
  const files = reports.flatMap((r) => vitestFiles(r, root));
  const seen = new Set(files.map((f) => f.file));
  return {
    expected: existing.length,
    ran: seen.size,
    tests: files.reduce((n, f) => n + f.tests, 0),
    missing: existing.filter((f) => !seen.has(f)),
  };
}

/** Every tests/db/**\/*.test.ts under the workspaces that have database tests. */
export function dbTestFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".test.ts")) out.push(relative(root, path));
    }
  };
  for (const ws of ["apps", "packages"]) {
    for (const name of readdirSync(join(root, ws))) {
      const dir = join(root, ws, name, "tests", "db");
      try {
        if (statSync(dir).isDirectory()) walk(dir);
      } catch {
        // no database tests in this workspace
      }
    }
  }
  return out.sort();
}

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function main([kind, first, ...reports]) {
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  if (kind === "e2e" && first && reports.length) {
    const { expected, ran, missing } = missingE2e(read(first), reports.map(read));
    summary(`End-to-end: ${ran} of ${expected} tests ran across ${reports.length} device jobs.`);
    if (missing.length) {
      console.error(`::error title=End-to-end tests that no job ran::${missing.length} missing`);
      for (const m of missing) console.error(`  missing: ${m}`);
      return 1;
    }
    return 0;
  }
  if (kind === "db" && first && reports.length) {
    const root = resolve(first);
    const { expected, ran, tests, missing } = missingDb(dbTestFiles(root), reports.map(read), root);
    summary(`Database: ${ran} of ${expected} files (${tests} tests) ran across ${reports.length} reports.`);
    if (missing.length) {
      console.error(`::error title=Database test files that no shard ran::${missing.length} missing`);
      for (const m of missing) console.error(`  missing: ${m}`);
      return 1;
    }
    return 0;
  }
  console.error("usage: count-guard.mjs e2e <listed.json> <report.json>... | db <root> <report.json>...");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
