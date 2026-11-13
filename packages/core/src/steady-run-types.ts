import type { DealMode } from "./domain";
import type { SteadyPlace, SteadyResult } from "./steady-types";

// What a run of Steady weeks (steady-run.ts) is handed and hands back.

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
export type ByLength<T> = T | ((weeks: number) => T);

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
