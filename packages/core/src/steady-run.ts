/**
 * Steady weeks, week after week: a house run forward through steadyWeek, with
 * everything that happens between deals (time away, misses, covers, excused,
 * swaps, people moving in and out, an admin's changes) and the balances they
 * leave. Pure and deterministic, like the deal itself.
 *
 * Two uses. The tests run the fixed houses in steady-houses.ts through it for
 * up to three years and check every week against the rules (steady-checks.ts).
 * The budget sheet runs a house's own list forward (comesRound) to say how
 * often each John will really come round on each budget.
 *
 * A John's schedule is the list's own (repeat.ts): every N weeks from a week,
 * or every N months on a weekday of the month. Weeks are counted from 1, the
 * week that starts on `startsOn`.
 */
import { weekShares } from "./deal";
import type { Repeat } from "./repeat";
import { LAST_OF_MONTH, landsInWeek, startMonths } from "./repeat";
import type { DealMode } from "./domain";
import type { SteadyJohn, SteadyMember, SteadyPlace, SteadyResult } from "./steady";
import { placeDays, steadyWeek } from "./steady";
import type { IsoDow } from "./domain";
import { addDaysTo, weekIndex } from "./week";

/** Weeks in a month, on average: a monthly John's period in weeks. */
export const MONTH_WEEKS = 365.25 / 12 / 7;

/** Every N weeks from week `start` (1 if not given), or every N months on the nth weekday (LAST_OF_MONTH for the last), from week `from`. */
export type Sched = { every: number; start?: number } | { months: number; nth: number; from?: number };

export interface RunPerson {
  id: string;
  name: string;
  /** Days that suit them (ISO 1–7); empty is any day. */
  days?: number[];
  /** John name → 1 rather do, −1 rather not. */
  prefs?: Record<string, number>;
  /** The first and last week they live there (inclusive); or `stints` for moving out and back. */
  from?: number;
  until?: number;
  stints?: [number, number][];
}

export interface RunJohn {
  /** Its name, which is also its id here. */
  name: string;
  pts: number;
  /** ISO weekday it's due on. */
  day: number;
  sched?: Sched;
  onCall?: boolean;
  /** Keeps its day. */
  fixed?: boolean;
  /** 1 alone (the default), 0 everyone home, 2 to 6 that many. */
  crew?: number;
  /** Only these people share it. */
  group?: string[];
  /** Its group's name, which keeps its pool when the group's members change (`changes` with `group`). Default: the group's ids. */
  pool?: string;
  /** The first and last week it's on the list. */
  from?: number;
  until?: number;
  /** From week `w`, a new schedule, size or day. */
  changes?: { w: number; sched?: Sched; pts?: number; day?: number; group?: string[] }[];
  /** How often, in words, for the simulator. */
  often?: string;
}

/** Something given week by week, or worked out from how many weeks the run is. */
type ByLength<T> = T | ((weeks: number) => T);

export interface RunHouse {
  id: string;
  name: string;
  group?: string;
  blurb?: string;
  people: RunPerson[];
  johns: RunJohn[];
  /** What someone away still owes of their part: 1 (the default), 0.5 or 0. */
  makeup?: number;
  /** Week → who is away all that week. */
  away?: ByLength<Record<number, string[]>>;
  /** [who, first week, last week] away. */
  trips?: ByLength<[string, number, number][]>;
  /** [week, who, John]: they miss that John (their first of their own if not named). */
  miss?: ByLength<[number, string, string?][]>;
  /** [week, whose, covered by, John]. */
  cover?: ByLength<[number, string, string, string?][]>;
  /** [week, whose, John]: the house lets them off. */
  excuse?: ByLength<[number, string, string?][]>;
  /** [week, one, other]: their first Johns that don't keep their day change hands. */
  swaps?: ByLength<[number, string, string][]>;
  /** An admin's changes, from that week's Monday. `budgetStep` and `switchMode` change whatever the run has then. */
  events?: ByLength<{ w: number; budget?: number; budgetStep?: boolean; mode?: DealMode; switchMode?: boolean }[]>;
  /** The matrix house's mechanisms, for the simulator. */
  values?: Record<string, string>;
}

/** A John as the run holds it: which weeks it lands in, and its size, period and day in each. */
export interface RunPreparedJohn extends RunJohn {
  due: Set<number>;
  ptsAt: Record<number, number>;
  periodAt: Record<number, number>;
  dayAt: Record<number, number>;
  /** Its group's members in each week; undefined for the whole house. */
  groupAt: Record<number, string[] | undefined>;
  /** Whose fairness it counts in: its group's pool, or "" for the whole house. */
  poolKey: string;
  from: number;
  until: number;
  pinned: boolean;
  together: boolean;
}

export interface RunPreparedPerson extends RunPerson {
  days: number[];
  prefs: Record<string, number>;
  stints: [number, number][];
}

export interface RunPrepared {
  house: RunHouse;
  weeks: number;
  people: RunPreparedPerson[];
  johns: RunPreparedJohn[];
  byId: Record<string, RunPreparedPerson>;
  johnByName: Record<string, RunPreparedJohn>;
  makeup: number;
  awayAt: Record<number, Set<string>>;
}

/** One of someone's Johns in a week of the run. */
export interface RunItem {
  name: string;
  pts: number;
  pinned: boolean;
  together: boolean;
  onCall: boolean;
  sharers: string[];
  /** Weeks it had waited before this. */
  waited: number;
  back?: true;
  /** ISO weekday it's on, 0 for on call. */
  day: number;
  /** Its own day. */
  home: number;
  moved?: "taken" | "suits" | "away";
  swapped?: true;
  missed?: true;
  coveredBy?: string;
  excused?: true;
  place: SteadyPlace;
}

export interface RunPersonWeek {
  id: string;
  name: string;
  away: boolean;
  /** Balance going into the week. */
  bal: number;
  rel: number;
  target: number;
  joined: boolean;
}

export interface RunWeek {
  w: number;
  mode: DealMode;
  B: number;
  present: string[];
  away: string[];
  got: Record<string, RunItem[]>;
  dealt: Record<string, number>;
  target: Record<string, number>;
  /** Johns left waiting at the end of the deal. */
  waiting: string[];
  misses: { pid: string; name: string; pts: number }[];
  covers: { pid: string; by: string; name: string }[];
  excused: { pid: string; name: string }[];
  /** Balances at the end of the week. */
  bal: Record<string, number>;
  /** The same, by pool ("" the whole house, then each group they're in), in a house with groups. */
  pools?: Record<string, Record<string, number>>;
  missedTotal: number;
  people: RunPersonWeek[];
  weekOff: string[];
  joined: string[];
  left: string[];
  changes: string[];
  swaps: string[];
  end: { pid: string; before: number; done: number; share: number; after: number }[];
  result: SteadyResult;
}

export interface RunOptions {
  mode: DealMode;
  /** Points a week each; 0 for no limit. */
  budget: number;
  weeks: number;
  /** The Monday week 1 starts on (`yyyy-MM-dd`). */
  startsOn?: string;
}

/** Week 1 of every fixed house starts on Monday 2 November 2026. */
export const RUN_STARTS_ON = "2026-11-02";

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const val = <T>(x: ByLength<T> | undefined, weeks: number): T | undefined =>
  typeof x === "function" ? (x as (n: number) => T)(weeks) : x;

export const periodOf = (sched: Sched | undefined): number =>
  sched && "months" in sched ? sched.months * MONTH_WEEKS : ((sched as { every?: number } | undefined)?.every ?? 1);

/** The weeks from `from` to `to` that a schedule lands in, on its weekday, through repeat.ts. */
export function dueWeeks(sched: Sched, day: number, from: number, to: number, startsOn = RUN_STARTS_ON): number[] {
  const weekStarts = 1 as IsoDow;
  const startsOf = (w: number) => addDaysTo(startsOn, (w - 1) * 7);
  if ("months" in sched) {
    const first = Math.max(from, sched.from ?? 1);
    if (first > to) return [];
    const anchor = startMonths({ everyMonths: sched.months, weekOfMonth: sched.nth, dueDow: day as IsoDow }, startsOf(first), weekStarts)[0];
    if (!anchor) return [];
    const repeat: Repeat = {
      everyWeeks: 1,
      everyMonths: sched.months,
      weekOfMonth: sched.nth,
      anchorMonth: anchor.month,
      anchorWeek: 0,
      dueDow: day as IsoDow,
    };
    return range(first, to).filter((w) => landsInWeek(repeat, startsOf(w), weekStarts));
  }
  const n = sched.every || 1;
  const s = sched.start ?? 1;
  const repeat: Repeat = {
    everyWeeks: n,
    everyMonths: null,
    weekOfMonth: null,
    anchorMonth: null,
    anchorWeek: weekIndex(startsOf(s)),
    dueDow: day as IsoDow,
  };
  return range(Math.max(from, s), to).filter((w) => landsInWeek(repeat, startsOf(w), weekStarts));
}

export { LAST_OF_MONTH };

/** A house, ready to run for `weeks` weeks: each John's weeks and size by week, each person's stints, who's away. */
export function prepareRun(house: RunHouse, weeks: number, startsOn = RUN_STARTS_ON): RunPrepared {
  const people: RunPreparedPerson[] = house.people.map((p) => ({
    ...p,
    days: p.days ?? [],
    prefs: p.prefs ?? {},
    stints: p.stints ?? [[p.from ?? 1, p.until ?? Infinity]],
  }));
  const johns: RunPreparedJohn[] = house.johns.map((j) => {
    const parts = [{ w: j.from ?? 1, sched: j.sched, pts: j.pts, day: j.day, group: j.group }];
    for (const c of j.changes ?? []) {
      const prev = parts[parts.length - 1];
      parts.push({ w: c.w, sched: c.sched ?? prev.sched, pts: c.pts ?? prev.pts, day: c.day ?? prev.day, group: c.group ?? prev.group });
    }
    const due = new Set<number>();
    const ptsAt: Record<number, number> = {};
    const periodAt: Record<number, number> = {};
    const dayAt: Record<number, number> = {};
    const groupAt: Record<number, string[] | undefined> = {};
    parts.forEach((part, i) => {
      const to = Math.min(weeks, parts[i + 1] ? parts[i + 1].w - 1 : weeks, j.until ?? weeks);
      const lands = j.onCall ? range(part.w, to) : dueWeeks(part.sched ?? { every: 1 }, part.day, part.w, to, startsOn);
      for (const w of lands) due.add(w);
      for (let w = part.w; w <= to; w++) {
        ptsAt[w] = part.pts;
        periodAt[w] = j.onCall ? 1 : periodOf(part.sched);
        dayAt[w] = part.day;
        groupAt[w] = part.group;
      }
    });
    const together = j.crew !== undefined && j.crew !== 1;
    const firstGroup = parts.find((x) => x.group)?.group;
    const poolKey = j.pool ?? (firstGroup ? firstGroup.join("+") : "");
    return { ...j, due, ptsAt, periodAt, dayAt, groupAt, poolKey, from: j.from ?? 1, until: j.until ?? Infinity, pinned: !!j.fixed || together, together };
  });
  const awayAt: Record<number, Set<string>> = {};
  for (const [w, ids] of Object.entries(val(house.away, weeks) ?? {})) {
    awayAt[Number(w)] ??= new Set();
    ids.forEach((id) => awayAt[Number(w)].add(id));
  }
  for (const [id, a, b] of val(house.trips, weeks) ?? []) for (let w = a; w <= b; w++) (awayAt[w] ??= new Set()).add(id);
  return {
    house,
    weeks,
    people,
    johns,
    byId: Object.fromEntries(people.map((p) => [p.id, p])),
    johnByName: Object.fromEntries(johns.map((j) => [j.name, j])),
    makeup: house.makeup ?? 1,
    awayAt,
  };
}

/** They share a John in week `w`: it's the whole house's, or they're in its group that week. */
export const inGroup = (j: RunPreparedJohn, id: string, w: number): boolean => {
  const g = j.groupAt[w] ?? (w > j.until ? j.groupAt[j.until] : w < j.from ? j.groupAt[j.from] : undefined);
  return !g || g.includes(id);
};

export const livesThere = (p: RunPreparedPerson, w: number): boolean => p.stints.some(([a, b]) => a <= w && w <= b);

const byWeek = <T extends [number, ...unknown[]]>(list: T[] | undefined): Record<number, T[]> => {
  const m: Record<number, T[]> = {};
  for (const x of list ?? []) (m[x[0]] ??= []).push(x);
  return m;
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Run a house forward, one deal a week. */
export function steadyRun(house: RunHouse, opts: RunOptions): { prepared: RunPrepared; weeks: RunWeek[] } {
  const W = opts.weeks;
  const S = prepareRun(house, W, opts.startsOn);
  const P = S.people;
  const misses = byWeek(val(house.miss, W));
  const covers = byWeek(val(house.cover, W));
  const excuses = byWeek(val(house.excuse, W));
  const swaps = byWeek(val(house.swaps, W));
  const events = val(house.events, W) ?? [];

  const bal: Record<string, number> = Object.fromEntries(P.map((p) => [p.id, 0]));
  // Balances in each group's pool, by person: work done minus share on that group's Johns. Their whole-house
  // balance is everything else: the total minus the groups they're in now.
  const groupBal: Record<string, Record<string, number>> = Object.fromEntries(P.map((p) => [p.id, {}]));
  const poolOf = (j: RunPreparedJohn) => j.poolKey;
  const anyGroups = S.johns.some((j) => j.poolKey);
  const last: Record<string, string[]> = {};
  const lastDealt: Record<string, number> = {};
  const firstDue: Record<string, number> = {};
  let back: Record<string, string> = {};
  let waited: Record<string, number> = {};
  let turns: Record<string, string[]> | null = null;
  let mode = opts.mode;
  let B = opts.budget;
  let missedTotal = 0;
  let prevIds: string[] = [];
  const weeks: RunWeek[] = [];

  for (let w = 1; w <= W; w++) {
    const changes: string[] = [];
    for (const e of events) {
      if (e.w !== w) continue;
      const nb = e.budget !== undefined ? e.budget : e.budgetStep ? (B === 4 ? 2 : B === 2 ? 4 : B === 6 ? 2 : 4) : B;
      if (nb !== B) {
        changes.push(`budget ${nb}`);
        B = nb;
      }
      const nm = e.mode ?? (e.switchMode ? (mode === "smart" ? "classic" : "smart") : mode);
      if (nm !== mode) {
        changes.push(`mode ${nm}`);
        mode = nm;
      }
    }
    const present = P.filter((p) => livesThere(p, w));
    const ids = present.map((p) => p.id);
    const awaySet = S.awayAt[w] ?? new Set<string>();
    const away = ids.filter((id) => awaySet.has(id));
    const homeSet = new Set(ids.filter((id) => !awaySet.has(id)));

    // Someone who moved out: a missed John of theirs goes back on the list, and they're nobody's last time.
    const left = prevIds.filter((x) => !ids.includes(x));
    for (const id of left) {
      for (const n of Object.keys(back)) {
        if (back[n] === id) {
          delete back[n];
          waited[n] = Math.max(waited[n] ?? 0, 1);
        }
      }
      for (const n of Object.keys(last)) if (last[n].includes(id)) last[n] = last[n].filter((x) => x !== id);
    }
    const joined = w === 1 ? [] : ids.filter((x) => !prevIds.includes(x));
    prevIds = ids;

    const active = S.johns.filter((j) => j.from <= w && w <= j.until);
    const onList = new Set(active.map((j) => j.name));
    for (const n of Object.keys(waited)) if (!onList.has(n)) delete waited[n];
    for (const n of Object.keys(back)) if (!onList.has(n)) delete back[n];
    if (mode !== "classic") turns = null;

    const sharersOf = (j: RunPreparedJohn) => ids.filter((id) => inGroup(j, id, w));
    for (const j of active) if ((j.due.has(w) || waited[j.name] || back[j.name]) && !(j.name in firstDue)) firstDue[j.name] = w;
    const johns: SteadyJohn[] = active.map((j) => {
      const per = j.periodAt[w];
      const lw = lastDealt[j.name];
      return {
        johnId: j.name,
        points: j.ptsAt[w],
        period: per,
        day: j.dayAt[w],
        keepDay: !!j.fixed,
        crew: j.crew ?? 1,
        onCall: !!j.onCall,
        sharers: sharersOf(j),
        pool: poolOf(j),
        home: sharersOf(j).filter((id) => homeSet.has(id)),
        due: j.due.has(w),
        waited: waited[j.name] ?? 0,
        back: back[j.name] ?? null,
        lastBy: last[j.name] ?? [],
        since: lw ? w - lw : j.name in firstDue ? w - firstDue[j.name] + per : 0,
        ahead: range(w, w + 11).map((x) => j.due.has(x)),
      };
    });
    // The groups someone is in now: the pools of the Johns on the list they share as one of a group.
    const groupsNow = [...new Set(active.filter((j) => j.groupAt[w]).map(poolOf))];
    const poolsFor = (id: string) => {
      const mine = groupsNow.filter((k) => active.some((j) => j.poolKey === k && j.groupAt[w]?.includes(id)));
      const pools: Record<string, number> = Object.fromEntries(mine.map((k) => [k, groupBal[id][k] ?? 0]));
      pools[""] = bal[id] - mine.reduce((s, k) => s + pools[k], 0);
      return pools;
    };
    const members: SteadyMember[] = present.map((p) => ({
      userId: p.id,
      balance: bal[p.id],
      ...(anyGroups ? { pools: poolsFor(p.id) } : {}),
      homeDays: homeSet.has(p.id) ? ALL_DAYS : [],
      suits: p.days,
      rather: p.prefs,
    }));
    const result = steadyWeek({ mode, budget: B, johns, members, turns: mode === "classic" ? turns : null, seed: String(w), makeup: S.makeup });
    turns = result.turns;
    waited = result.waiting;
    back = {};

    const johnByName = S.johnByName;
    const got: Record<string, RunItem[]> = Object.fromEntries(ids.map((id) => [id, []]));
    const itemOf = (p: SteadyPlace): RunItem => {
      const j = johnByName[p.johnId];
      return {
        name: j.name,
        pts: p.points,
        pinned: j.pinned,
        together: j.together,
        onCall: !!j.onCall,
        sharers: sharersOf(j),
        waited: p.why.waited ?? 0,
        ...(p.back ? { back: true as const } : {}),
        day: p.day,
        home: j.dayAt[w],
        place: p,
      };
    };
    for (const p of result.places) {
      lastDealt[p.johnId] = w;
      last[p.johnId] = result.places.filter((x) => x.johnId === p.johnId).map((x) => x.userId);
    }
    const dealt: Record<string, number> = Object.fromEntries(result.people.map((p) => [p.userId, p.dealt]));

    // A swap both people said yes to: their first Johns that don't keep their day change hands, and the days are
    // placed again.
    const swapNotes: string[] = [];
    const swappedPlaces = new Set<SteadyPlace>();
    for (const [, a, b] of swaps[w] ?? []) {
      const mine = (id: string) => result.places.find((p) => p.userId === id && !johnByName[p.johnId].pinned && !p.back);
      const x = mine(a);
      const y = mine(b);
      if (!x || !y || x.johnId === y.johnId || !homeSet.has(a) || !homeSet.has(b)) continue;
      if (!sharersOf(johnByName[x.johnId]).includes(b) || !sharersOf(johnByName[y.johnId]).includes(a)) continue;
      const [xj, xp, xw] = [x.johnId, x.points, x.why];
      x.johnId = y.johnId;
      x.points = y.points;
      x.why = { ...y.why, to: a };
      y.johnId = xj;
      y.points = xp;
      y.why = { ...xw, to: b };
      dealt[a] += x.points - y.points;
      dealt[b] += y.points - x.points;
      last[y.johnId] = [b];
      last[x.johnId] = [a];
      swappedPlaces.add(x);
      swappedPlaces.add(y);
      swapNotes.push(`${a} and ${b} swapped ${y.johnId} and ${x.johnId}`);
    }
    if (swappedPlaces.size) placeDays(result.places, johns, members);
    for (const p of result.places) {
      const it = itemOf(p);
      if (swappedPlaces.has(p)) it.swapped = true;
      got[p.userId].push(it);
    }

    // The week's outcomes: a miss counts for nobody and comes back; a cover counts for whoever covered; excused
    // counts for its holder.
    const done: Record<string, number> = { ...dealt };
    const weekMisses: RunWeek["misses"] = [];
    const weekCovers: RunWeek["covers"] = [];
    const weekExcused: RunWeek["excused"] = [];
    const pickItem = (pid: string, nm?: string) =>
      (got[pid] ?? []).find((i) => (nm ? i.name === nm : !i.together && !i.onCall) && !i.missed && !i.coveredBy && !i.excused);
    for (const [, pid, nm] of misses[w] ?? []) {
      const it = pickItem(pid, nm);
      if (!it || it.together) continue;
      it.missed = true;
      done[pid] -= it.pts;
      missedTotal += it.pts;
      back[it.name] = pid;
      weekMisses.push({ pid, name: it.name, pts: it.pts });
    }
    for (const [, pid, by, nm] of covers[w] ?? []) {
      const it = pickItem(pid, nm);
      if (!it || !homeSet.has(by) || by === pid) continue;
      it.coveredBy = by;
      done[pid] -= it.pts;
      done[by] += it.pts;
      weekCovers.push({ pid, by, name: it.name });
    }
    for (const [, pid, nm] of excuses[w] ?? []) {
      const it = pickItem(pid, nm);
      if (it) {
        it.excused = true;
        weekExcused.push({ pid, name: it.name });
      }
    }

    // Shares are split from what was dealt (deal.ts weekShares), and each balance moves by work done minus share.
    const items = ids.flatMap((id) => got[id]);
    const share = weekShares(
      items.map((i) => ({ johnId: i.name, points: i.pts, lastUserId: null, sharers: i.sharers, home: i.sharers.filter((id) => homeSet.has(id)) })),
      ids,
      S.makeup,
    );
    const personWeeks: RunPersonWeek[] = present.map((p) => {
      const r = result.people.find((x) => x.userId === p.id)!;
      return { id: p.id, name: p.name, away: awaySet.has(p.id), bal: bal[p.id], rel: r.rel, target: r.target, joined: joined.includes(p.id) };
    });
    // The same, pool by pool: each group's Johns split among its sharers, and credited to whoever did them.
    for (const k of groupsNow) {
      const inPool = items.filter((i) => poolOf(johnByName[i.name]) === k);
      const poolShare = weekShares(
        inPool.map((i) => ({ johnId: i.name, points: i.pts, lastUserId: null, sharers: i.sharers, home: i.sharers.filter((id) => homeSet.has(id)) })),
        ids,
        S.makeup,
      );
      const poolDone: Record<string, number> = {};
      for (const i of inPool) {
        const who = i.missed ? null : (i.coveredBy ?? i.place.userId);
        if (who) poolDone[who] = (poolDone[who] ?? 0) + i.pts;
      }
      for (const id of ids) groupBal[id][k] = (groupBal[id][k] ?? 0) + (poolDone[id] ?? 0) - poolShare.get(id)!;
    }
    const end = present.map((p) => {
      const before = bal[p.id];
      bal[p.id] = before + done[p.id] - share.get(p.id)!;
      return { pid: p.id, before, done: done[p.id], share: share.get(p.id)!, after: bal[p.id] };
    });
    weeks.push({
      w,
      mode,
      B,
      present: ids,
      away,
      got,
      dealt,
      target: Object.fromEntries(result.people.map((p) => [p.userId, p.target])),
      waiting: Object.keys(waited),
      misses: weekMisses,
      covers: weekCovers,
      excused: weekExcused,
      bal: { ...bal },
      ...(anyGroups ? { pools: Object.fromEntries(ids.map((id) => [id, poolsFor(id)])) } : {}),
      missedTotal,
      people: personWeeks,
      weekOff: result.people.filter((p) => p.weekOff).map((p) => p.userId),
      joined,
      left,
      changes,
      swaps: swapNotes,
      end,
      result,
    });
  }
  return { prepared: S, weeks };
}
