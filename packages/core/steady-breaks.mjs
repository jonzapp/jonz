// The deliberate breaks: each one breaks one rule of the Steady weeks deal on
// purpose, and the tests have to fail on every one (mutation testing). They
// are the Lighter weeks simulator's 45 breaks, made to fit this code, and
// more since.
//
//   npm run breaks -w @app/core            every break
//   npm run breaks -w @app/core -- keep-day days-pile
//   npm run breaks -w @app/core -- --check only that each still fits the code
//
// Each break runs the package's tests against a copy of the package in a
// temporary folder, so the code here is never touched, even if it's stopped
// part-way. A break whose words aren't in the code any more fails the run, so
// the list can't quietly go stale. Slow (a few minutes): run it after changing
// steady.ts, steady-run.ts or repeat.ts, not on every push.

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** [id, what it breaks, file in src/, [[the code, what it becomes], …]]. */
const BREAKS = [
  ["repeat-one-each", "One each ignores who did it last time", "steady.ts", [["const lastBy = (j: SteadyJohn, id: string) =>\n      j.lastBy", "const lastBy = (j: SteadyJohn, id: string) =>\n      false && j.lastBy"]]],
  ["repeat-rest", "The rest ignores who did it last time", "steady.ts", [["const freshTo = (r: Row) => !r.lastTime ||", "const freshTo = (r: Row) => true ||"]]],
  ["days-pile", "Two Johns on one day while a day is free", "steady.ts", [["const free = (d: number) => !taken.get(d);", "const free = (d: number) => true;"]]],
  ["days-suit", "“Days that suit me” ignored", "steady.ts", [["const suits = (d: number) => !m.suits.length || m.suits.includes(d);", "const suits = (d: number) => d > 0;"]]],
  ["keep-day", "“Keep its day” moved to the next day", "steady.ts", [["p.day = j.day;\n        taken.set", "p.day = (j.day % 7) + 1;\n        taken.set"]]],
  ["oncall-day", "On call given a day instead of all week", "steady.ts", [["if (j.onCall) p.day = 0;", "if (j.onCall) p.day = j.day;"]]],
  ["rel-absolute", "Behind or ahead measured from 0, not the house average", "steady.ts", [["const r = m.balance - avg;", "const r = m.balance;"]]],
  ["no-nudge", "Targets not nudged for being behind or ahead", "steady.ts", [['const nudge = mode === "smart" && B ?', "const nudge = false ?"]]],
  ["pinned-uses-one", "A John that keeps its day uses up your one John", "steady.ts", [["if (pinnedOf(j)) pinnedDays.get(pid)!.add(j.day);\n    else own.set", "if (pinnedOf(j)) pinnedDays.get(pid)!.add(j.day);\n    own.set"]]],
  ["no-comeback", "A missed John doesn’t come back to whoever missed it", "steady.ts", [["if (homeSet.has(owner) && j.sharers.includes(owner) && j.home.includes(owner)) {", "if (owner === null) {"]]],
  ["comeback-away", "A missed John comes back even while they’re away", "steady.ts", [["if (homeSet.has(owner) && j.sharers.includes(owner) && j.home.includes(owner)) {", "if (j.sharers.includes(owner)) {"]]],
  ["makeup-full", "Someone away owes their full part, not the make-up rate", "steady-run.ts", [["      ids,\n      S.makeup,\n    );\n    const personWeeks", "      ids,\n      1,\n    );\n    const personWeeks"]]],
  ["makeup-none", "Someone away owes nothing", "steady-run.ts", [["      ids,\n      S.makeup,\n    );\n    const personWeeks", "      ids,\n      0,\n    );\n    const personWeeks"]]],
  ["leaver-stays", "Someone who moved out keeps getting Johns", "steady-run.ts", [["const present = P.filter((p) => livesThere(p, w));", "const present = P.filter((p) => p.stints[0][0] <= w);"]]],
  ["joiner-early", "Someone new gets Johns the week before they move in", "steady-run.ts", [["const present = P.filter((p) => livesThere(p, w));", "const present = P.filter((p) => livesThere(p, w) || livesThere(p, w + 1));"]]],
  ["joiner-balance", "Someone new starts behind", "steady-run.ts", [["    prevIds = ids;\n", "    prevIds = ids;\n    for (const id of joined) bal[id] = -2;\n"]]],
  ["together-one", "A John done together gets one place", "steady.ts", [["(togetherOf(j) ? (j.crew === 0 ? n : Math.min(j.crew, n)) : 1);", "(n > 0 ? 1 : 1);"]]],
  ["together-all", "“Done by two” goes to everyone", "steady.ts", [["(j.crew === 0 ? n : Math.min(j.crew, n))", "(j.crew >= 0 ? n : Math.min(j.crew, n))"]]],
  ["classic-stuck", "Classic doesn’t move on to the next person", "steady.ts", [["      q.splice(q.indexOf(to), 1);\n      q.push(to);\n      give(to", "      give(to"]]],
  ["classic-away-back", "Classic sends someone away to the back of the line", "steady.ts", [["      q.splice(q.indexOf(to), 1);\n      q.push(to);\n      give(to", "      const passed = q.slice(0, q.indexOf(to));\n      q.splice(q.indexOf(to), 1);\n      q.push(to);\n      for (const id of passed) {\n        q.splice(q.indexOf(id), 1);\n        q.push(id);\n      }\n      give(to"]]],
  ["classic-no-budget", "Classic ignores the budget", "steady.ts", [["const to = fitsFor(first) || stretches(first) ? first : inLine.slice(1).find(fitsFor);", "const to = fitsFor(first) || first ? first : inLine.slice(1).find(fitsFor);"]]],
  ["classic-no-stretch", "Classic passes a turn on as soon as it doesn’t fit", "steady.ts", [["const to = fitsFor(first) || stretches(first) ? first", "const to = fitsFor(first) ? first"]]],
  ["pools-ignored", "A group’s Johns move its members’ share of the house’s Johns", "steady.ts", [["const lead = (j: SteadyJohn, pid: string) => (usePools && B ?", "const lead = (j: SteadyJohn, pid: string) => (usePools && !B ?"], ["r.standing = (poolsOf(byId.get(pid)!)[P] ?? 0) + (poolDealt.get(`${P}|${pid}`) ?? 0) - (poolShare.get(P)?.get(pid) ?? 0);", "r.standing = byId.get(pid)!.balance + dealt.get(pid)! - (shareEst?.get(pid) ?? 0);"]]],
  ["cover-wrong-pool", "A cover is credited to the John’s owner in its group’s pool", "steady-run.ts", [["const who = i.missed ? null : (i.coveredBy ?? i.place.userId);", "const who = i.missed ? null : i.place.userId;"]]],
  ["cap-first-john", "Today’s cap can block someone’s first John (no limit)", "steady.ts", [["r.roomy = own.get(pid)! === 0 || dealt", "r.roomy = dealt"]]],
  ["no-week-off", "No week off for someone well ahead", "steady.ts", [['const weekOff = (id: string) => mode === "smart" && B > 0 &&', "const weekOff = (id: string) => B < 0 &&"]]],
  ["smart-no-budget", "Smart ignores the budget for the rest", "steady.ts", [["fits: owed(pid) || j.points <= room + EPS,", "fits: room === room,"]]],
  ["no-stretch", "A John that waited a week can’t go a little over", "steady.ts", [["if (!pool.length && wt >= 1) {", "if (!pool.length && wt < 0) {"]]],
  ["no-last-resort", "A John that waited two weeks still can’t go to whoever did it last", "steady.ts", [["if (!pool.length && (wt >= 2 || cands.length === 1)) {", "if (!pool.length && wt < 0) {"]]],
  ["wait-no-count", "Waiting never counts past one week", "steady.ts", [["nextWaited[j.johnId] = j.waited + 1;", "nextWaited[j.johnId] = 1;"]]],
  ["no-one-each", "No “one each first” step", "steady.ts", [['if (mode === "smart" && B) {\n    const roomNow', 'if (mode === "smart" && B < 0) {\n    const roomNow']]],
  ["one-each-smallest", "One each takes the smallest, not the biggest", "steady.ts", [["js.sort((x, y) => size(y, id) - size(x, id) ||", "js.sort((x, y) => size(x, id) - size(y, id) ||"]]],
  ["one-each-ahead-first", "Whoever is furthest ahead chooses first", "steady.ts", [[".sort((a, b) => rel.get(a)! - rel.get(b)! ||", ".sort((a, b) => rel.get(b)! - rel.get(a)! ||"]]],
  ["no-only-you", "A group’s John nobody else could do isn’t kept for you", "steady.ts", [["const only = pool.filter(", "const only = pool.slice(0, 0).filter("]]],
  ["groups-ignored", "A group’s John goes to anyone", "steady-run.ts", [["const sharersOf = (j: RunPreparedJohn) => ids.filter((id) => inGroup(j, id, w));", "const sharersOf = (j: RunPreparedJohn) => ids.filter((id) => inGroup(j, id, w) || id === id);"]]],
  ["least-overdue", "Least overdue Johns go first", "steady.ts", [["(a, b) => rk.get(b)! - rk.get(a)! ||", "(a, b) => rk.get(a)! - rk.get(b)! ||"]]],
  ["miss-counts", "A miss still counts as done", "steady-run.ts", [["      done[pid] -= it.pts;\n      missedTotal += it.pts;\n      back[it.name] = pid;", "      back[it.name] = pid;"]]],
  ["cover-no-credit", "A cover doesn’t move the points", "steady-run.ts", [["      done[pid] -= it.pts;\n      done[by] += it.pts;\n", ""]]],
  ["excused-as-miss", "Excused treated like a miss", "steady-run.ts", [["        it.excused = true;\n", "        it.excused = true;\n        done[pid] -= it.pts;\n        missedTotal += it.pts;\n"]]],
  ["swap-any", "A swap of a John the other person doesn’t share", "steady-run.ts", [["      if (!sharersOf(johnByName[x.johnId]).includes(b) || !sharersOf(johnByName[y.johnId]).includes(a)) continue;\n", ""]]],
  ["swap-no-points", "A swap doesn’t move the points", "steady-run.ts", [["      dealt[a] += x.points - y.points;\n      dealt[b] += y.points - x.points;\n", ""]]],
  ["rather-do-repeat", "“Rather do” still blocked by never twice running", "steady.ts", [
    ["const freshTo = (r: Row) => !r.lastTime || r.pref > 0 ||", "const freshTo = (r: Row) => !r.lastTime ||"],
    ["      !((byId.get(id)!.rather[j.johnId] ?? 0) > 0) &&\n", ""],
    ["r.lastTime && !togetherOf(j) && r.pref <= 0 ? REPEAT_COST", "r.lastTime && !togetherOf(j) ? REPEAT_COST"],
  ]],
  ["random-ties", "Ties broken at random", "steady.ts", [["const tie = (j: SteadyJohn, a: string, b: string) => stableHash(`${seed}:${j.johnId}:${a}`) - stableHash(`${seed}:${j.johnId}:${b}`);", "const tie = (j: SteadyJohn, a: string, b: string) => (j && a && b ? Math.random() - 0.5 : 0);"]]],
  ["prefs-ignored", "“Rather do” and “rather not” ignored", "steady.ts", [
    ["const pref = byId.get(pid)!.rather[j.johnId] ?? 0;", "const pref = 0;"],
    ["const size = (j: SteadyJohn, id: string) => j.points + (byId.get(id)!.rather[j.johnId] ?? 0) - lead(j, id);", "const size = (j: SteadyJohn, id: string) => (id ? j.points : 0) - lead(j, id);"],
  ]],
  ["every-n-off", "“Every 2 weeks” lands a week late", "steady-run.ts", [["return range(Math.max(from, s), to).filter((w) => landsInWeek(repeat, startsOf(w), weekStarts));", "return range(Math.max(from, s), to).filter((w) => landsInWeek(repeat, startsOf(w - 1), weekStarts));"]]],
  ["last-of-month", "“The last Sunday” can pick the one before", "repeat.ts", [["last: d + 7 > days", "last: d + 14 > days"]]],
  ["no-front", "A John that waited three weeks doesn’t go to the front", "steady.ts", [["const front = (j: SteadyJohn) => (j.waited >= FRONT_WEEKS ? 1e3 + j.waited : 0);", "const front = (j: SteadyJohn) => (j.waited >= FRONT_WEEKS * 1e9 ? 1e3 + j.waited : 0);"]]],
  ["admin-late", "An admin’s change starts a week late", "steady-run.ts", [["if (e.w !== w) continue;", "if (e.w !== w - 1) continue;"]]],
];

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const only = args.filter((a) => a !== "--check");
const chosen = only.length ? BREAKS.filter(([id]) => only.includes(id)) : BREAKS;
const unknown = only.filter((id) => !BREAKS.some(([b]) => b === id));
if (unknown.length) {
  console.error(`No such break: ${unknown.join(", ")}`);
  process.exit(2);
}

// Every break has to apply to the code as it is, exactly once, and still parse.
const source = (file) => readFileSync(join(HERE, "src", file), "utf8");
const broken = new Map();
const stale = [];
for (const [id, , file, edits] of chosen) {
  let code = source(file);
  for (const [from, to] of edits) {
    const at = code.indexOf(from);
    if (at < 0 || code.indexOf(from, at + 1) >= 0) {
      stale.push(`${id}: ${at < 0 ? "not found" : "found twice"} in ${file}: ${JSON.stringify(from.slice(0, 60))}`);
      continue;
    }
    code = code.slice(0, at) + to + code.slice(at + from.length);
  }
  const { diagnostics } = ts.transpileModule(code, { reportDiagnostics: true, fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  if (diagnostics?.length) stale.push(`${id}: doesn't parse: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, " ")}`);
  broken.set(id, code);
}
if (stale.length) {
  console.error(`These breaks no longer fit the code; make them fit again:\n  ${stale.join("\n  ")}`);
  process.exit(2);
}
if (checkOnly) {
  console.log(`All ${chosen.length} breaks fit the code.`);
  process.exit(0);
}

// A copy of the package to break, with this one's dependencies.
const dir = mkdtempSync(join(tmpdir(), "steady-breaks-"));
const copy = join(dir, "core");
for (const name of ["src", "package.json", "tsconfig.json", "vitest.config.mts"]) cpSync(join(HERE, name), join(copy, name), { recursive: true });
symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
const vitest = join(ROOT, "node_modules", "vitest", "vitest.mjs");

const missed = [];
try {
  for (const [id, what, file] of chosen) {
    const started = Date.now();
    writeFileSync(join(copy, "src", file), broken.get(id));
    const run = spawnSync(process.execPath, [vitest, "run", "--bail", "1", "--reporter", "dot"], { cwd: copy, encoding: "utf8" });
    writeFileSync(join(copy, "src", file), source(file));
    const out = `${run.stdout}\n${run.stderr}`;
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    // Caught means a test failed on it, not that the tests couldn't run.
    const failed = /Tests\s+\d+ failed/.test(out);
    if (run.status !== 0 && failed) {
      const by = out.match(/FAIL\s+(.+)/)?.[1]?.trim() ?? "a test";
      console.log(`caught  ${id} (${secs}s): ${what}\n        by ${by}`);
    } else {
      missed.push(id);
      console.log(`MISSED  ${id} (${secs}s): ${what}${run.status !== 0 ? `\n${out.slice(-1500)}` : ""}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${chosen.length - missed.length} of ${chosen.length} breaks caught.`);
if (missed.length) {
  console.log(`Not caught: ${missed.join(", ")}. Each needs a test that fails on it.`);
  process.exit(1);
}
