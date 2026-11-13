/**
 * The Monday deal in Steady weeks: what the engine reads about a house, made
 * into one week of steadyWeek, and its answer made into assignments with due
 * times. Pure: the engine (apps/api lib/engine/tick.ts) reads the rows and
 * writes the result through deal_week, and this decides everything between.
 *
 * Days here are places in the house's own week (1 its first day … 7 its
 * last), so "nearest day" never wraps across a week that starts on a Sunday.
 * Fresh starts: a week dealt part-way through (the house's first deal, or an
 * admin's re-deal) only uses the days still to come, today included, and a
 * John that keeps its day whose day has gone sits this week out; someone who
 * moved in after the week was first dealt starts the next Monday, at a
 * balance of 0 (dealtMembers).
 */
import type { AwayPeriod } from "./away";
import { awayOn, homeForWeek } from "./away";
import { weekShares } from "./deal";
import type { IsoDow } from "./domain";
import type { Repeat } from "./repeat";
import { COMES_BACK_DAYS, landsInWeek } from "./repeat";
import type { DealMode } from "./domain";
import type { SteadyJohn, SteadyPlace, SteadyResult } from "./steady-types";
import { steadyWeek } from "./steady";
import { PLAN_WEEKS } from "./steady-types";
import { MONTH_WEEKS } from "./steady-run";
import type { Json } from "./db-types";
import type { WeekWindow } from "./week";
import { addDaysTo, dueAt, graceDue, localDate, nextWeek, weekIndex } from "./week";

export interface SteadyListJohn {
  id: string;
  points: number;
  kind: "day" | "on_call";
  /** An on-call John's usual calls a week. */
  perWeek: number;
  crew: number;
  keepDay: boolean;
  repeat: Repeat;
  /** `HH:mm`. */
  dueTime: string;
  /** Who shares it, of the people dealt this week: its group's, or everyone's. */
  sharers: readonly string[];
  /** Its group's id when it's only the group's; null for the whole house's (or a group nobody here is in). */
  groupId?: string | null;
}

/** A John's last turn before this week. */
export interface SteadyLastTurn {
  /** The local start date of the week it was dealt in. */
  startsOn: string;
  /** Who had it (everyone with a place, for a John done together). */
  userIds: readonly string[];
  /** It was one person's, missed, and when it was due. */
  missed?: { userId: string; dueAt: Date };
}

export interface SteadyDealMember {
  userId: string;
  balance: number;
  /** The balance split by pool: "" the whole house's Johns, and each group they're in now by its id (steady.ts). */
  pools?: Readonly<Record<string, number>>;
  /** Days that suit them, as ISO weekdays. */
  suits: readonly number[];
  /** John id → 1 rather do, −1 rather not. */
  rather: Readonly<Record<string, number>>;
}

export interface SteadyDealArgs {
  mode: DealMode;
  budget: number;
  week: WeekWindow;
  zone: string;
  weekStarts: IsoDow;
  now: Date;
  /** Everyone dealt this week (dealtMembers), in the order they joined. */
  members: readonly SteadyDealMember[];
  /** The whole list, due this week or not. */
  johns: readonly SteadyListJohn[];
  away: readonly AwayPeriod[];
  last: ReadonlyMap<string, SteadyLastTurn>;
  /** What the house's last dealt week before this one kept: Classic's orders of turns and the Johns waiting. */
  previous: SteadyState | null;
  /** On call: the points it usually takes a week (the average of its last 4 weeks), by John id. Missing: points × calls a week. */
  onCallPoints: ReadonlyMap<string, number>;
  /** What someone away still owes of their part: 1, 0.5 or 0. */
  makeup: number;
  seed: string;
}

export interface SteadyDealPlace extends SteadyPlace {
  /** When it's due; null for on call. */
  dueAt: Date | null;
  /** The ISO weekday it's on; 0 for on call. */
  dow: number;
  /** One job id per John done together, so its places stay together (crew.ts); null otherwise. */
  together: boolean;
}

/** What a dealt week keeps for the next deal: Classic's orders of turns (null in Smart) and the Johns waiting, John id → weeks waited. */
export interface SteadyState {
  turns: Record<string, string[]> | null;
  waiting: Record<string, number>;
}

export interface SteadyDealResult {
  places: SteadyDealPlace[];
  /** Each person's share of the week, from what was dealt (on call adds its flags as they're raised). */
  shares: Map<string, number>;
  /** The part of those shares that is each group's Johns: group id → person → share (week_group_shares). */
  groupShares: Map<string, Map<string, number>>;
  /** What deal_week keeps on the week for the next deal. */
  state: SteadyState;
  result: SteadyResult;
}

/** One of the weeks after this one, as the deal would hand it out: who has each John. */
export interface SteadyAheadWeek {
  /** The local date it starts on. */
  startsOn: string;
  /** John id → who has it (everyone with a place, for a John done together), in the order the deal handed them out. */
  johns: Record<string, string[]>;
}

/** How many weeks after this one the deal looks ahead, for Week's whose turn next. */
export const AHEAD_WEEKS = 2;

/** How many of an on-call John's last weeks set what it usually takes. */
export const ON_CALL_WEEKS = 4;

/**
 * What an on-call John usually takes a week, for the budget: its points for
 * each flag raised over its last 4 weeks on call (`weeks`, newest first, and
 * the week of each flag). Null until it has 4 weeks, when the deal counts its
 * calls a week instead.
 */
export function onCallUsual(points: number, weeks: readonly string[], flagWeeks: readonly string[]): number | null {
  const last = weeks.slice(0, ON_CALL_WEEKS);
  if (last.length < ON_CALL_WEEKS) return null;
  return (points * flagWeeks.filter((w) => last.includes(w)).length) / last.length;
}

/** A day's place in the house's week (1 its first day … 7 its last) from its ISO weekday, and back. */
export const placeOfDow = (dow: number, weekStarts: IsoDow): number => ((dow - weekStarts + 7) % 7) + 1;
export const dowOfPlace = (place: number, weekStarts: IsoDow): IsoDow => ((((weekStarts - 1 + place - 1) % 7) + 7) % 7 + 1) as IsoDow;

/** Weeks between a John's turns: its every-N-weeks, or its months in weeks; 1 for on call. */
export function periodWeeks(john: Pick<SteadyListJohn, "kind" | "repeat">): number {
  if (john.kind === "on_call") return 1;
  return john.repeat.everyMonths !== null ? john.repeat.everyMonths * MONTH_WEEKS : Math.max(1, john.repeat.everyWeeks);
}

/**
 * Who the week is dealt to: everyone who moved in before it was first dealt
 * (`dealtAt`, the week's own row; null when it's being dealt now). A re-deal
 * part-way through keeps it that way: someone who joined since starts the
 * next Monday, at a balance of 0, rather than owe a week already under way.
 */
export function dealtMembers<T extends { joinedAt: Date }>(members: readonly T[], dealtAt: Date | null, now: Date): T[] {
  const from = (dealtAt ?? now).getTime();
  return members.filter((m) => m.joinedAt.getTime() <= from);
}

/** The week's deal. */
export function steadyDeal(args: SteadyDealArgs): SteadyDealResult {
  const { week, zone, weekStarts, now } = args;
  const ids = args.members.map((m) => m.userId);
  const today = localDate(now, zone);
  const midWeek = now.getTime() > week.startsAt.getTime();
  const dateOf = (place: number) => addDaysTo(week.startsOn, place - 1);
  const lastDay = dateOf(7);
  const open = (place: number) => !midWeek || dateOf(place) >= today;
  const homeDays = new Map(
    ids.map((id) => [id, [1, 2, 3, 4, 5, 6, 7].filter((p) => open(p) && !awayOn(args.away, id, dateOf(p)))]),
  );
  const thisWeek = weekIndex(week.startsOn);
  const previousWaiting = args.previous?.waiting ?? {};

  const johns: SteadyJohn[] = [];
  const sitsOut: Record<string, number> = {};
  for (const j of args.johns) {
    const sharers = j.sharers.filter((id) => ids.includes(id));
    if (!sharers.length) continue;
    const onCall = j.kind === "on_call";
    const day = onCall ? placeOfDow(weekStarts, weekStarts) : placeOfDow(j.repeat.dueDow, weekStarts);
    const pinned = !onCall && (j.keepDay || j.crew !== 1);
    // A John that keeps its day, whose day has gone, sits this week out and keeps its place in the queue.
    if (pinned && !open(day)) {
      if (previousWaiting[j.id]) sitsOut[j.id] = previousWaiting[j.id];
      continue;
    }
    const home = onCall
      ? homeForWeek(args.away, sharers, week.startsOn, lastDay).filter((id) => homeDays.get(id)!.length > 0)
      : pinned
        ? sharers.filter((id) => homeDays.get(id)!.includes(day))
        : sharers.filter((id) => homeDays.get(id)!.length > 0);
    const last = args.last.get(j.id);
    const period = periodWeeks(j);
    const waited = previousWaiting[j.id] ?? 0;
    const missed = last?.missed;
    const back =
      !onCall && j.crew === 1 && missed && ids.includes(missed.userId) && sharers.includes(missed.userId)
        ? week.startsAt.getTime() - missed.dueAt.getTime() <= COMES_BACK_DAYS * 86_400_000
          ? missed.userId
          : null
        : null;
    johns.push({
      johnId: j.id,
      points: onCall ? (args.onCallPoints.get(j.id) ?? j.points * j.perWeek) : j.points,
      period,
      day,
      keepDay: !onCall && j.keepDay,
      crew: onCall ? 1 : j.crew,
      onCall,
      sharers,
      pool: j.groupId ?? "",
      home,
      due: onCall || landsInWeek(j.repeat, week.startsOn, weekStarts),
      waited,
      back,
      lastBy: last ? last.userIds.filter((id) => ids.includes(id)) : [],
      since: last ? thisWeek - weekIndex(last.startsOn) : period + waited,
      ahead: Array.from({ length: PLAN_WEEKS }, (_, k) => onCall || landsInWeek(j.repeat, addDaysTo(week.startsOn, 7 * k), weekStarts)),
    });
  }

  const result = steadyWeek({
    mode: args.mode,
    budget: args.budget,
    johns,
    members: args.members.map((m) => ({
      userId: m.userId,
      balance: m.balance,
      ...(m.pools ? { pools: m.pools } : {}),
      homeDays: homeDays.get(m.userId)!,
      suits: m.suits.map((d) => placeOfDow(d, weekStarts)),
      rather: m.rather,
    })),
    turns: args.mode === "classic" ? (args.previous?.turns ?? null) : null,
    seed: args.seed,
    makeup: args.makeup,
  });

  const johnOf = new Map(johns.map((j) => [j.johnId, j]));
  const listOf = new Map(args.johns.map((j) => [j.id, j]));
  const places: SteadyDealPlace[] = result.places.map((p) => {
    const j = johnOf.get(p.johnId)!;
    if (j.onCall) return { ...p, dueAt: null, dow: 0, together: false };
    const dow = dowOfPlace(p.day, weekStarts);
    let due = dueAt(week, zone, weekStarts, dow, listOf.get(p.johnId)!.dueTime.slice(0, 5));
    if (midWeek) due = graceDue(due, now, week.endsAt);
    // Off its own day because that day had gone when the week was dealt, not because anyone's away.
    if (p.why.moved === "away" && !open(j.day) && !awayOn(args.away, p.userId, dateOf(j.day))) p.why.moved = "gone";
    return { ...p, dueAt: due, dow, together: j.crew !== 1 };
  });
  const items = places
    .filter((p) => p.dueAt)
    .map((p) => {
      const j = johnOf.get(p.johnId)!;
      return { johnId: p.johnId, points: p.points, lastUserId: null, sharers: j.sharers, home: j.home, pool: j.pool ?? "" };
    });
  const shares = weekShares(items, ids, args.makeup);
  const groupShares = new Map<string, Map<string, number>>();
  for (const g of new Set(items.map((x) => x.pool).filter(Boolean)))
    groupShares.set(g, weekShares(items.filter((x) => x.pool === g), ids, args.makeup));
  return { places, shares, groupShares, state: { turns: result.turns, waiting: { ...sitsOut, ...result.waiting } }, result };
}

/**
 * The weeks after this one as the deal would hand them out if everything
 * dealt is done and nothing else changes (time away already booked counts):
 * who has each John, for Week's whose turn next and Classic's next two
 * weeks. A forecast kept with the week; each Monday's own deal decides.
 */
export function steadyAhead(args: SteadyDealArgs, plan: SteadyDealResult, weeks: number = AHEAD_WEEKS): SteadyAheadWeek[] {
  const out: SteadyAheadWeek[] = [];
  const listOf = new Map(args.johns.map((j) => [j.id, j]));
  let at = args;
  let dealt = plan;
  for (let k = 1; k <= weeks; k++) {
    // Everything done as dealt: each person's work done, less their share.
    const balance = new Map(at.members.map((m) => [m.userId, m.balance]));
    for (const p of dealt.places) if (p.dueAt) balance.set(p.userId, (balance.get(p.userId) ?? 0) + p.points);
    for (const [id, share] of dealt.shares) balance.set(id, (balance.get(id) ?? 0) - share);
    // And each group's pool by its own Johns; the whole house's pool is whatever's left.
    const pool = (m: SteadyDealMember, g: string) => {
      let v = m.pools![g];
      for (const p of dealt.places) if (p.dueAt && p.userId === m.userId && listOf.get(p.johnId)?.groupId === g) v += p.points;
      return v - (dealt.groupShares.get(g)?.get(m.userId) ?? 0);
    };
    const poolsOf = (m: SteadyDealMember) => {
      if (!m.pools) return undefined;
      const groups = Object.fromEntries(Object.keys(m.pools).filter(Boolean).map((g) => [g, pool(m, g)]));
      const total = balance.get(m.userId) ?? m.balance;
      return { ...groups, "": total - Object.values(groups).reduce((s, v) => s + v, 0) };
    };
    const last = new Map(at.last);
    for (const [johnId, userIds] of Object.entries(holders(dealt.places))) last.set(johnId, { startsOn: at.week.startsOn, userIds });
    const week = nextWeek(at.week, at.zone, at.weekStarts);
    at = {
      ...at,
      week,
      now: week.startsAt,
      members: at.members.map((m) => ({ ...m, balance: balance.get(m.userId) ?? m.balance, pools: poolsOf(m) })),
      last,
      previous: dealt.state,
      seed: `${args.seed}+${k}`,
    };
    dealt = steadyDeal(at);
    out.push({ startsOn: week.startsOn, johns: holders(dealt.places) });
  }
  return out;
}

function holders(places: readonly SteadyPlace[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of places) if (!(out[p.johnId] ?? []).includes(p.userId)) out[p.johnId] = [...(out[p.johnId] ?? []), p.userId];
  return out;
}

/** What a week row keeps (weeks.turns, waiting and ahead), as stored; anything unexpected left out. */
export function weekStateOf(row: { turns?: Json | null; waiting?: Json | null; ahead?: Json | null }): SteadyState & {
  ahead: SteadyAheadWeek[];
} {
  const obj = (j: Json | null | undefined): Record<string, Json> | null =>
    j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json>) : null;
  const ids = (j: Json | undefined): string[] => (Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : []);
  const turns = obj(row.turns);
  const ahead: SteadyAheadWeek[] = [];
  for (const w of Array.isArray(row.ahead) ? row.ahead : []) {
    const week = obj(w);
    const johns = obj(week?.johns);
    if (!week || typeof week.startsOn !== "string" || !johns) continue;
    ahead.push({ startsOn: week.startsOn, johns: Object.fromEntries(Object.entries(johns).map(([id, v]) => [id, ids(v)])) });
  }
  return {
    turns: turns ? Object.fromEntries(Object.entries(turns).filter(([, v]) => Array.isArray(v)).map(([id, v]) => [id, ids(v)])) : null,
    waiting: Object.fromEntries(
      Object.entries(obj(row.waiting) ?? {}).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0),
    ),
    ahead,
  };
}
