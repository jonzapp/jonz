/**
 * Steady weeks: the deal with a points budget, in Smart or Classic mode.
 *
 * Pure and deterministic, one week at a time. The engine (apps/api
 * lib/engine/tick.ts) hands it every John on the list, who shares each one
 * and who can do it this week, each housemate's balance, preferences and the
 * days they're home, Classic's orders of turns from last week and which Johns
 * are waiting; it hands back who gets what, on which day, which Johns wait,
 * and the orders of turns for next week. Same inputs, same week, on any
 * machine. steady-run.ts runs it week after week for the tests and for the
 * budget sheet's "how often each John comes round".
 *
 * The rules (docs/specs/steady-weeks.md has them with the reasons):
 *
 * Shared by both modes:
 *   - Order. Missed Johns coming back go first, then Johns that keep their day
 *     or are done together, then Johns that have waited FRONT_WEEKS (longest
 *     first), then the rest by how late they are for their own schedule:
 *     weeks since their last turn ÷ how often they come round. With no limit
 *     everything due goes out, so the rest go biggest first, as fairShares
 *     always has.
 *   - The budget. Everyone home is owed one John of their own, even one
 *     bigger than their budget. After that a John goes to someone only if it
 *     fits. Johns that keep their day, and Johns done together, always go out
 *     and count toward the budget, but don't use up anyone's one John; a
 *     missed John coming back does.
 *   - Waiting. A John that doesn't fit waits for next week. It merges with
 *     its next turn, so it never doubles up, and it's never skipped.
 *   - Days. A John that keeps its day stays on it, on call is all week, and
 *     the rest go to the nearest free day that suits the person, then the
 *     nearest free day, and only then a day that already has one.
 *
 * Smart:
 *   - A target each: the budget, plus up to half again for someone behind
 *     the house's average balance, or minus up to half for someone ahead.
 *     More than a week's budget ahead is a week off.
 *   - Pools. A group's Johns are balanced within the group, and the whole
 *     house's Johns across everyone: who gets a John goes by how far behind
 *     they are in its own pool, so a group's Johns never move anyone's share
 *     of the rest (members' `pools`). The target is still the whole load.
 *   - One each first. The most overdue Johns go out, one for each person
 *     still owed one; whoever is furthest behind chooses first and takes the
 *     biggest ("rather do" counts a point bigger, "rather not" a point
 *     smaller). A group's John that nobody still to choose could do goes to
 *     the one choosing.
 *   - Never twice running, unless they'd rather do it, they're half the
 *     budget or more behind, or it has waited two weeks.
 *   - The rest, most overdue first, to whoever has the most target left and
 *     room for it. After a week waiting a John may go half the budget over
 *     someone's target; after two, back to whoever did it last time.
 *   - With no limit, today's deal (deal.ts fairSharesExplained): furthest
 *     behind, 1.5 against doing it last time, nobody past half as much again
 *     as their share while someone else could take it, except that
 *     someone's first John always gets past that cap.
 *
 * Classic:
 *   - Each John has its own order of turns, planned when the house picks
 *     Classic (or the John is added) so each week's points split evenly.
 *     Someone new joins the back of every order they share.
 *   - The John goes to the next person in its order who is home, even if it
 *     takes them up to half the budget over. Away, or fuller than that, the
 *     next person in line with room does it, and they stay first.
 */
import { stableHash, weekShares } from "./deal";
import type { DealMode } from "./domain";

/** Weeks a John waits before it goes to the front of the list. */
export const FRONT_WEEKS = 3;

/** How far ahead Classic looks when it picks who starts each John's order of turns. */
export const PLAN_WEEKS = 12;

/** Today's deal, with no limit: the cost of doing the same John twice running, and the catch-up cap. */
const REPEAT_COST = 1.5;
const CATCH_UP = 1.5;
const EPS = 1e-9;

export interface SteadyJohn {
  johnId: string;
  points: number;
  /** Weeks between its turns: its every-N-weeks, or its months in weeks. 1 for on call. */
  period: number;
  /** ISO weekday it's due on (1 Monday … 7 Sunday). */
  day: number;
  /** It keeps its own day (bins night): always dealt, always on that day. */
  keepDay: boolean;
  /** How many do it: 1 alone, 0 everyone home, 2 to 6 that many. More than one goes out like a John that keeps its day. */
  crew: number;
  /** On call for the week (johns.kind = 'on_call'). */
  onCall: boolean;
  /** Everyone living there who shares it: its group, or the whole house. */
  sharers: readonly string[];
  /** Whose fairness it counts in: its group's id, or "" (the default) for the whole house. */
  pool?: string;
  /** Those of them who can do it this week: home on its day if it keeps it, otherwise home on a day still open. */
  home: readonly string[];
  /** It lands this week. */
  due: boolean;
  /** Weeks it has waited so far: 0 unless it waited last week. */
  waited: number;
  /** Whoever missed it last time, when it comes back to them. */
  back: string | null;
  /** Who did it last time (everyone with a place, for a John done together). */
  lastBy: readonly string[];
  /** Weeks since its last turn. For a John never dealt, weeks since it first fell due, plus its period. */
  since: number;
  /** Which of the next PLAN_WEEKS weeks it lands in (0 is this one), for planning Classic's turns. */
  ahead: readonly boolean[];
}

export interface SteadyMember {
  userId: string;
  /** Work done minus share over every week so far. */
  balance: number;
  /**
   * The same balance split by pool: "" the whole house, and a key for each
   * group they're in now (their work done minus share on that group's Johns).
   * They add up to `balance`. Left out, everything is the whole house's.
   */
  pools?: Readonly<Record<string, number>>;
  /** The days of this week they can do a John on: home, and still to come (ISO 1–7). Empty when away all week. */
  homeDays: readonly number[];
  /** Days that suit them (ISO 1–7). Empty is any day. */
  suits: readonly number[];
  /** John id → 1 "rather do", −1 "rather not". */
  rather: Readonly<Record<string, number>>;
}

export interface SteadyInput {
  mode: DealMode;
  /** Points a week each; 0 is no limit. */
  budget: number;
  /** Every John on the list this week, due or not. */
  johns: readonly SteadyJohn[];
  /** Everyone living there this week, home or away, in the order they joined. */
  members: readonly SteadyMember[];
  /** Classic's orders of turns as last week left them, John id → user ids; null to plan them afresh. */
  turns: Readonly<Record<string, readonly string[]>> | null;
  /** Breaks exact ties the same way on every machine: the house and week. */
  seed: string;
  /** What someone away still owes of their part: 1 in full, 0.5 half, 0 none. */
  makeup: number;
}

/** Why a John went where it did, kept with the assignment (assignments.dealt) for its "Why?". */
export type SteadyBy =
  /** A missed John back to whoever missed it. */
  | "back"
  /** The only sharer who could do it. */
  | "only"
  /** Smart with a budget: their one John this week, furthest behind choosing first. */
  | "oneEach"
  /** Smart with a budget: the most target left. */
  | "mostRoom"
  /** Smart with no limit: furthest behind. */
  | "behind"
  /** Smart with no limit: as far behind as someone else, with fewer Johns this week. */
  | "fewer"
  /** Smart with no limit: level, so the shuffle decided. */
  | "draw"
  /** Classic: their turn. */
  | "turn"
  /** Classic: next in line, because whoever's turn it was is away or full. */
  | "nextInLine";

export interface SteadyWeighed {
  userId: string;
  /** Against the house average (budget) or their share (no limit), to a tenth of a point: below zero is behind. */
  standing: number;
  /** Target left before this John (with a budget). */
  room?: number;
  last?: true;
  /** Classic: their place in its order of turns, from 1. */
  place?: number;
}

export interface SteadyWhy {
  to: string;
  by: SteadyBy;
  mode: DealMode;
  /** Points a week each, 0 for no limit. */
  budget: number;
  weighed: SteadyWeighed[];
  /** Sharers away all week. */
  away: string[];
  /** Weeks it waited before this. */
  waited?: number;
  /** It went a little over their target, having waited a week. */
  stretched?: true;
  /** It went back to whoever did it last time, having waited two weeks. */
  again?: true;
  /** Their day: moved off the John's own day, and why ("gone": the week was dealt after its day). */
  moved?: "taken" | "suits" | "away" | "gone";
}

export interface SteadyPlace {
  johnId: string;
  userId: string;
  /** ISO weekday it's on; 0 for on call (all week). */
  day: number;
  /** Which place, for a John done together (1, 2, …); 1 otherwise. */
  place: number;
  points: number;
  back?: true;
  why: SteadyWhy;
}

export interface SteadyPerson {
  userId: string;
  /** Balance minus the house average. */
  rel: number;
  /** Points this week before anything over (Infinity with no limit). */
  target: number;
  dealt: number;
  weekOff: boolean;
}

export interface SteadyResult {
  places: SteadyPlace[];
  /** Johns left waiting, John id → weeks they'll have waited by next week. */
  waiting: Record<string, number>;
  /** Classic's orders of turns for next week; null in Smart. */
  turns: Record<string, string[]> | null;
  people: SteadyPerson[];
  /** The Johns this week considered, most pressing first. */
  order: string[];
}

/** The days nearest a John's own day first, ties to the earlier day (index 0 for on call). */
const BY_DIST: number[][] = Array.from({ length: 8 }, (_, h) =>
  [1, 2, 3, 4, 5, 6, 7].sort((a, b) => Math.abs(a - h) - Math.abs(b - h) || a - b),
);

const pinnedOf = (j: SteadyJohn) => j.keepDay || j.crew !== 1;
const togetherOf = (j: SteadyJohn) => j.crew !== 1;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Plan who starts each John's order of turns, biggest first, so each of the
 * next PLAN_WEEKS weeks' points split as evenly as possible. Johns that
 * already have an order keep it, and count toward the load the new ones are
 * planned around.
 */
export function planTurns(
  johns: readonly SteadyJohn[],
  memberIds: readonly string[],
  order: Record<string, string[]>,
): Record<string, string[]> {
  const load = new Map<string, number>();
  const key = (p: string, x: number) => `${p}|${x}`;
  const L = (p: string, x: number) => load.get(key(p, x)) ?? 0;
  const project = (j: SteadyJohn, q: readonly string[], add: (p: string, x: number, v: number) => void) => {
    let k = 0;
    for (let x = 0; x < PLAN_WEEKS; x++) {
      if (!j.ahead[x]) continue;
      add(q[k % q.length], x, j.points);
      k++;
    }
  };
  for (const j of johns) {
    const q = order[j.johnId];
    if (q && q.length) project(j, q, (p, x, v) => load.set(key(p, x), L(p, x) + v));
  }
  const lands = (j: SteadyJohn) => j.ahead.slice(0, PLAN_WEEKS).filter(Boolean).length || 1;
  const todo = johns
    .filter((j) => !order[j.johnId])
    .sort((a, b) => b.points * lands(b) - a.points * lands(a) || (a.johnId < b.johnId ? -1 : a.johnId > b.johnId ? 1 : 0));
  for (const j of todo) {
    const sharers = memberIds.filter((id) => j.sharers.includes(id));
    let best: { cost: number; q: string[]; extra: Map<string, number> } | null = null;
    for (let s = 0; s < Math.max(1, sharers.length); s++) {
      const q = [...sharers.slice(s), ...sharers.slice(0, s)];
      const extra = new Map<string, number>();
      if (q.length) project(j, q, (p, x, v) => extra.set(key(p, x), (extra.get(key(p, x)) ?? 0) + v));
      let cost = 0;
      for (let x = 0; x < PLAN_WEEKS; x++) {
        const v = memberIds.map((p) => L(p, x) + (extra.get(key(p, x)) ?? 0));
        cost += Math.max(...v) - Math.min(...v);
      }
      if (!best || cost < best.cost) best = { cost, q, extra };
    }
    order[j.johnId] = best!.q;
    for (const [k, v] of best!.extra) load.set(k, (load.get(k) ?? 0) + v);
  }
  return order;
}

interface Row {
  pid: string;
  room: number;
  fits: boolean;
  lastTime: boolean;
  pref: number;
  score: number;
  standing: number;
  roomy: boolean;
}

/** One week's deal. */
export function steadyWeek(input: SteadyInput): SteadyResult {
  const { mode, makeup, seed } = input;
  const B = input.budget;
  const members = input.members;
  const ids = members.map((m) => m.userId);
  const byId = new Map(members.map((m) => [m.userId, m]));
  const homeSet = new Set(members.filter((m) => m.homeDays.length > 0).map((m) => m.userId));
  const active = input.johns;

  // Classic's orders of turns: kept from last week, leavers taken off, new Johns planned, newcomers at the back.
  let order: Record<string, string[]> | null = null;
  if (mode === "classic") {
    order = {};
    if (input.turns) {
      for (const j of active) {
        const q = input.turns[j.johnId];
        if (q) order[j.johnId] = q.filter((id) => ids.includes(id));
      }
    }
    if (active.some((j) => !order![j.johnId])) planTurns(active, ids, order);
    for (const j of active) for (const id of ids) if (j.sharers.includes(id) && !order[j.johnId].includes(id)) order[j.johnId].push(id);
  }

  // Behind or ahead is against the house's average balance.
  const rel = new Map<string, number>();
  const target = new Map<string, number>();
  const dealt = new Map<string, number>();
  const count = new Map<string, number>();
  const own = new Map<string, number>();
  const pinnedDays = new Map<string, Set<number>>();
  // Each pool is balanced on its own: a group's Johns among the group, the rest among everyone. Someone's standing
  // in a pool is their balance there against the average of everyone in it, and it decides who gets that pool's
  // Johns; behind or ahead overall still sets how much they're handed in all (their target, a week off).
  const usePools = members.some((m) => m.pools);
  const poolsOf = (m: SteadyMember): Readonly<Record<string, number>> => m.pools ?? { "": m.balance };
  const poolAvg = new Map<string, number>();
  {
    const sum = new Map<string, [number, number]>();
    for (const m of members)
      for (const [k, v] of Object.entries(poolsOf(m))) {
        const [a, n] = sum.get(k) ?? [0, 0];
        sum.set(k, [a + v, n + 1]);
      }
    for (const [k, [a, n]] of sum) poolAvg.set(k, a / n);
  }
  const poolRel = (pid: string, pool: string) => {
    const v = poolsOf(byId.get(pid)!)[pool];
    return v === undefined ? 0 : v - poolAvg.get(pool)!;
  };
  const poolKey = (j: SteadyJohn) => (usePools ? (j.pool ?? "") : "");
  const avg = members.length ? members.reduce((s, m) => s + m.balance, 0) / members.length : 0;
  for (const m of members) {
    const r = m.balance - avg;
    rel.set(m.userId, r);
    const nudge = mode === "smart" && B ? Math.max(-B / 2, Math.min(B / 2, -r)) : 0;
    target.set(m.userId, B ? B + nudge : Infinity);
    dealt.set(m.userId, 0);
    count.set(m.userId, 0);
    own.set(m.userId, 0);
    pinnedDays.set(m.userId, new Set());
  }

  const due = active.filter((j) => j.due || j.waited > 0 || j.back);
  const late = (j: SteadyJohn) => j.since / j.period;
  const front = (j: SteadyJohn) => (j.waited >= FRONT_WEEKS ? 1e3 + j.waited : 0);
  const rank = (j: SteadyJohn) =>
    (j.back ? 3e3 : pinnedOf(j) ? 2e3 : front(j)) + (B || mode === "classic" ? late(j) : j.points * 10 + late(j) / 100);
  const rk = new Map(due.map((j) => [j, rank(j)]));
  const ordered = [...due].sort(
    (a, b) => rk.get(b)! - rk.get(a)! || b.points - a.points || (a.johnId < b.johnId ? -1 : 1),
  );
  const homeOf = (j: SteadyJohn) => j.home.filter((id) => homeSet.has(id) && byId.has(id));
  const placesOf = (j: SteadyJohn, n: number) => (togetherOf(j) ? (j.crew === 0 ? n : Math.min(j.crew, n)) : 1);

  // With no limit, Smart weighs each person against their share of everything due (deal.ts).
  // Each pool's share is weighed on its own, so a group's Johns never move anyone's share of the rest.
  let shareEst: Map<string, number> | null = null;
  const poolShare = new Map<string, Map<string, number>>();
  const poolDealt = new Map<string, number>();
  if (mode === "smart" && !B) {
    const items = due.flatMap((j) =>
      Array.from({ length: placesOf(j, homeOf(j).length) }, () => ({ points: j.points, sharers: j.sharers, home: homeOf(j), pool: poolKey(j) })),
    );
    const sharesOf = (xs: typeof items) => weekShares(xs.map((x) => ({ johnId: "", lastUserId: null, ...x })), ids, makeup);
    shareEst = sharesOf(items);
    for (const P of new Set(items.map((x) => x.pool))) poolShare.set(P, sharesOf(items.filter((x) => x.pool === P)));
  }

  /**
   * With a budget, how much less room someone has for a John in its own pool than overall: their target is
   * nudged by how far behind or ahead they are in that pool, not overall. 0 with one pool.
   */
  const nudgeFor = (r: number) => Math.max(-B / 2, Math.min(B / 2, -r));
  const lead = (j: SteadyJohn, pid: string) => (usePools && B ? nudgeFor(rel.get(pid)!) - nudgeFor(poolRel(pid, poolKey(j))) : 0);

  const weekOff = (id: string) => mode === "smart" && B > 0 && rel.get(id)! > B + EPS;
  const owed = (id: string) => own.get(id)! === 0 && !weekOff(id);
  const places: SteadyPlace[] = [];
  const nextWaited: Record<string, number> = {};
  const decided = new Set<SteadyJohn>();
  const tie = (j: SteadyJohn, a: string, b: string) => stableHash(`${seed}:${j.johnId}:${a}`) - stableHash(`${seed}:${j.johnId}:${b}`);
  const awayOf = (j: SteadyJohn) => j.sharers.filter((id) => byId.has(id) && !homeSet.has(id));
  const placeNo = new Map<SteadyJohn, number>();

  const weigh = (j: SteadyJohn, pid: string): Row => {
    const room = target.get(pid)! - dealt.get(pid)!;
    const lastTime = j.lastBy.includes(pid);
    const pref = byId.get(pid)!.rather[j.johnId] ?? 0;
    const r: Row = { pid, room, fits: owed(pid) || j.points <= room + EPS, lastTime, pref, score: 0, standing: 0, roomy: true };
    if (B) {
      const ahead = lead(j, pid);
      r.score = -room - pref + ahead + (j.keepDay && pinnedDays.get(pid)!.has(j.day) ? 3 : 0);
      r.standing = usePools ? poolRel(pid, poolKey(j)) : rel.get(pid)!;
    } else {
      const P = poolKey(j);
      r.standing = (poolsOf(byId.get(pid)!)[P] ?? 0) + (poolDealt.get(`${P}|${pid}`) ?? 0) - (poolShare.get(P)?.get(pid) ?? 0);
      r.score = r.standing + (lastTime ? REPEAT_COST : 0) - pref;
      // Today's cap never stops someone's first John: with it, someone with a small share could be passed over every week.
      r.roomy = own.get(pid)! === 0 || dealt.get(pid)! + j.points <= (shareEst?.get(pid) ?? 0) * CATCH_UP + EPS;
    }
    return r;
  };
  const best = (j: SteadyJohn, pool: Row[]) =>
    pool.sort((a, b) => a.score - b.score || count.get(a.pid)! - count.get(b.pid)! || tie(j, a.pid, b.pid));
  /** Why Smart chose the first of `sorted` (best's order, before it's dealt): with a budget the most room, with no limit as today. */
  const smartBy = (cands: readonly string[], sorted: readonly Row[]): SteadyBy => {
    if (cands.length === 1) return "only";
    if (B) return "mostRoom";
    const [a, b] = sorted;
    if (!b || a.score < b.score - EPS) return "behind";
    return count.get(a.pid)! < count.get(b.pid)! ? "fewer" : "draw";
  };
  const weighed = (rows: readonly Row[]): SteadyWeighed[] =>
    rows
      .map((r) => ({
        userId: r.pid,
        standing: round1(r.standing),
        ...(B ? { room: round1(r.room) } : {}),
        ...(r.lastTime ? { last: true as const } : {}),
      }))
      .sort((a, b) => a.standing - b.standing || (a.userId < b.userId ? -1 : 1));

  const give = (pid: string, j: SteadyJohn, why: Omit<SteadyWhy, "to" | "mode" | "budget" | "away">, back = false) => {
    dealt.set(pid, dealt.get(pid)! + j.points);
    poolDealt.set(`${poolKey(j)}|${pid}`, (poolDealt.get(`${poolKey(j)}|${pid}`) ?? 0) + j.points);
    count.set(pid, count.get(pid)! + 1);
    if (pinnedOf(j)) pinnedDays.get(pid)!.add(j.day);
    else own.set(pid, own.get(pid)! + 1);
    const place = (placeNo.get(j) ?? 0) + 1;
    placeNo.set(j, place);
    places.push({
      johnId: j.johnId,
      userId: pid,
      day: 0,
      place,
      points: j.points,
      ...(back ? { back: true as const } : {}),
      why: {
        to: pid,
        mode,
        budget: B,
        away: awayOf(j),
        ...(j.waited ? { waited: j.waited } : {}),
        ...why,
      },
    });
  };
  const wait = (j: SteadyJohn) => {
    nextWaited[j.johnId] = j.waited + 1;
  };

  // 1. Johns that have to go out: a missed John coming back to whoever missed it, then Johns that keep their day
  //    or are done together. (On call can wait like any other: its flags then go to whoever at home has been
  //    handed least that week, as open_flag does when whoever is on call is away.)
  for (const j of ordered) {
    if (j.back) {
      const owner = j.back;
      if (homeSet.has(owner) && j.sharers.includes(owner) && j.home.includes(owner)) {
        decided.add(j);
        give(owner, j, { by: "back", weighed: [] }, true);
        continue;
      }
    }
    if (!pinnedOf(j)) continue;
    decided.add(j);
    const cands = homeOf(j);
    if (!cands.length) {
      wait(j);
      continue;
    }
    const n = placesOf(j, cands.length);
    if (mode === "classic") {
      const q = order![j.johnId];
      const pick = q.filter((id) => cands.includes(id)).slice(0, n);
      pick.forEach((id) => {
        q.splice(q.indexOf(id), 1);
        q.push(id);
      });
      const line = q.filter((id) => cands.includes(id));
      for (const id of pick) {
        give(id, j, {
          by: cands.length === 1 ? "only" : "turn",
          weighed: line.map((uid, k) => ({ userId: uid, standing: round1(rel.get(uid)!), place: k + 1 })),
        });
      }
    } else {
      const rows = cands.map((id) => weigh(j, id));
      // It goes out whatever happens, so whoever has the most target left (with a budget) or is furthest behind
      // (with no limit). Doing it last time costs 1.5, as today, unless they'd rather do it.
      if (B) rows.forEach((r) => (r.score += r.lastTime && !togetherOf(j) && r.pref <= 0 ? REPEAT_COST : 0));
      let pool = rows.filter((r) => B || togetherOf(j) || r.roomy);
      if (!pool.length) pool = rows;
      const sorted = best(j, pool);
      const by = smartBy(cands, sorted);
      const pick = sorted.slice(0, n).map((r) => r.pid);
      const w = weighed(rows);
      for (const id of pick) give(id, j, { by, weighed: w });
    }
  }

  // 2. Smart with a budget: everyone home gets one John of their own before anyone gets a second.
  if (mode === "smart" && B) {
    const roomNow = (id: string) => target.get(id)! - dealt.get(id)!;
    const needers = ids
      .filter((id) => homeSet.has(id) && owed(id))
      .sort((a, b) => rel.get(a)! - rel.get(b)! || roomNow(b) - roomNow(a) || (a < b ? -1 : 1));
    const pool = ordered.filter((j) => !decided.has(j) && homeOf(j).some((id) => needers.includes(id))).slice(0, needers.length);
    // Doing it last time only counts against someone if someone else home could do it, not if they'd rather do it,
    // not for someone half the budget or more behind, and not once it has waited two weeks.
    const lastBy = (j: SteadyJohn, id: string) =>
      j.lastBy.includes(id) &&
      !((byId.get(id)!.rather[j.johnId] ?? 0) > 0) &&
      homeOf(j).length > 1 &&
      rel.get(id)! > -B / 2 + EPS &&
      j.waited < 2;
    const can = (j: SteadyJohn, id: string) => homeOf(j).includes(id) && !lastBy(j, id);
    // A John in a pool they're behind in counts as bigger for them, one they're ahead in as smaller.
    const size = (j: SteadyJohn, id: string) => j.points + (byId.get(id)!.rather[j.johnId] ?? 0) - lead(j, id);
    const biggest = (js: SteadyJohn[], id: string) => js.sort((x, y) => size(y, id) - size(x, id) || rk.get(y)! - rk.get(x)!)[0];
    const match = new Map<string, SteadyJohn>();
    const held = new Map<SteadyJohn, string>();
    const fewHands = (j: SteadyJohn) => homeOf(j).length < homeSet.size;
    needers.forEach((id, k) => {
      // A group's John that nobody still to choose could do goes to the person choosing, the most overdue first.
      const later = needers.slice(k + 1);
      const only = pool.filter((x) => !held.has(x) && fewHands(x) && can(x, id) && !later.some((o) => can(x, o)));
      const j = only.length ? only.sort((x, y) => rk.get(y)! - rk.get(x)!)[0] : biggest(pool.filter((x) => !held.has(x) && can(x, id)), id);
      if (j) {
        match.set(id, j);
        held.set(j, id);
      }
    });
    for (const id of needers) {
      let j = match.get(id);
      if (!j) {
        // Nothing in the overdue set is left for them: the next most overdue they can do, the biggest for someone
        // behind, the smallest for someone ahead.
        const next = ordered
          .filter((x) => !decided.has(x) && !held.has(x) && !pool.includes(x) && can(x, id))
          .slice(0, needers.length);
        j = rel.get(id)! < 0 ? biggest(next, id) : next.sort((x, y) => size(x, id) - size(y, id) || rk.get(y)! - rk.get(x)!)[0];
      }
      if (!j && rel.get(id)! < 0) j = biggest(pool.filter((x) => !held.has(x) && homeOf(x).includes(id)), id);
      if (!j) continue;
      held.set(j, id);
      const rows = homeOf(j)
        .filter((x) => needers.includes(x) && owed(x))
        .map((x) => weigh(j!, x));
      decided.add(j);
      give(id, j, { by: homeOf(j).length === 1 ? "only" : "oneEach", weighed: weighed(rows) });
    }
  }

  // 3. The rest, most overdue first.
  for (const j of ordered) {
    if (decided.has(j)) continue;
    decided.add(j);
    const cands = homeOf(j);
    if (!cands.length) {
      wait(j);
      continue;
    }
    const wt = j.waited;
    if (mode === "smart") {
      const rows = cands.map((id) => weigh(j, id));
      let pool: Row[];
      let stretched = false;
      let again = false;
      if (B) {
        // Who can take it, best first: 1) it fits, and they didn't do it last time (or they'd rather do it, or it's
        // their only John); 2) once it has waited a week, half the budget over; 3) once it has waited two weeks, or
        // only one person can do it, whoever did it last time.
        const other = (pid: string) =>
          ordered.some((x) => x !== j && !decided.has(x) && homeOf(x).includes(pid) && !x.lastBy.includes(pid));
        const freshTo = (r: Row) => !r.lastTime || r.pref > 0 || (owed(r.pid) && !other(r.pid));
        pool = rows.filter((r) => r.fits && freshTo(r));
        if (!pool.length && wt >= 1) {
          pool = rows.filter((r) => freshTo(r) && (r.fits || j.points <= r.room + B / 2 + EPS));
          stretched = pool.length > 0;
        }
        if (!pool.length && (wt >= 2 || cands.length === 1)) {
          pool = rows.filter((r) => r.fits);
          again = pool.length > 0 && cands.length > 1;
        }
      } else {
        pool = rows.filter((r) => r.roomy);
        if (!pool.length) pool = rows;
      }
      if (!pool.length) {
        wait(j);
        continue;
      }
      const sorted = best(j, pool);
      const win = sorted[0];
      give(win.pid, j, {
        by: smartBy(cands, sorted),
        weighed: weighed(rows),
        ...(stretched && win.room < j.points - EPS ? { stretched: true as const } : {}),
        ...(again && win.lastTime ? { again: true as const } : {}),
      });
    } else {
      // Classic: the next person in its order of turns who is home. Away or full, the next in line with room does
      // it, and they stay first in line.
      const q = order![j.johnId];
      const inLine = q.filter((id) => cands.includes(id));
      const first = inLine[0];
      const fitsFor = (id: string) => own.get(id)! === 0 || j.points <= target.get(id)! - dealt.get(id)! + EPS;
      // Whoever's turn it is may go half the budget over before it passes on, as Smart lets a John that waited:
      // otherwise someone with a group's John on top would pass their turns on week after week, and never get them back.
      const stretches = (id: string) => j.points <= target.get(id)! - dealt.get(id)! + B / 2 + EPS;
      const to = fitsFor(first) || stretches(first) ? first : inLine.slice(1).find(fitsFor);
      if (!to) {
        wait(j);
        continue;
      }
      const skipped = q.slice(0, q.indexOf(to)).length > 0;
      q.splice(q.indexOf(to), 1);
      q.push(to);
      give(to, j, {
        by: cands.length === 1 ? "only" : skipped ? "nextInLine" : "turn",
        weighed: inLine.map((uid, k) => ({
          userId: uid,
          standing: round1(rel.get(uid)!),
          ...(B ? { room: round1(target.get(uid)! - dealt.get(uid)!) } : {}),
          place: k + 1,
        })),
      });
    }
  }

  placeDays(places, active, members);

  return {
    places,
    waiting: nextWaited,
    turns: order,
    people: members.map((m) => ({
      userId: m.userId,
      rel: rel.get(m.userId)!,
      target: target.get(m.userId)!,
      dealt: dealt.get(m.userId)!,
      weekOff: homeSet.has(m.userId) && weekOff(m.userId),
    })),
    order: ordered.map((j) => j.johnId),
  };
}

/**
 * Each place's day, once everyone's Johns are known: a John that keeps its day
 * (or is done together) stays on it, on call is all week (0), and the rest go
 * to the nearest free day that suits the person, then the nearest free day,
 * and only then a day that already has one. Only days they're home and still
 * to come count; with none (a John coming back to someone away), its own day.
 * Sets each place's `day` and `why.moved`, from scratch, so it can run again
 * after a swap.
 */
export function placeDays(places: SteadyPlace[], johns: readonly SteadyJohn[], members: readonly SteadyMember[]): void {
  const johnOf = new Map(johns.map((j) => [j.johnId, j]));
  for (const m of members) {
    const mine = places.filter((p) => p.userId === m.userId);
    const taken = new Map<number, number>();
    for (const p of mine) {
      const j = johnOf.get(p.johnId)!;
      delete p.why.moved;
      if (j.onCall) p.day = 0;
      else if (pinnedOf(j)) {
        p.day = j.day;
        taken.set(p.day, (taken.get(p.day) ?? 0) + 1);
      }
    }
    const open = (d: number) => m.homeDays.includes(d);
    const suits = (d: number) => !m.suits.length || m.suits.includes(d);
    for (const p of mine) {
      const j = johnOf.get(p.johnId)!;
      if (j.onCall || pinnedOf(j)) continue;
      const days = BY_DIST[j.day].filter(open);
      const free = (d: number) => !taken.get(d);
      const d =
        days.find((x) => free(x) && suits(x)) ??
        days.find(free) ??
        [...days].sort((a, b) => (taken.get(a) ?? 0) - (taken.get(b) ?? 0))[0] ??
        j.day;
      p.day = d;
      if (d !== j.day) p.why.moved = !open(j.day) ? "away" : taken.get(j.day) ? "taken" : "suits";
      taken.set(d, (taken.get(d) ?? 0) + 1);
    }
  }
}
