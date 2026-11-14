/**
 * The rules every week of every house must keep, for the deal's tests (and
 * the simulator's). Each check reads only what the deal handed out and the
 * house it was given, never the deal's own working, so a check can't agree
 * with a bug.
 */
import type { RunItem, RunPrepared, RunPreparedJohn, RunWeek } from "./steady-run-types";
import { inGroup, livesThere } from "./steady-run";

interface Check {
  id: string;
  short: string;
  label: string;
  /** Only in Smart, only in Classic, only with a budget, only over a long run. */
  smart?: boolean;
  classic?: boolean;
  budgeted?: boolean;
  long?: boolean;
}

export interface CheckResult {
  /** Check id → how many times it failed, and the first. */
  fails: Record<string, { n: number; w: number; why: string }>;
  /** The most Johns anyone had in a week. */
  maxJ: number;
  /** The share of waitable Johns' turns that came round. */
  coverage: number;
  /** How far apart balances ended. */
  spread: number;
  ratios: { name: string; own: number; set: number; want: number }[];
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

const CHECKS: Check[] = [
  { id: "home", short: "Right people", label: "Johns only go to people who live there, are home that week, and share the John" },
  { id: "budget", short: "Budget", label: "Leaving out Johns that have to go out (keep their day, done together, coming back), nobody gets more than their target, apart from their first John (half the budget over is allowed: in Smart once a John has waited, in Classic for whoever's turn it is)", budgeted: true },
  { id: "oneday", short: "One a day", label: "Nobody gets two Johns on one day while they have a free day, unless both keep that day" },
  { id: "day", short: "Keeps its day", label: "A John that keeps its day (or is done together) is on its own day, and on call is all week" },
  { id: "suits", short: "Days that suit", label: "A John goes on a day that suits the person whenever one of those days is free" },
  { id: "repeat", short: "Never twice running", label: "Nobody gets the same John twice running while someone else who shares it is home, unless they’d rather do it, it waited two weeks, came back after a miss, keeps its day, or they’re half the budget or more behind", smart: true, budgeted: true },
  { id: "back", short: "Comes back", label: "A missed John goes back to whoever missed it the next week, if they’re home" },
  { id: "together", short: "Done together", label: "A John done together has one place per person: everyone home for “everyone”, otherwise as many as it needs" },
  { id: "oncall", short: "On call", label: "Only one person is on call for a John each week" },
  { id: "waits", short: "No idle waits", label: "A John never waits two weeks running while someone who shares it is home with nothing that week (apart from a week off for someone well ahead)" },
  { id: "adds", short: "Adds up", label: "Points add up: every balance together, plus every missed point, is zero" },
  { id: "points", short: "Points from scratch", label: "Each balance moves by what that person did minus their share, worked out again from scratch: a miss counts for nobody, a cover counts for whoever covered, a swap moves the points, and someone away owes their part at the make-up rate" },
  { id: "turns", short: "Classic takes turns", label: "Classic takes turns: nobody does the same John twice running while someone else in its line was home with room for it", classic: true },
  { id: "stuck", short: "Nothing stuck", label: "Nothing waits more than 4 weeks running while someone who shares it is home, if the list fits the budget those weeks. If it doesn’t fit, a John can wait longer, but never more than 4 weeks plus 8 for every time the list is over the budget" },
  { id: "fresh", short: "Fresh starts", label: "Someone new starts at a balance of 0, and gets nothing before their first week" },
  { id: "round", short: "Comes round", label: "Every John comes round in proportion: none gets less than half the share of its turns a typical John gets (less for a group’s John, in line with how many can do it)", long: true },
  { id: "even", short: "Stays even", label: "Balances stay close: after any calm 12 weeks (no misses, covers, time away, moves or changes), they’re within twice the biggest John (plus half the budget) of each other, or closer than they started", smart: true },
];

function applies(c: Check, mode: string, B: number): boolean {
  return !(c.smart && mode !== "smart") && !(c.classic && mode !== "classic") && !(c.budgeted && !B);
}

/** What the checks remember from week to week, and what has failed so far. */
interface Watch {
  S: RunPrepared;
  J: RunPrepared["johnByName"];
  weeks: RunWeek[];
  fails: CheckResult["fails"];
  lastWeek: Record<string, number>;
  lastWho: Record<string, string>;
  /** John → week it was last missed. */
  missedAt: Record<string, number>;
  seenBefore: Set<string>;
  turnOf: Record<string, { w: number; pid: string }>;
  streak: Record<string, { from: number; n: number; due: number; room: number }>;
  classicFrom: number | null;
  bigJohn: number;
}

/** One week under the checks: who was home, and who held each John. */
interface Seen {
  all: Watch;
  wk: RunWeek;
  prevWk: RunWeek | undefined;
  homeIds: string[];
  homeSet: Set<string>;
  holders: Record<string, string[]>;
}

function fail(all: Watch, id: string, at: { w: number; why: string }) { (all.fails[id] = all.fails[id] || { n: 0, w: at.w, why: at.why }).n++; }
const bad = (c: Seen, id: string, why: string) => fail(c.all, id, { w: c.wk.w, why });
const sharersHome = (c: Seen, j: RunPreparedJohn) => c.homeIds.filter((id) => inGroup(j, id, c.wk.w));

// home (and who holds each John, for the checks on the whole week)
function checkHome(pid: string, g: RunItem[], c: Seen) {
  const { S, J } = c.all;
  const { w } = c.wk;
  for (const it of g) {
    const j = J[it.name];
    (c.holders[it.name] = c.holders[it.name] || []).push(pid);
    if (!c.homeSet.has(pid) || !inGroup(j, pid, w) || !livesThere(S.byId[pid], w)) bad(c, "home", `${it.name} went to ${pid}`);
  }
}

// budget
function checkBudget(pid: string, g: RunItem[], c: Seen) {
  const { mode, B } = c.wk;
  if (!B || !applies(CHECKS[1], mode, B)) return;
  const tgt = c.wk.target[pid];
  const must = g.filter((it) => it.pinned || it.back || it.together);
  const rest = g.filter((it) => !(it.pinned || it.back || it.together) && !it.swapped);
  const total = g.filter((it) => !it.swapped).reduce((s, it) => s + it.pts, 0);
  // Smart may go half the budget over once a John has waited; Classic for whoever's turn it is.
  const stretch = B / 2;
  const mustPts = must.reduce((s, it) => s + it.pts, 0);
  const allowed = Math.max(tgt + stretch, mustPts + (rest[0] ? rest[0].pts : 0), mustPts);
  if (rest.length >= 2 && total > allowed + 1e-9) bad(c, "budget", `${pid} had ${total} against ${allowed}`);
}

// keeps its day, on call all week
function checkDay(pid: string, g: RunItem[], c: Seen) {
  const { J } = c.all;
  const { w } = c.wk;
  for (const it of g) {
    if (it.onCall) { if (it.day !== 0) bad(c, "day", `${pid} on call for ${it.name} only on day ${it.day}`); }
    else if (it.pinned && it.day !== J[it.name].dayAt[w]) bad(c, "day", `${it.name} moved from day ${J[it.name].dayAt[w]} to ${it.day}`);
  }
}

// days that suit them: a John on another day means every day that suits them was taken
function checkSuits(pid: string, g: RunItem[], c: Seen) {
  const suitsDays = c.all.S.byId[pid].days;
  if (!suitsDays.length) return;
  for (const it of g) {
    if (it.onCall || it.pinned || suitsDays.includes(it.day)) continue;
    const free = suitsDays.filter((d) => !g.some((x) => x !== it && !x.onCall && x.day === d));
    if (free.length) bad(c, "suits", `${pid} got ${it.name} on day ${it.day} with day ${free[0]} free`);
  }
}

// one a day
function checkOneDay(pid: string, g: RunItem[], c: Seen) {
  const byDay: Record<number, RunItem[]> = {};
  for (const it of g) if (!it.onCall) (byDay[it.day] = byDay[it.day] || []).push(it);
  const freeDay = range(1, 7).some((d) => !byDay[d]);
  for (const xs of Object.values(byDay)) if (xs.length > 1 && xs.some((it) => !it.pinned) && freeDay) bad(c, "oneday", `${pid} had ${xs.map((x) => x.name).join(" and ")} on one day`);
}

// How many weeks a John waited before going to the same person again; null when the repeat is allowed anyway.
function repeatWait(it: RunItem, by: { pid: string; g: RunItem[] }, c: Seen): number | null {
  const { S, J, lastWho, lastWeek, missedAt } = c.all;
  const { wk } = c;
  const { w, B } = wk;
  const { pid, g } = by;
  const j = J[it.name];
  if (it.pinned || it.together || it.back || it.swapped || lastWho[it.name] !== pid || S.byId[pid].prefs[it.name] > 0) return null;
  if (sharersHome(c, j).length < 2) return null;
  const prev = lastWeek[it.name];
  if (missedAt[it.name] >= prev) return null;
  let dueW = prev + 1;
  for (let x = prev + 1; x <= w; x++) if (j.due.has(x)) { dueW = x; break; }
  // Allowed as someone"s only John when nothing else they share was left waiting.
  const ownJohns = g.filter((x) => !x.pinned && !x.back);
  const leftOver = wk.waiting.filter((n) => { const k = J[n]; return inGroup(k, pid, w) && lastWho[n] !== pid; });
  if (ownJohns.length === 1 && !leftOver.length) return null;
  // Allowed for someone more than half the budget behind going in: catching up comes first.
  const tp = wk.people.find((p) => p.id === pid);
  if (tp && tp.rel <= -B / 2 + 1e-9) return null;
  return w - dueW;
}

// repeats
function checkRepeat(pid: string, g: RunItem[], c: Seen) {
  if (c.wk.mode !== "smart" || !c.wk.B) return;
  for (const it of g) {
    const waited = repeatWait(it, { pid, g }, c);
    if (waited !== null && waited < 2) bad(c, "repeat", `${pid} got ${it.name} again after ${waited} weeks waiting`);
  }
}

// What one person was handed, in the order the rules are listed.
const PERSON_CHECKS = [checkHome, checkBudget, checkDay, checkSuits, checkOneDay, checkRepeat];

// back: last week"s misses
function checkBack(c: Seen) {
  const { J } = c.all;
  const { wk, prevWk } = c;
  const { w } = wk;
  if (!prevWk) return;
  for (const m of prevWk.misses) {
    if (!c.homeSet.has(m.pid) || !(J[m.name].from <= w && w <= J[m.name].until)) continue;
    if (!(wk.got[m.pid] || []).some((it) => it.name === m.name)) bad(c, "back", `${m.pid} missed ${m.name} and didn"t get it back`);
  }
}

// together and on call
function checkTogether(c: Seen) {
  for (const [name, hs] of Object.entries(c.holders)) {
    const j = c.all.J[name];
    if (j.together) {
      const n = j.crew === 0 ? sharersHome(c, j).length : Math.min(j.crew!, sharersHome(c, j).length);
      if (new Set(hs).size !== hs.length || hs.length !== n) bad(c, "together", `${name} had ${hs.length} places, wanted ${n}`);
    } else if (hs.length > 1) bad(c, j.onCall ? "oncall" : "home", `${name} went to ${hs.length} people`);
  }
}

// waits: waited last week and this week while someone who shares it was home with nothing
function checkWaits(c: Seen) {
  const { wk, prevWk } = c;
  const { mode, B } = wk;
  if (!prevWk) return;
  // Someone more than a week"s budget ahead (Smart) is having a week off.
  const off = (id: string) => { const tp = wk.people.find((p) => p.id === id); return mode === "smart" && B && tp && tp.rel > B + 1e-9; };
  for (const name of wk.waiting) {
    if (!prevWk.waiting.includes(name)) continue;
    const idle = sharersHome(c, c.all.J[name]).filter((id) => !(wk.got[id] || []).length && !off(id));
    if (idle.length) bad(c, "waits", `${name} waited while ${idle.join(", ")} had nothing`);
  }
}

// What each person did in a week, and their share of everything handed out, worked out from scratch.
function weekPoints(c: Seen) {
  const { wk, homeSet } = c;
  const { makeup } = c.all.S;
  const done: Record<string, number> = {};
  const share: Record<string, number> = {};
  wk.present.forEach((id) => { done[id] = 0; share[id] = 0; });
  for (const [pid, g] of Object.entries(wk.got)) for (const it of g) {
    if (it.coveredBy) done[it.coveredBy] += it.pts; else if (!it.missed) done[pid] += it.pts;
    const sh = it.sharers.filter((id) => wk.present.includes(id));
    const home = sh.filter((id) => homeSet.has(id)), away = sh.filter((id) => !homeSet.has(id));
    if (!home.length) continue;
    const part = it.pts / sh.length;
    away.forEach((id) => (share[id] += part * makeup));
    home.forEach((id) => (share[id] += (it.pts - part * makeup * away.length) / home.length));
  }
  return { done, share };
}

// points, from scratch: what each person did, minus their share of everything handed out
function checkPoints(c: Seen) {
  const { wk, prevWk } = c;
  const { done, share } = weekPoints(c);
  const before: Record<string, number> = prevWk ? prevWk.bal : {};
  for (const id of wk.present) {
    const want = (before[id] || 0) + done[id] - share[id];
    if (Math.abs(wk.bal[id] - want) > 1e-6) { bad(c, "points", `${id} ended at ${wk.bal[id].toFixed(2)}, should be ${want.toFixed(2)} (did ${done[id]}, share ${share[id].toFixed(2)})`); break; }
  }
}

// Someone else in a John"s line who was home all along with room for it, when the same person did it twice running.
function passedOver(it: RunItem, by: { pid: string; prev: { w: number } }, c: Seen): string | undefined {
  const { wk } = c;
  const { weeks, J } = c.all;
  const stayed = (id: string) => weeks.slice(by.prev.w - 1, wk.w).every((x) => x.present.includes(id));
  const room = (id: string) => { const own = (wk.got[id] || []).filter((x) => !x.pinned); return !own.length || wk.dealt[id] + it.pts <= wk.target[id] + 1e-9; };
  return sharersHome(c, J[it.name]).find((id) => id !== by.pid && stayed(id) && !(wk.got[id] || []).some((x) => x.swapped) && room(id));
}

// Classic takes turns: the same person twice running only if nobody else in its line was home with room
function checkTurns(c: Seen) {
  const { all, wk, prevWk } = c;
  const { turnOf } = all;
  const { w } = wk;
  if (wk.mode !== "classic") return;
  if (all.classicFrom === null || (prevWk && prevWk.mode !== "classic")) all.classicFrom = w;
  for (const [pid, g] of Object.entries(wk.got)) for (const it of g) {
    if (it.together || it.back) continue;
    const prev = turnOf[it.name];
    if (it.swapped) { delete turnOf[it.name]; continue; }
    turnOf[it.name] = { w, pid };
    if (!prev || prev.pid !== pid || prev.w < all.classicFrom) continue;
    const other = passedOver(it, { pid, prev }, c);
    if (other) bad(c, "turns", `${pid} did ${it.name} again while ${other} was home with room`);
  }
}

// stuck: how long each John has waited in a row while someone who shares it was home
function checkStuck(c: Seen) {
  const { S, J, streak } = c.all;
  const { wk, homeIds } = c;
  const { w, B } = wk;
  for (const n of Object.keys(streak)) if (!wk.waiting.includes(n)) delete streak[n];
  for (const n of wk.waiting) {
    if (!sharersHome(c, J[n]).length) { delete streak[n]; continue; }
    const st = streak[n] = streak[n] || { from: w, n: 0, due: 0, room: 0 };
    st.n++;
    if (B) {
      st.due += S.johns.filter((k) => k.due.has(w) && k.from <= w && w <= k.until).reduce((s2, k) => s2 + k.ptsAt[w] * (k.together ? (k.crew || sharersHome(c, k).length) : 1), 0);
      st.room += homeIds.length * B;
    }
    const over = st.room ? st.due / st.room : 0;
    const limit = over <= 1 ? 4 : 4 + 8 * over;
    if (st.n > limit) { bad(c, "stuck", `${n} waited ${st.n} weeks from week ${st.from}, list ${over.toFixed(1)}× the budget`); delete streak[n]; }
  }
}

// adds up
function checkAdds(c: Seen) {
  const { wk } = c;
  const sum = Object.values(wk.bal).reduce((a, b) => a + b, 0);
  if (Math.abs(sum + wk.missedTotal) > 1e-6) bad(c, "adds", `balances sum to ${sum.toFixed(3)}, missed ${wk.missedTotal}`);
}

// fresh starts
function checkFresh(c: Seen) {
  const { wk } = c;
  const { seenBefore } = c.all;
  for (const id of wk.present) if (!seenBefore.has(id)) {
    seenBefore.add(id);
    const tp = wk.people.find((p) => p.id === id);
    if (tp && Math.abs(tp.bal) > 1e-9) bad(c, "fresh", `${id} started at ${tp.bal}`);
  }
  for (const id of Object.keys(wk.got)) if (!wk.present.includes(id) && wk.got[id].length) bad(c, "fresh", `${id} got Johns before moving in`);
}

// even (Smart): over any calm 12 weeks (nobody missed, covered, was away, moved in or out, no admin changes, Smart
// throughout), balances end within twice the biggest John of each other, or closer than they started.
function checkEven(c: Seen) {
  const { wk } = c;
  const { weeks, bigJohn } = c.all;
  const { w } = wk;
  if (w <= 12) return;
  const win = weeks.slice(w - 12, w);
  const calm = win.every((x) => x.mode === "smart" && !x.misses.length && !x.covers.length && !x.away.length && !x.joined.length && !x.left.length && !x.changes.length);
  if (!calm) return;
  const spread = (x: RunWeek) => { const v = x.present.map((id) => x.bal[id]); return Math.max(...v) - Math.min(...v); };
  const start = spread(weeks[w - 13]), now = spread(wk);
  const bound = 2 * bigJohn + (wk.B ? wk.B / 2 : 0);
  if (now > Math.max(bound, start - 1) + 1e-9) bad(c, "even", `spread ${now.toFixed(1)} after a calm 12 weeks that started at ${start.toFixed(1)}`);
}

// One week against every weekly rule. Mode and budget come from the week, so admin changes mid-run are checked too.
function checkWeek(wk: RunWeek, all: Watch) {
  const { w } = wk;
  const homeIds = wk.present.filter((id) => !wk.away.includes(id));
  const c: Seen = { all, wk, prevWk: all.weeks[w - 2], homeIds, homeSet: new Set(homeIds), holders: {} };
  for (const [pid, g] of Object.entries(wk.got)) for (const rule of PERSON_CHECKS) rule(pid, g, c);
  checkBack(c);
  checkTogether(c);
  checkWaits(c);
  checkPoints(c);
  checkTurns(c);
  checkStuck(c);
  checkAdds(c);
  checkFresh(c);
  for (const m of wk.misses) all.missedAt[m.name] = w;
  checkEven(c);
  for (const [pid, g] of Object.entries(wk.got)) for (const it of g) { all.lastWeek[it.name] = w; all.lastWho[it.name] = pid; }
}

// How many turns each John was set, and how many came round, over the run.
function turnsOver({ S, J, weeks }: Watch) {
  const set: Record<string, number> = {};
  const came: Record<string, number> = {};
  for (const j of S.johns) set[j.name] = [...j.due].filter((x) => x <= weeks.length).length;
  // A turn came round when it was dealt (a comeback is the same turn again; a John done together counts once).
  for (const wk of weeks) {
    const seen = new Set<string>();
    for (const g of Object.values(wk.got)) for (const it of g) {
      if (it.back || seen.has(it.name)) continue;
      if (J[it.name].together) seen.add(it.name);
      came[it.name] = (came[it.name] || 0) + 1;
    }
  }
  return { set, came };
}

// round: each John"s share of its turns against the house"s overall share, for Johns set at least 4 times
function checkRound(all: Watch): Pick<CheckResult, "coverage" | "ratios"> {
  const { S, weeks } = all;
  const { set, came } = turnsOver(all);
  // Johns that keep their day or are done together always go out, so only Johns that can wait are compared, each
  // against the overall share scaled by how much of the house can do it (a group"s John has fewer hands).
  const waitable = S.johns.filter((j) => !j.pinned && set[j.name] > 0);
  const totalSet = waitable.reduce((s, j) => s + set[j.name], 0);
  const totalCame = waitable.reduce((s, j) => s + Math.min(came[j.name] || 0, set[j.name]), 0);
  const overall = totalSet ? totalCame / totalSet : 1;
  const hands = (j: RunPreparedJohn) => { let a = 0, n = 0; for (const wk of weeks) if (j.due.has(wk.w) && wk.present.length) { a += wk.present.filter((id) => inGroup(j, id, wk.w)).length / wk.present.length; n++; } return n ? a / n : 1; };
  // Compared with a typical John: the lower of the median and the overall share of turns, so neither a few small
  // Johns that fit in leftover room nor a few that rarely fit move the bar.
  const shareOf = (j: RunPreparedJohn) => Math.min(came[j.name] || 0, set[j.name]) / set[j.name];
  const counted = waitable.filter((j) => set[j.name] >= 4);
  const sorted = counted.map(shareOf).sort((a, b) => a - b);
  const median = sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : 1;
  const typical = Math.min(median, overall);
  const ratios: { name: string; own: number; set: number; want: number }[] = [];
  for (const j of counted) {
    const own = shareOf(j);
    const want = (typical / 2) * Math.min(1, hands(j));
    ratios.push({ name: j.name, own, set: set[j.name], want });
    if (set[j.name] * want < 2) continue; // too few turns to expect two at that rate
    if (weeks.length >= 26 && own < want - 1e-9) fail(all, "round", { w: weeks.length, why: `${j.name} came round ${(own * 100).toFixed(0)}% against ${(typical * 100).toFixed(0)}% for a typical John` });
  }
  return { coverage: overall, ratios };
}

// `res` is what run() returned.
export function check(res: { prepared: RunPrepared; weeks: RunWeek[] }): CheckResult {
  const { prepared: S, weeks } = res;
  const all: Watch = {
    S,
    J: S.johnByName,
    weeks,
    fails: {},
    lastWeek: {},
    lastWho: {},
    missedAt: {},
    seenBefore: new Set(),
    turnOf: {},
    streak: {},
    classicFrom: null,
    bigJohn: Math.max(...S.johns.map((j) => Math.max(...Object.values(j.ptsAt).concat([j.pts])))),
  };
  for (const wk of weeks) checkWeek(wk, all);
  const round = checkRound(all);

  const maxJ = Math.max(0, ...weeks.flatMap((wk) => Object.values(wk.got).map((g) => g.length)));
  const end = weeks[weeks.length - 1];
  const v = end.present.map((id) => end.bal[id]);
  return { fails: all.fails, maxJ, coverage: round.coverage, spread: v.length ? Math.max(...v) - Math.min(...v) : 0, ratios: round.ratios };
}
