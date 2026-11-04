/**
 * The words the whole app shares. Pure data, no I/O: everything in `lib/`
 * that decides something imports its vocabulary from here, and so do the
 * migrations' CHECK constraints (keep the two lists in step).
 */

/** What kind of John it is. Each one wears its bin-lid colour (bin-night.ts). */
export const CATEGORIES = [
  "kitchen",
  "bathroom",
  "bins",
  "floors",
  "errands",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bins: "Bins & recycling",
  floors: "Floors & hoovering",
  errands: "Errands & shopping",
  other: "Everything else",
};

/**
 * A kind as a line about one John says it, short enough to leave room for
 * when: "Bins, today 21:00", "Other, was due Tue".
 */
export const CATEGORY_SHORT: Record<Category, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bins: "Bins",
  floors: "Floors",
  errands: "Errands",
  other: "Other",
};

/**
 * When a John needs doing: on a set day each week it comes round, or on call,
 * whenever someone flags it (the bins when they're full).
 */
export const JOHN_WHEN = ["day", "on_call"] as const;
export type JohnWhen = (typeof JOHN_WHEN)[number];

/** How long whoever is on call has to do a flagged John, in hours. */
export const RESPOND_HOURS = [2, 4, 8, 12, 24, 48] as const;

/**
 * How a John ended, once the house can no longer argue about it.
 * - `done`: ticked by its due time and nobody upheld a dispute.
 * - `late`: ticked after its due time but before the week closed.
 * - `missed`: the week closed without a tick that stood.
 * - `excused`: an immunity token was spent on it.
 * - `covered`: a housemate did it instead, once it was overdue (see
 *   outcome.ts). For the assignee it counts as missed; the coverer earns
 *   its points and the forfeit.
 */
export const OUTCOMES = ["done", "late", "missed", "excused", "covered"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** The four currencies a house can keep its Stake in. All have 2 decimals. */
export const CURRENCIES = ["GBP", "CAD", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export type IsoDow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DOW_LABEL: Record<IsoDow, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * How the deal chooses who does each John (steady.ts): Smart weighs who's
 * ahead or behind, who did it recently and everyone's preferences; Classic
 * takes turns in a fixed order.
 */
export const DEAL_MODES = ["smart", "classic"] as const;
export type DealMode = (typeof DEAL_MODES)[number];

/** The budget sizes an admin picks from, in points a week each: Light, Usual, Busy, and 0 for no limit. */
export const BUDGETS = [2, 4, 6, 0] as const;
export type Budget = (typeof BUDGETS)[number];

/** Someone's best time of day, for the time Plan it suggests, and the hour it stands for. */
export const BEST_TIMES = ["morning", "afternoon", "evening"] as const;
export type BestTime = (typeof BEST_TIMES)[number];
export const BEST_TIME_HOUR: Record<BestTime, number> = { morning: 9, afternoon: 14, evening: 19 };

/**
 * Who lives in a house (houses.kind): housemates, equals sharing a place, or
 * a family, where parents deal out Johns and kids do them. A family is the
 * same house underneath with its own words and no Stake
 * (docs/specs/family-houses.md).
 */
export const HOUSE_KINDS = ["housemates", "family"] as const;
export type HouseKind = (typeof HOUSE_KINDS)[number];

/** A house row's kind, as the app reads it: anything unknown is housemates. */
export function houseKind(kind: string | null | undefined): HouseKind {
  return kind === "family" ? "family" : "housemates";
}

/** The knobs a house turns. Money is always in minor units (pence, cents). */
/** Where a house settles up at month end (houses.settle_in): here, by marking what arrives, or in Splitwise. */
export const SETTLE_IN = ["jonz", "splitwise"] as const;
export type SettleIn = (typeof SETTLE_IN)[number];

export interface HouseRules {
  timezone: string;
  currency: Currency;
  weekStarts: IsoDow;
  stakeMinor: number;
  lateForfeitMinor: number;
  missedForfeitMinor: number;
  /** How long a tick can be disputed before it stands. */
  disputeHours: number;
  /** How long past its due time a John stays the assignee's alone, before a housemate can cover it. */
  coverGraceHours: number;
  /** How long past its due time a John can still be done late, before it counts as missed. */
  lateHours: number;
  /** How the deal chooses who. */
  dealMode: DealMode;
  /** Points a week each (BUDGETS), or 0 for no limit. */
  dealBudget: number;
}

/** What a new family's kids can each earn in a month, in minor units (create_house). */
export const FAMILY_POCKET_CAP = 1000;

export const DEFAULT_RULES: Omit<HouseRules, "timezone" | "currency"> = {
  weekStarts: 1,
  stakeMinor: 2000,
  lateForfeitMinor: 100,
  missedForfeitMinor: 300,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: "smart",
  dealBudget: 4,
};
