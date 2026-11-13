import type { DealMode } from "./domain";

// What the Steady weeks deal (steady.ts) is handed and hands back.

/** Weeks a John waits before it goes to the front of the list. */
export const FRONT_WEEKS = 3;

/** How far ahead Classic looks when it picks who starts each John's order of turns. */
export const PLAN_WEEKS = 12;

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

/** A John that keeps its day or is done together always goes out. */
export const pinnedOf = (j: SteadyJohn) => j.keepDay || j.crew !== 1;
export const togetherOf = (j: SteadyJohn) => j.crew !== 1;
