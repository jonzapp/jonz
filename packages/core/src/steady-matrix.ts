import type { RunHouse, RunJohn, Sched } from "./steady-run-types";
import { periodOf } from "./steady-run";
import { LAST, mo, MPerson, range, wk } from "./steady-houses";

// Houses made by rule for the deal tests: one per row of the mechanism matrix
// (every pair of mechanisms meets in some house) and seeded random ones.

// ---- Seeded random numbers: the same seed, the same numbers, everywhere ----
function mulberry(a: number): () => number { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES = ["You", "Ada", "Sam", "Priya", "Tom", "Mo", "Lena", "Kit", "Ola"];

// ---- The mechanism matrix ----
// Each mechanism and the ways it can be. Every pair of values from two different mechanisms is in at least
// one house, and each house runs in both modes at every budget.
export const MECHANISMS: { id: string; label: string; values: string[] }[] = [
  { id: "size", label: "People", values: ["1", "2", "3", "5", "8"] },
  { id: "load", label: "How much the list needs", values: ["under the budget", "about the budget", "twice the budget", "four times the budget"] },
  { id: "sizes", label: "John sizes", values: ["mixed", "only big (4 to 5)", "only small (1 to 2)"] },
  { id: "sched", label: "Schedules", values: ["weekly", "every few weeks", "monthly and last of the month", "yearly and twice a year"] },
  { id: "keep", label: "Keeps its day", values: ["none", "some", "two on the same day"] },
  { id: "together", label: "Done together", values: ["none", "everyone home", "two people"] },
  { id: "oncall", label: "On call", values: ["none", "one on-call John"] },
  { id: "groups", label: "Groups", values: ["whole house", "a John for half the house"] },
  { id: "prefs", label: "Preferences", values: ["none", "days that suit", "rather do and rather not", "everyone rather not the same John"] },
  { id: "away", label: "Time away", values: ["none", "odd weeks", "a six-week trip", "everyone away together"] },
  { id: "makeup", label: "Away made up", values: ["in full", "half", "none"] },
  { id: "people", label: "Moving in and out", values: ["nobody", "someone joins", "someone leaves", "leaves and comes back", "one leaves as another joins"] },
  { id: "misses", label: "Misses", values: ["none", "now and then", "one person keeps missing", "misses the comeback too"] },
  { id: "covers", label: "Covers and excused", values: ["none", "covers", "excused"] },
  { id: "admin", label: "Admin changes", values: ["none", "budget changes", "mode switches", "John added", "John removed", "points change", "schedule changes"] },
  { id: "swaps", label: "Swaps", values: ["none", "a swap now and then"] },
];

// Greedy pairwise cover (deterministic): each new row is the candidate, of 60 seeded tries, that covers the most
// pairs not yet covered. Stops when every pair is covered.
export function pairwise(dims: { values: string[] }[], seed = 1): number[][] {
  const r = mulberry(seed);
  const key = (a: number, x: number, b: number, y: number) => `${a}:${x}|${b}:${y}`;
  const left = new Set<string>();
  dims.forEach((A, a) => dims.forEach((Bd, b) => { if (b > a) A.values.forEach((_, x) => Bd.values.forEach((__, y) => left.add(key(a, x, b, y)))); }));
  const rows: number[][] = [];
  while (left.size) {
    let best: { row: number[]; gain: number } | null = null;
    for (let t = 0; t < 60; t++) {
      // Start from one uncovered pair so every row makes progress, then fill the rest greedily.
      const [first] = left;
      const [p1, p2] = first.split("|");
      const [a, x] = p1.split(":").map(Number), [b, y] = p2.split(":").map(Number);
      const row = dims.map(() => -1); row[a] = x; row[b] = y;
      // A seeded shuffle (Fisher–Yates). Never sort with a random comparator: engines sort differently.
      const orderDims = dims.map((_, i) => i).filter((i) => row[i] < 0);
      for (let i = orderDims.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [orderDims[i], orderDims[k]] = [orderDims[k], orderDims[i]]; }
      for (const d of orderDims) {
        let bv = 0, bs = -1;
        dims[d].values.forEach((_, v) => {
          let s = 0;
          row.forEach((rv, e) => { if (rv >= 0 && e !== d && left.has(e < d ? key(e, rv, d, v) : key(d, v, e, rv))) s++; });
          s += r() * 0.5;
          if (s > bs) { bs = s; bv = v; }
        });
        row[d] = bv;
      }
      let gain = 0;
      row.forEach((x1, a1) => row.forEach((y1, b1) => { if (b1 > a1 && left.has(key(a1, x1, b1, y1))) gain++; }));
      if (!best || gain > best.gain) best = { row, gain };
    }
    const chosen = best!.row;
    chosen.forEach((x1, a1) => chosen.forEach((y1, b1) => { if (b1 > a1) left.delete(key(a1, x1, b1, y1)); }));
    rows.push(chosen);
  }
  return rows;
}

/** A matrix house as it's made: its row's values, its seeded numbers, and the people and Johns so far. */
interface Making {
  /** The row's value for each mechanism, by id. */
  v: Record<string, string>;
  /** The house's seeded random numbers: every stage draws from them in turn, so the stages keep their order. */
  r: () => number;
  pick: <T>(xs: T[]) => T;
  /** How many people it starts with. */
  n: number;
  /** How many weeks it runs. */
  W: number;
  /** A week part of the way through the run. */
  at: (f: number) => number;
  people: MPerson[];
  /** Someone who can move in. */
  extra: MPerson;
  johns: RunJohn[];
}

// Johns: enough to need the chosen multiple of a Usual budget (4 points each), then the ones a mechanism adds.
function matrixJohns({ v, r, pick, n, people, johns }: Making) {
  const want = ({ "under the budget": 0.6, "about the budget": 1, "twice the budget": 2, "four times the budget": 4 } as Record<string, number>)[v.load] * 4 * Math.max(n, 1);
  const ptsOf = () => (v.sizes === "only big (4 to 5)" ? 4 + Math.floor(r() * 2) : v.sizes === "only small (1 to 2)" ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 5));
  const schedOf = (i: number): Sched => {
    if (v.sched === "weekly") return wk(1);
    if (v.sched === "every few weeks") return i % 3 === 0 ? wk(1) : wk(pick([2, 3, 4, 6, 8]), 1 + Math.floor(r() * 4));
    if (v.sched === "monthly and last of the month") return i % 3 === 0 ? wk(1) : mo(pick([1, 1, 2, 3]), pick([1, 2, 3, 4, LAST]));
    return i % 3 === 0 ? wk(1) : i % 3 === 1 ? mo(pick([6, 12]), pick([1, 2, LAST]), 1 + Math.floor(r() * 30)) : wk(pick([2, 4]));
  };
  let need = 0;
  for (let i = 1; need < want || johns.length < 3; i++) {
    const sched = schedOf(i);
    const j: RunJohn = { name: "John " + i, pts: ptsOf(), day: 1 + Math.floor(r() * 7), sched };
    johns.push(j);
    need += j.pts / periodOf(sched);
    if (johns.length >= 24) break;
  }
  const weeklyish = johns.filter((j) => j.sched && !("months" in j.sched) && j.sched.every <= 2);
  if (v.keep === "some") weeklyish.slice(0, 2).forEach((j) => (j.fixed = true));
  if (v.keep === "two on the same day") {
    johns.push({ name: "Bins", pts: 1, day: 3, sched: wk(1), fixed: true });
    johns.push({ name: "Recycling", pts: 1, day: 3, sched: wk(1), fixed: true });
  }
  if (v.together === "everyone home") johns.push({ name: "Garden together", pts: 3, day: 6, sched: wk(2, 1), crew: 0 });
  if (v.together === "two people") johns.push({ name: "Big shop for two", pts: 2, day: 7, sched: wk(1), crew: 2 });
  if (v.oncall !== "none") johns.push({ name: "Dishwasher (on call)", pts: 3, day: 1, onCall: true });
  if (v.groups !== "whole house" && n >= 2) johns.push({ name: "Upstairs bathroom", pts: 3, day: 3, sched: wk(1), group: people.map((p) => p.id).slice(0, Math.ceil(n / 2)) });
}

// What people would rather, and who moves in and out (scaled to the run).
function matrixPeople({ v, r, n, at, people, extra, johns }: Making) {
  if (v.prefs === "days that suit") people.forEach((p) => (p.days = range(1, 7).filter(() => r() < 0.45)));
  if (v.prefs === "rather do and rather not") people.forEach((p) => johns.forEach((j) => { const x = r(); if (x < 0.15) p.prefs[j.name] = 1; else if (x < 0.3) p.prefs[j.name] = -1; }));
  if (v.prefs === "everyone rather not the same John") people.forEach((p) => (p.prefs[johns[0].name] = -1));
  if (v.people === "someone joins") people.push({ ...extra, from: at(0.3) });
  if (v.people === "someone leaves") { if (n >= 2) people[n - 1].until = at(0.4); else people.push({ ...extra, from: at(0.2), until: at(0.6) }); }
  if (v.people === "leaves and comes back") { const p = n >= 2 ? people[n - 1] : (people.push({ ...extra }), people[people.length - 1]); p.stints = [[1, at(0.3)], [at(0.55), Infinity]]; }
  if (v.people === "one leaves as another joins") { if (n >= 2) people[n - 1].until = at(0.5); people.push({ ...extra, from: at(0.5) + 1 }); }
}

// Time away and misses over the run.
function matrixAway({ v, r, W, at }: Making, everyone: string[]) {
  const trips: [string, number, number][] = [];
  const away: Record<number, string[]> = {};
  if (v.away === "odd weeks") range(1, W).forEach((w) => everyone.forEach((id) => { if (r() < 0.05) (away[w] = away[w] || []).push(id); }));
  if (v.away === "a six-week trip") trips.push([everyone[0], at(0.25), at(0.25) + 5]);
  if (v.away === "everyone away together") { const a = at(0.45); everyone.forEach((id) => trips.push([id, a, a + 1])); }
  const makeup = ({ "in full": 1, half: 0.5, none: 0 } as Record<string, number>)[v.makeup];

  const miss: [number, string][] = [];
  if (v.misses === "now and then") range(1, W).forEach((w) => everyone.forEach((id) => { if (r() < 0.04) miss.push([w, id]); }));
  if (v.misses === "one person keeps missing") range(1, W).forEach((w) => { if (w % 3 === 2) miss.push([w, everyone[0]]); });
  if (v.misses === "misses the comeback too") range(1, W).forEach((w) => { if (w % 10 === 3 || w % 10 === 4) miss.push([w, everyone[0]]); });
  return { away, trips, makeup, miss };
}

// Covers, excused Johns and swaps over the run.
function matrixHelp({ v, r, pick, W }: Making, everyone: string[]) {
  const cover: [number, string, string][] = [];
  const excuse: [number, string][] = [];
  const swaps: [number, string, string][] = [];
  if (v.covers === "covers" && everyone.length >= 2) range(1, W).forEach((w) => { if (r() < 0.06) { const a = pick(everyone); const b = pick(everyone.filter((x) => x !== a)); cover.push([w, a, b]); } });
  if (v.covers === "excused") range(1, W).forEach((w) => { if (r() < 0.05) excuse.push([w, pick(everyone)]); });
  if (v.swaps !== "none" && everyone.length >= 2) range(1, W).forEach((w) => { if (r() < 0.05) { const a = pick(everyone); const b = pick(everyone.filter((x) => x !== a)); swaps.push([w, a, b]); } });
  return { cover, excuse, swaps };
}

// What an admin changes half way through.
function matrixAdmin({ v, at, johns }: Making) {
  const events: NonNullable<Exclude<RunHouse["events"], (w: number) => unknown>> = [];
  const mid = at(0.5);
  if (v.admin === "budget changes") events.push({ w: mid, budgetStep: true });
  if (v.admin === "mode switches") events.push({ w: mid, switchMode: true });
  if (v.admin === "John added") johns.push({ name: "New John", pts: 3, day: 5, sched: wk(1), from: mid });
  if (v.admin === "John removed") johns[0].until = mid;
  if (v.admin === "points change") johns[0].changes = [{ w: mid, pts: johns[0].pts >= 4 ? 1 : 5 }];
  if (v.admin === "schedule changes") johns[0].changes = [{ w: mid, sched: johns[0].sched && "months" in johns[0].sched ? wk(1) : mo(1, 2) }];
  return events;
}

// A house from one row of the matrix. `W` is how many weeks it will run, so time away and misses spread over it.
export function matrixHouse(row: number[], index: number, W = 156): RunHouse {
  const v = Object.fromEntries(MECHANISMS.map((m, i) => [m.id, m.values[row[i]]]));
  const r = mulberry(1000 + index);
  const n = Number(v.size);
  const people: MPerson[] = NAMES.slice(0, n).map((name, i) => ({ id: "p" + i, name, days: [], prefs: {} }));
  const making: Making = {
    v,
    r,
    pick: (xs) => xs[Math.floor(r() * xs.length)],
    n,
    W,
    at: (f) => Math.max(2, Math.round(W * f)),
    people,
    extra: { id: "p" + n, name: NAMES[n], days: [], prefs: {} },
    johns: [],
  };
  // In this order: each stage draws the next of the house's random numbers.
  matrixJohns(making);
  matrixPeople(making);
  const everyone = people.map((p) => p.id);
  const gone = matrixAway(making, everyone);
  const help = matrixHelp(making, everyone);
  const events = matrixAdmin(making);

  const label = MECHANISMS.map((m) => `${m.label}: ${v[m.id]}`).join("; ");
  return { id: "matrix-" + (index + 1), group: "Matrix", name: `Matrix house ${index + 1}`, blurb: label, values: v, people, johns: making.johns, ...gone, ...help, events };
}

// ---- Random houses for the stress test ----
const KINDS: ((r: () => number) => Sched)[] = [() => wk(1), () => wk(1), () => wk(1), (r) => wk(2, 1 + Math.floor(r() * 2)), (r) => wk(4, 1 + Math.floor(r() * 4)), (r) => mo(1, 1 + Math.floor(r() * 5)), (r) => mo(2, 1 + Math.floor(r() * 4)), (r) => mo(12, 1 + Math.floor(r() * 5), 1 + Math.floor(r() * 50))];
export function randomHouse(seed: number, W = 52): RunHouse {
  const r = mulberry(seed);
  const n = 1 + Math.floor(r() * 6);
  const people: MPerson[] = NAMES.slice(0, n).map((nm, i) => ({ id: "p" + i, name: nm, days: r() < 0.5 ? [] : range(1, 7).filter(() => r() < 0.45), prefs: {} }));
  if (n > 1 && r() < 0.25) people[n - 1].from = 2 + Math.floor(r() * (W - 4));
  else if (n > 1 && r() < 0.25) people[n - 1].until = 2 + Math.floor(r() * (W - 4));
  const nj = 3 + Math.floor(r() * 11);
  const johns: RunJohn[] = range(1, nj).map((i) => {
    const sched = KINDS[Math.floor(r() * KINDS.length)](r);
    const j: RunJohn = { name: "John " + i, pts: 1 + Math.floor(r() * 5), day: 1 + Math.floor(r() * 7), sched };
    if (!("months" in sched) && sched.every <= 2 && r() < 0.2) j.fixed = true;
    if (r() < 0.05) j.crew = r() < 0.5 ? 0 : 2;
    if (n >= 3 && r() < 0.08) j.group = people.slice(0, 2).map((p) => p.id);
    return j;
  });
  if (r() < 0.2) johns.push({ name: "On call", pts: 1 + Math.floor(r() * 4), day: 1, onCall: true });
  people.forEach((p) => johns.forEach((j) => { const x = r(); if (x < 0.08) p.prefs[j.name] = 1; else if (x < 0.16) p.prefs[j.name] = -1; }));
  const away: Record<number, string[]> = {};
  const miss: [number, string][] = [];
  range(1, W).forEach((w) => people.forEach((p) => { if (r() < 0.06) (away[w] = away[w] || []).push(p.id); else if (r() < 0.04) miss.push([w, p.id]); }));
  const makeup = [1, 1, 0.5, 0][Math.floor(r() * 4)];
  return { id: "random-" + seed, group: "Stress test", name: `Random house #${seed}`, blurb: `A random house from the stress test: ${n} ${n === 1 ? "person" : "people"} and ${johns.length} Johns, time away made up ${makeup === 1 ? "in full" : makeup ? "at half" : "not at all"}.`, people, johns, away, miss, makeup };
}
