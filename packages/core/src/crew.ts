/**
 * Shared Jonz: Johns done together, and help on any John.
 *
 * The one rule: a John's points are shared evenly by everyone who did it.
 *
 * A John's "Done by" (johns.crew) is 1, 2 to 6, or 0 for everyone home; its
 * points are per person. The deal hands a Together John out as one place per
 * person, linked by a job (assignments.job_id), so in the week's shares a
 * 3-person garden tidy at 4 points counts as 12.
 *
 * Whoever ticks a John says who did it: the roll call. It settles every open
 * place of the job at once. Everyone on it shares the points of those places,
 * helpers included (2-point bins done with help is 1 each); a holder left
 * off it has a miss once it stands, and their part goes to whoever did the
 * job, as a cover's does. Someone away keeps their place excused; if they
 * turn up anyway, that place's points join the share.
 *
 * The database does the same (supabase/migrations/20261102090000_shared_jonz.sql:
 * roll_call, house_balances); this is that rule for the screens: the
 * Table's credit (tableInputs), the roll call before it's sent
 * (rollCallPlan), and the words.
 */
import type { Words } from "./words-for";
import { pointsLabel } from "./format";
import type { LiveStatus } from "./outcome";
import type { SharedJob, TableInput } from "./points";

/** "Done by", as the list keeps it: 1 to 6 people, or 0 for everyone home. */
export const CREW_CHOICES = [1, 2, 3, 4, 5, 6, 0] as const;

/** A roll call's row as read: `crew(user_id, helper, points)` on the place it was ticked from. */
export interface CrewRow {
  user_id: string;
  helper: boolean;
  /** Numeric in the database: PostgREST may hand it back as a string. */
  points: number | string;
}

export interface CrewMember {
  userId: string;
  /** Held no place it settled: came to help. */
  helper: boolean;
  /** What they earned: the job's points over how many did it. */
  points: number;
}

/** A roll call: who did a John, ticked from which place by whom, and what they shared. */
export interface Crew {
  /** The place it was ticked from. */
  tickedFrom: string;
  /** That place's holder, who ticked it. */
  tickedBy: string;
  /** Whoever ticked it first, then the rest in the order read. */
  people: CrewMember[];
  /** The points of every place it settled: what they share. */
  total: number;
}

/** A place's job: the places of one Together John share it, and a John done by one is its own. */
export function jobKey(place: { id: string; jobId?: string | null }): string {
  return place.jobId ?? place.id;
}

/**
 * Each roll call, by job, from assignments read with their crew embedded
 * (`crew(user_id, helper, points)`, on the place it was ticked from).
 */
export function crewByJob(
  rows: readonly { id: string; user_id: string; job_id?: string | null; crew?: readonly CrewRow[] | null }[],
): Map<string, Crew> {
  const out = new Map<string, Crew>();
  for (const r of rows) {
    if (!r.crew || r.crew.length === 0) continue;
    const people = r.crew
      .map((c) => ({ userId: c.user_id, helper: c.helper, points: Number(c.points) }))
      .sort((a, b) => Number(b.userId === r.user_id) - Number(a.userId === r.user_id));
    const total = Math.round(people.reduce((sum, p) => sum + p.points, 0));
    out.set(r.job_id ?? r.id, { tickedFrom: r.id, tickedBy: r.user_id, people, total });
  }
  return out;
}

/** One place, as the Table weighs it. */
export interface CreditPlace {
  id: string;
  jobId?: string | null;
  userId: string;
  points: number;
  status: LiveStatus;
  coveredBy: string | null;
  /** Left off its job's roll call. */
  absentAt?: Date | null;
  /** Its job's roll call, if it has had one. */
  crew?: Crew | null;
}

/**
 * What the Table counts (points.ts standings): every place, marked shared
 * where its job's roll call moved its points to the crew (its holder was on
 * it, or was left off), and each roll call once, at how the tick from its
 * place stands.
 */
export function tableInputs(places: readonly CreditPlace[]): { rows: TableInput[]; jobs: SharedJob[] } {
  const rows: TableInput[] = places.map((p) => ({
    userId: p.userId,
    points: p.points,
    status: p.status,
    coveredBy: p.coveredBy,
    shared: !!p.crew && (!!p.absentAt || p.crew.people.some((c) => c.userId === p.userId)),
  }));
  const jobs: SharedJob[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    if (!p.crew || seen.has(p.crew.tickedFrom)) continue;
    seen.add(p.crew.tickedFrom);
    const from = places.find((x) => x.id === p.crew!.tickedFrom) ?? p;
    jobs.push({ status: from.status, points: p.crew.total, crew: p.crew.people });
  }
  return { rows, jobs };
}

/** A John's places on the board: its job's, or just itself for a John done by one. */
export function jobPlaces<T extends { id: string; jobId?: string | null }>(item: T, items: readonly T[]): T[] {
  if (!item.jobId) return [item];
  const places = items.filter((i) => i.jobId === item.jobId);
  return places.length > 0 ? places : [item];
}

/** A place on the board, as the roll call weighs it. */
export function rollCallPlace(i: {
  userId: string;
  points: number;
  status: LiveStatus;
  doneAt: Date | null;
  absentAt?: Date | null;
  coveredBy: string | null;
  outcome: string | null;
}): RollCallPlace {
  return {
    userId: i.userId,
    points: i.points,
    doneAt: i.doneAt,
    absentAt: i.absentAt ?? null,
    coveredBy: i.coveredBy,
    outcome: i.outcome,
    excused: i.status === "excused",
  };
}

/** A place, as the roll call weighs it. */
export interface RollCallPlace {
  userId: string;
  points: number;
  doneAt: Date | null;
  absentAt?: Date | null;
  coveredBy?: string | null;
  outcome: string | null;
  excused: boolean;
}

export interface RollCallPlan {
  /** The points of every place it would settle: what everyone on it shares. */
  total: number;
  /** What each would earn. */
  each: number;
  /** Holders it would leave off: a miss for each, once it stands. */
  absent: string[];
  /** On it, holding no place it settles: helpers. */
  helpers: string[];
}

/** Still to do: not ticked, covered, settled, excused or left off. */
function open(p: RollCallPlace): boolean {
  return !p.doneAt && !p.absentAt && !p.coveredBy && p.outcome === null && !p.excused;
}

/**
 * What a roll call would do, before it's sent: the places of the John's job
 * (just the one, for a John done by one) and who's on it. The same sums as
 * roll_call: every open place, and an excused one whose holder is on it.
 */
export function rollCallPlan(places: readonly RollCallPlace[], crew: readonly string[]): RollCallPlan {
  const counted = places.filter(
    (p) => !p.doneAt && !p.coveredBy && !p.absentAt && (open(p) || (p.excused && crew.includes(p.userId))),
  );
  const total = counted.reduce((sum, p) => sum + p.points, 0);
  return {
    total,
    each: crew.length > 0 ? total / crew.length : 0,
    absent: places.filter((p) => open(p) && !crew.includes(p.userId)).map((p) => p.userId),
    helpers: crew.filter((id) => !counted.some((p) => p.userId === id)),
  };
}

/**
 * Who the roll call starts with: you (whoever ticks it did it), then everyone
 * else still holding an open place in the job. Unticking someone leaves them
 * off; anyone else in the house can be added as a helper.
 */
export function rollCallStart(places: readonly RollCallPlace[], userId: string): string[] {
  const holders = places.filter((p) => open(p) && p.userId !== userId).map((p) => p.userId);
  return [userId, ...holders.filter((id, i) => holders.indexOf(id) === i)];
}

/** "4 pts", "1.5 pts", "1.3 pts": a share, to a tenth. */
export function shareLabel(points: number, words: Words): string {
  return pointsLabel(points, words);
}

/** The John editor's line under "Done by": "4 pts each, so 12 in all". Null for one person. */
export function crewLine(crew: number, points: number, words: Words): string | null {
  if (crew === 1) return null;
  if (crew === 0) return words('john.crew.everyoneEach', { each: pointsLabel(points, words) });
  return words('john.crew.inAll', { each: pointsLabel(points, words), total: pointsLabel(points * crew, words) });
}

/** "Ben", "Ben and Cal", "Ben, Cal and Dee". */
export function andNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
