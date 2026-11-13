/**
 * The rules every week of every house must keep, for the deal's tests (and
 * the simulator's). Each check reads only what the deal handed out and the
 * house it was given, never the deal's own working, so a check can't agree
 * with a bug.
 */
import type { RunItem, RunPrepared, RunPreparedJohn, RunWeek } from "./steady-run";
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

// `res` is what run() returned. Mode and budget come from each week, so admin changes mid-run are checked too.
export function check(res: { prepared: RunPrepared; weeks: RunWeek[] }): CheckResult {
  const { prepared: S, weeks } = res;
  const J = S.johnByName;
  const fails: Record<string, { n: number; w: number; why: string }> = {};
  const bad = (id: string, w: number, why: string) => { (fails[id] = fails[id] || { n: 0, w, why }).n++; };
  const lastWeek: Record<string, number> = {};
  const lastWho: Record<string, string> = {};
  const missedAt: Record<string, number> = {}; // John → week it was last missed
  const seenBefore = new Set<string>();
  const turnOf: Record<string, { w: number; pid: string }> = {};
  const streak: Record<string, { from: number; n: number; due: number; room: number }> = {};
  let classicFrom: number | null = null;
  const bigJohn = Math.max(...S.johns.map((j) => Math.max(...Object.values(j.ptsAt).concat([j.pts]))));

  for (const wk of weeks) {
    const { w, mode, B } = wk;
    const homeIds = wk.present.filter((id) => !wk.away.includes(id));
    const homeSet = new Set(homeIds);
    const sharersHome = (j: RunPreparedJohn) => homeIds.filter((id) => inGroup(j, id, w));
    const holders: Record<string, string[]> = {};

    for (const [pid, g] of Object.entries(wk.got)) {
      const tgt = wk.target[pid];
      for (const it of g) {
        const j = J[it.name];
        (holders[it.name] = holders[it.name] || []).push(pid);
        // home
        if (!homeSet.has(pid) || !inGroup(j, pid, w) || !livesThere(S.byId[pid], w)) bad("home", w, `${it.name} went to ${pid}`);
      }
      // budget
      if (B && applies(CHECKS[1], mode, B)) {
        const must = g.filter((it) => it.pinned || it.back || it.together);
        const rest = g.filter((it) => !(it.pinned || it.back || it.together) && !it.swapped);
        const total = g.filter((it) => !it.swapped).reduce((s, it) => s + it.pts, 0);
        // Smart may go half the budget over once a John has waited; Classic for whoever's turn it is.
        const stretch = B / 2;
        const mustPts = must.reduce((s, it) => s + it.pts, 0);
        const allowed = Math.max(tgt + stretch, mustPts + (rest[0] ? rest[0].pts : 0), mustPts);
        if (rest.length >= 2 && total > allowed + 1e-9) bad("budget", w, `${pid} had ${total} against ${allowed}`);
      }
      // keeps its day, on call all week
      for (const it of g) {
        if (it.onCall) { if (it.day !== 0) bad("day", w, `${pid} on call for ${it.name} only on day ${it.day}`); }
        else if (it.pinned && it.day !== J[it.name].dayAt[w]) bad("day", w, `${it.name} moved from day ${J[it.name].dayAt[w]} to ${it.day}`);
      }
      // days that suit them: a John on another day means every day that suits them was taken
      const suitsDays = S.byId[pid].days;
      if (suitsDays.length) for (const it of g) {
        if (it.onCall || it.pinned || suitsDays.includes(it.day)) continue;
        const free = suitsDays.filter((d) => !g.some((x) => x !== it && !x.onCall && x.day === d));
        if (free.length) bad("suits", w, `${pid} got ${it.name} on day ${it.day} with day ${free[0]} free`);
      }
      // one a day
      const byDay: Record<number, RunItem[]> = {};
      for (const it of g) if (!it.onCall) (byDay[it.day] = byDay[it.day] || []).push(it);
      const freeDay = range(1, 7).some((d) => !byDay[d]);
      for (const xs of Object.values(byDay)) if (xs.length > 1 && xs.some((it) => !it.pinned) && freeDay) bad("oneday", w, `${pid} had ${xs.map((x) => x.name).join(" and ")} on one day`);
      // repeats
      if (mode === "smart" && B) for (const it of g) {
        const j = J[it.name];
        if (it.pinned || it.together || it.back || it.swapped || lastWho[it.name] !== pid || S.byId[pid].prefs[it.name] > 0) continue;
        if (sharersHome(j).length < 2) continue;
        const prev = lastWeek[it.name];
        if (missedAt[it.name] >= prev) continue;
        let dueW = prev + 1;
        for (let x = prev + 1; x <= w; x++) if (j.due.has(x)) { dueW = x; break; }
        // Allowed as someone"s only John when nothing else they share was left waiting.
        const ownJohns = g.filter((x) => !x.pinned && !x.back);
        const leftOver = wk.waiting.filter((n) => { const k = J[n]; return inGroup(k, pid, w) && lastWho[n] !== pid; });
        if (ownJohns.length === 1 && !leftOver.length) continue;
        // Allowed for someone more than half the budget behind going in: catching up comes first.
        const tp = wk.people.find((p) => p.id === pid);
        if (tp && tp.rel <= -B / 2 + 1e-9) continue;
        if (w - dueW < 2) bad("repeat", w, `${pid} got ${it.name} again after ${w - dueW} weeks waiting`);
      }
    }
    // back: last week"s misses
    const prevWk = weeks[w - 2];
    if (prevWk) for (const m of prevWk.misses) {
      if (!homeSet.has(m.pid) || !(J[m.name].from <= w && w <= J[m.name].until)) continue;
      if (!(wk.got[m.pid] || []).some((it) => it.name === m.name)) bad("back", w, `${m.pid} missed ${m.name} and didn"t get it back`);
    }
    // together and on call
    for (const [name, hs] of Object.entries(holders)) {
      const j = J[name];
      if (j.together) {
        const n = j.crew === 0 ? sharersHome(j).length : Math.min(j.crew!, sharersHome(j).length);
        if (new Set(hs).size !== hs.length || hs.length !== n) bad("together", w, `${name} had ${hs.length} places, wanted ${n}`);
      } else if (hs.length > 1) bad(j.onCall ? "oncall" : "home", w, `${name} went to ${hs.length} people`);
    }
    // waits: waited last week and this week while someone who shares it was home with nothing
    if (prevWk) for (const name of wk.waiting) {
      if (!prevWk.waiting.includes(name)) continue;
      const j = J[name];
      // Someone more than a week"s budget ahead (Smart) is having a week off.
      const off = (id: string) => { const tp = wk.people.find((p) => p.id === id); return mode === "smart" && B && tp && tp.rel > B + 1e-9; };
      const idle = sharersHome(j).filter((id) => !(wk.got[id] || []).length && !off(id));
      if (idle.length) bad("waits", w, `${name} waited while ${idle.join(", ")} had nothing`);
    }
    // points, from scratch: what each person did, minus their share of everything handed out
    {
      const done: Record<string, number> = {};
    const share: Record<string, number> = {};
      wk.present.forEach((id) => { done[id] = 0; share[id] = 0; });
      for (const [pid, g] of Object.entries(wk.got)) for (const it of g) {
        if (it.coveredBy) done[it.coveredBy] += it.pts; else if (!it.missed) done[pid] += it.pts;
        const sh = it.sharers.filter((id) => wk.present.includes(id));
        const home = sh.filter((id) => homeSet.has(id)), away = sh.filter((id) => !homeSet.has(id));
        if (!home.length) continue;
        const part = it.pts / sh.length;
        away.forEach((id) => (share[id] += part * S.makeup));
        home.forEach((id) => (share[id] += (it.pts - part * S.makeup * away.length) / home.length));
      }
      const before: Record<string, number> = prevWk ? prevWk.bal : {};
      for (const id of wk.present) {
        const want = (before[id] || 0) + done[id] - share[id];
        if (Math.abs(wk.bal[id] - want) > 1e-6) { bad("points", w, `${id} ended at ${wk.bal[id].toFixed(2)}, should be ${want.toFixed(2)} (did ${done[id]}, share ${share[id].toFixed(2)})`); break; }
      }
    }
    // Classic takes turns: the same person twice running only if nobody else in its line was home with room
    if (mode === "classic") {
      if (classicFrom === null || (prevWk && prevWk.mode !== "classic")) classicFrom = w;
      for (const [pid, g] of Object.entries(wk.got)) for (const it of g) {
        if (it.together || it.back) continue;
        const prev = turnOf[it.name];
        if (it.swapped) { delete turnOf[it.name]; continue; }
        turnOf[it.name] = { w, pid };
        if (!prev || prev.pid !== pid || prev.w < classicFrom) continue;
        const j = J[it.name];
        const stayed = (id: string) => weeks.slice(prev.w - 1, w).every((x) => x.present.includes(id));
        const room = (id: string) => { const own = (wk.got[id] || []).filter((x) => !x.pinned); return !own.length || wk.dealt[id] + it.pts <= wk.target[id] + 1e-9; };
        const other = sharersHome(j).find((id) => id !== pid && stayed(id) && !(wk.got[id] || []).some((x) => x.swapped) && room(id));
        if (other) bad("turns", w, `${pid} did ${it.name} again while ${other} was home with room`);
      }
    }
    // stuck: how long each John has waited in a row while someone who shares it was home
    for (const n of Object.keys(streak)) if (!wk.waiting.includes(n)) delete streak[n];
    for (const n of wk.waiting) {
      if (!sharersHome(J[n]).length) { delete streak[n]; continue; }
      const st = streak[n] = streak[n] || { from: w, n: 0, due: 0, room: 0 };
      st.n++;
      if (B) {
        st.due += S.johns.filter((k) => k.due.has(w) && k.from <= w && w <= k.until).reduce((s2, k) => s2 + k.ptsAt[w] * (k.together ? (k.crew || sharersHome(k).length) : 1), 0);
        st.room += homeIds.length * B;
      }
      const over = st.room ? st.due / st.room : 0;
      const limit = over <= 1 ? 4 : 4 + 8 * over;
      if (st.n > limit) { bad("stuck", w, `${n} waited ${st.n} weeks from week ${st.from}, list ${over.toFixed(1)}× the budget`); delete streak[n]; }
    }
    // adds up
    const sum = Object.values(wk.bal).reduce((a, b) => a + b, 0);
    if (Math.abs(sum + wk.missedTotal) > 1e-6) bad("adds", w, `balances sum to ${sum.toFixed(3)}, missed ${wk.missedTotal}`);
    // fresh starts
    for (const id of wk.present) if (!seenBefore.has(id)) {
      seenBefore.add(id);
      const tp = wk.people.find((p) => p.id === id);
      if (tp && Math.abs(tp.bal) > 1e-9) bad("fresh", w, `${id} started at ${tp.bal}`);
    }
    for (const id of Object.keys(wk.got)) if (!wk.present.includes(id) && wk.got[id].length) bad("fresh", w, `${id} got Johns before moving in`);
    // even (Smart): over any calm 12 weeks (nobody missed, covered, was away, moved in or out, no admin changes, Smart
    // throughout), balances end within twice the biggest John of each other, or closer than they started.
    for (const m of wk.misses) missedAt[m.name] = w;
    if (w > 12) {
      const win = weeks.slice(w - 12, w);
      const calm = win.every((x) => x.mode === "smart" && !x.misses.length && !x.covers.length && !x.away.length && !x.joined.length && !x.left.length && !x.changes.length);
      if (calm) {
        const spread = (x: RunWeek) => { const v = x.present.map((id) => x.bal[id]); return Math.max(...v) - Math.min(...v); };
        const start = spread(weeks[w - 13]), now = spread(wk);
        const bound = 2 * bigJohn + (wk.B ? wk.B / 2 : 0);
        if (now > Math.max(bound, start - 1) + 1e-9) bad("even", w, `spread ${now.toFixed(1)} after a calm 12 weeks that started at ${start.toFixed(1)}`);
      }
    }
    for (const [pid, g] of Object.entries(wk.got)) for (const it of g) { lastWeek[it.name] = w; lastWho[it.name] = pid; }
  }

  // round: each John"s share of its turns against the house"s overall share, for Johns set at least 4 times
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
    if (weeks.length >= 26 && own < want - 1e-9) bad("round", weeks.length, `${j.name} came round ${(own * 100).toFixed(0)}% against ${(typical * 100).toFixed(0)}% for a typical John`);
  }

  const maxJ = Math.max(0, ...weeks.flatMap((wk) => Object.values(wk.got).map((g) => g.length)));
  const end = weeks[weeks.length - 1];
  const v = end.present.map((id) => end.bal[id]);
  return { fails, maxJ, coverage: overall, spread: v.length ? Math.max(...v) - Math.min(...v) : 0, ratios };
}

