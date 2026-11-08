import type { Outcome } from "./domain";

/**
 * When a John's result becomes final, and what it is.
 *
 * A tick does not count the moment it is made: it stands once the dispute
 * window has passed with no dispute open. The engine calls `settleOutcome`
 * on every unsettled assignment each tick and stamps whatever comes back;
 * `liveStatus` is the same rule read early, for the screens.
 *
 * A cover is a tick by a housemate instead of the assignee (`coveredBy`).
 * It is checked like any tick and, once it stands, settles as `covered`
 * rather than done or late.
 *
 * A place on a Together John that its roll call left off (`absentAt`) is
 * checked with that roll call and, once it stands, settles as missed. It
 * shows as missed from the moment of the roll call, as a cover shows as
 * covered.
 */

export interface AssignmentFacts {
  dueAt: Date;
  doneAt: Date | null;
  excused: boolean;
  /** A dispute has been raised on the current tick and not yet resolved. */
  disputeOpen: boolean;
  /** In a family: a kid's tick waiting for a parent's OK. It holds until a parent answers, with no closing time. */
  awaitsOk?: boolean;
  weekEndsAt: Date;
  /**
   * On a John due on a day: when it turns missed, its due time plus the
   * house's late window (assignments.closes_at). Null on one dealt before
   * the house had a late window, which closes when its week ends.
   */
  closesAt?: Date | null;
  /** Set on an on-call John's flag: when it was raised (its due time is this plus the John's window). */
  flaggedAt?: Date | null;
  /** Who covered it, when the tick is a housemate's rather than the assignee's. */
  coveredBy?: string | null;
  /** When a roll call left its holder off (crew.ts). */
  absentAt?: Date | null;
}

const HOUR = 3_600_000;

/**
 * When an open John turns missed. A John due on a day: the house's late
 * window after it was due (a day, by default), whatever day of the week that
 * is, so a Monday John and a Sunday John get the same time to be done late.
 * A flag: at twice its window (raised at 8pm with 12 hours, missed at 8pm the
 * next day), or when its week ends if it is overdue by then. A flag never
 * passes to whoever is on call next week: it stays missed or done by whoever
 * had it. A flag struck by the house gets at least closesAt (12 hours from
 * the strike) to be done again. The database's closes_at says the same.
 */
export function closesAt(a: Pick<AssignmentFacts, "dueAt" | "weekEndsAt" | "flaggedAt" | "closesAt">): Date {
  if (!a.flaggedAt) return a.closesAt ?? a.weekEndsAt;
  const missAt = new Date(a.dueAt.getTime() * 2 - a.flaggedAt.getTime());
  const own = a.dueAt < a.weekEndsAt && missAt >= a.weekEndsAt ? a.weekEndsAt : missAt;
  // A flag has no closes_at of its own: one set is a struck tick's time to redo it.
  return a.closesAt && a.closesAt > own ? a.closesAt : own;
}

export function standsAt(doneAt: Date, disputeHours: number): Date {
  return new Date(doneAt.getTime() + disputeHours * HOUR);
}

/** The final outcome, or null while the house can still change it. */
export function settleOutcome(
  a: AssignmentFacts,
  now: Date,
  disputeHours: number,
): Outcome | null {
  if (a.excused) return "excused";
  if (a.absentAt) {
    if (a.disputeOpen || now < standsAt(a.absentAt, disputeHours)) return null;
    return "missed";
  }
  if (a.doneAt) {
    if (a.disputeOpen || a.awaitsOk) return null;
    if (now < standsAt(a.doneAt, disputeHours)) return null;
    if (a.coveredBy) return "covered";
    return a.doneAt <= a.dueAt ? "done" : "late";
  }
  if (now >= closesAt(a)) return "missed";
  return null;
}

/** What a screen shows for a John right now. */
export type LiveStatus =
  | "upcoming" // not done, due more than a day away
  | "due-soon" // not done, due within a day
  | "overdue" // not done, past due, week still open
  | "checking" // ticked, inside the dispute window (or, in a family, waiting for a parent's OK)
  | "disputed" // ticked, dispute open (a place its roll call left off, too)
  | Outcome; // "covered" from the moment a housemate covers it, while it's checked too; "missed" from a roll call that left its holder off

const DAY = 24 * HOUR;

export function liveStatus(
  a: AssignmentFacts & { outcome: Outcome | null },
  now: Date,
  disputeHours: number,
): LiveStatus {
  if (a.outcome) return a.outcome;
  const settled = settleOutcome(a, now, disputeHours);
  if (settled) return settled;
  if (a.absentAt) return a.disputeOpen ? "disputed" : "missed";
  if (a.doneAt) return a.disputeOpen ? "disputed" : a.coveredBy ? "covered" : "checking";
  if (now > a.dueAt) return "overdue";
  if (a.dueAt.getTime() - now.getTime() <= DAY) return "due-soon";
  return "upcoming";
}

/** Whether a tick now would count as on time, late, or not at all (`closes` is when it turns missed). */
export function tickWouldBe(dueAt: Date, now: Date, closes: Date): "on-time" | "late" | "closed" {
  if (now >= closes) return "closed";
  return now <= dueAt ? "on-time" : "late";
}

/**
 * When a housemate can first cover a John that is still undone: the house's
 * grace after it was due, or halfway to when it turns missed if that comes
 * sooner, so there is always time to cover it however short the late window.
 */
export function coverOpensAt(dueAt: Date, graceHours: number, closes: Date): Date {
  const half = Math.max(0, (closes.getTime() - dueAt.getTime()) / 2);
  return new Date(dueAt.getTime() + Math.min(graceHours * HOUR, half));
}

/**
 * Whether `userId` could cover this John now: someone else's, not ticked,
 * excused or settled, past its due time by the house's grace, not held by
 * its owner ("I'm on it", hold_cover) and not yet missed. The same rule
 * cover_john enforces, read early so a screen only offers what will work.
 */
export function canCover(
  a: {
    userId: string;
    doneAt: Date | null;
    outcome: Outcome | null;
    excused?: boolean;
    dueAt: Date;
    closesAt: Date;
    absentAt?: Date | null;
    heldUntil?: Date | null;
  },
  userId: string,
  now: Date,
  graceHours: number,
): boolean {
  if (a.userId === userId || a.doneAt || a.outcome || a.excused || a.absentAt) return false;
  if (a.heldUntil && now < a.heldUntil) return false;
  return now >= coverOpensAt(a.dueAt, graceHours, a.closesAt) && now < a.closesAt;
}

/**
 * Whether the viewer can say "I'm on it" on this John (hold_cover): their
 * own, done by one, still undone, open to covers now, and not held before.
 * Offered only once covers are open, so the hold is never spent inside the
 * grace, when nobody could cover it anyway.
 */
export function holdable(
  a: {
    userId: string;
    doneAt: Date | null;
    outcome: Outcome | null;
    excused?: boolean;
    dueAt: Date;
    closesAt: Date;
    absentAt?: Date | null;
    heldUntil?: Date | null;
    jobId?: string | null;
  },
  userId: string,
  now: Date,
  graceHours: number,
): boolean {
  if (a.userId !== userId || a.heldUntil || a.jobId || a.doneAt || a.outcome || a.excused || a.absentAt) return false;
  return now >= coverOpensAt(a.dueAt, graceHours, a.closesAt) && now < a.closesAt;
}
