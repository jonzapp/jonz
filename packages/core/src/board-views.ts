import { crewByJob, jobKey, tableInputs, type CrewRow } from "./crew";
import type { Outcome } from "./domain";
import { canCover, liveStatus, type LiveStatus } from "./outcome";
import { standings, type TableRow } from "./points";
import { BoardItem, Row, WeekBoard } from "./board";

// What the screens make of a week's board: the on-call Johns, Today's order,
// what's waiting for a vote, an OK or a cover, and the month's standings.

/** Who is on call this week, as read: `on_call` with its John's name and kind. */
export interface OnCallRow {
  john_id: string;
  user_id: string;
  johns: { name: string; category: string; needs_photo?: boolean; archived_at?: string | null } | null;
}

/** An on-call John this week: who has it, its open flag if it has one, and how often it was flagged. */
export interface OnCallItem {
  johnId: string;
  name: string;
  category: string;
  /** Its tick needs a photo. */
  needsPhoto: boolean;
  /** Who the deal put on call. An open flag can be with someone else (they were away when it was raised). */
  holderId: string;
  /** The flag not yet ticked, if there is one: flagging again changes nothing until it's done. */
  openFlag: BoardItem | null;
  /** Flags raised this week. */
  times: number;
  /**
   * The latest Done it: a flag its holder raised and ticked themselves. For
   * a while after it, Done it shows as done and can't be said again
   * (DONE_IT_HOLD_MS).
   */
  lastDoneIt: BoardItem | null;
}

/** How long a Done it holds: a second within it is a repeat tap, and the database refuses it too (raise_flag's just_done). */
export const DONE_IT_HOLD_MS = 10 * 60_000;

/** The Done it still holding at `now`, if there is one: Today shows it as done instead of offering Done it again. */
export function heldDoneIt(item: OnCallItem, now: Date): BoardItem | null {
  const done = item.lastDoneIt;
  return done?.doneAt && now.getTime() - done.doneAt.getTime() < DONE_IT_HOLD_MS ? done : null;
}

/** The week's on-call Johns, in the list's order, with each one's open flag from the board. */
export function onCallItems(rows: readonly OnCallRow[], board: WeekBoard): OnCallItem[] {
  return rows
    .filter((r) => r.johns && !r.johns.archived_at)
    .map((r) => {
      const flags = board.items.filter((i) => i.johnId === r.john_id && i.flaggedAt !== null);
      const open = flags
        .filter((i) => i.doneAt === null && i.outcome === null)
        .sort((a, b) => b.flaggedAt!.getTime() - a.flaggedAt!.getTime());
      return {
        johnId: r.john_id,
        name: r.johns!.name,
        category: r.johns!.category,
        needsPhoto: (r.johns!.needs_photo ?? false) && board.photos !== false,
        holderId: r.user_id,
        openFlag: open[0] ?? null,
        times: flags.filter((i) => !i.carried).length,
        lastDoneIt:
          flags
            .filter((i) => i.doneAt !== null && i.flaggedBy === i.userId && i.coveredBy === null)
            .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())[0] ?? null,
      };
    });
}

/** Still to do: not ticked, not excused, not yet settled. */
export function isOpen(status: LiveStatus): boolean {
  return status === "overdue" || status === "due-soon" || status === "upcoming";
}

/** Today's order: what needs doing first, then what's being checked, then what's settled. */
export const TODAY_ORDER: Record<LiveStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  upcoming: 2,
  disputed: 3,
  checking: 4,
  late: 5,
  done: 6,
  excused: 7,
  missed: 8,
  covered: 9,
};

/**
 * Finished Johns as a "Done (n)" fold lists them, on Today and Week alike:
 * the latest done first (a John skipped with immunity, never ticked, by
 * when it was due).
 */
export function byDoneLatest(a: { doneAt?: Date | null; dueAt: Date }, b: { doneAt?: Date | null; dueAt: Date }): number {
  return (b.doneAt ?? b.dueAt).getTime() - (a.doneAt ?? a.dueAt).getTime();
}

/**
 * Today for one housemate: their Johns in Today's order, how many are left,
 * what awaits their vote (anyone's tick but their own, a cover of their
 * John included), given the moment and the house's grace, housemates'
 * Johns they could cover, and, for a parent in a family, the kids' ticks
 * waiting for an OK.
 */
export function todayView(board: WeekBoard, userId: string, cover?: { now: Date; graceHours: number }, parent = false) {
  const mine = board.items
    .filter((i) => i.userId === userId)
    .sort((a, b) => TODAY_ORDER[a.status] - TODAY_ORDER[b.status] || a.dueAt.getTime() - b.dueAt.getTime());
  return {
    mine,
    left: mine.filter((i) => isOpen(i.status)).length,
    toVote: toVote(board, userId),
    toCover: cover ? toCover(board, userId, cover.now, cover.graceHours) : [],
    toOk: parent ? toOk(board, userId) : [],
  };
}

/**
 * In a family, the kids' ticks waiting for a parent's OK, oldest first: what
 * a parent's "Needs your OK" lists. A Together John's one tick is listed
 * once, on the place it was ticked from. Never your own tick.
 */
export function toOk(board: WeekBoard, userId: string): BoardItem[] {
  const seen = new Set<string>();
  return board.items
    .filter((i) => i.awaitsOk && (i.coveredBy ?? i.crew?.tickedBy ?? i.userId) !== userId)
    .filter((i) => {
      const job = jobKey(i);
      if (seen.has(job)) return false;
      seen.add(job);
      return true;
    })
    .sort((a, b) => (a.doneAt?.getTime() ?? 0) - (b.doneAt?.getTime() ?? 0));
}

/**
 * Disputes waiting for the viewer's vote: anyone's tick but their own, and
 * not a housemate's cover of the viewer's John (dispute.ts votersOn). A
 * job's one check is listed once, on the place it was raised on.
 */
function toVote(board: WeekBoard, userId: string): BoardItem[] {
  return board.items.filter((i) => {
    const d = i.dispute;
    if (!d || d.myVote !== null) return false;
    const checked = board.items.find((x) => x.id === d.assignmentId) ?? i;
    return checked === i && (i.coveredBy ?? i.userId) !== userId && !(i.coveredBy && i.userId === userId);
  });
}

/**
 * Housemates' Johns the viewer could cover now (outcome.ts canCover), most
 * overdue first: what Today's "Needs covering" lists. A Together John is
 * covered whole, once, and never by someone with a place in it (they tick
 * it with the roll call).
 */
export function toCover(board: WeekBoard, userId: string, now: Date, graceHours: number): BoardItem[] {
  const seen = new Set<string>();
  return board.items
    .filter((i) => canCover({ ...i, excused: i.status === "excused" }, userId, now, graceHours))
    .filter((i) => !(i.together ?? []).includes(userId))
    .filter((i) => {
      const job = jobKey(i);
      if (seen.has(job)) return false;
      seen.add(job);
      return true;
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** A month's assignment as read, with its week's end (for when an open John turns missed). */
export type MonthRow = Pick<
  Row<"assignments">,
  "user_id" | "points" | "outcome" | "done_at" | "due_at" | "excused" | "covered_by"
> & {
  weeks: { ends_at: string } | null;
  /** On a flag, when it was raised, when the read has it. */
  flagged_at?: string | null;
  /** When it turns missed, when the read has it. */
  closes_at?: string | null;
  /** For a John done together or with help (crew.ts), when the read has them. */
  id?: string;
  job_id?: string | null;
  absent_at?: string | null;
  crew?: CrewRow[] | null;
};

/** The month's Table: every John due this month, each at its live status. */
export function monthStandings(
  rows: readonly MonthRow[],
  memberIds: readonly string[],
  disputeHours: number,
  now: Date,
): TableRow[] {
  const crews = crewByJob(rows.flatMap((a) => (a.id ? [{ ...a, id: a.id }] : [])));
  const places = rows.map((a, i) => {
    const id = a.id ?? `row:${i}`;
    const absentAt = a.absent_at ? new Date(a.absent_at) : null;
    return {
      id,
      jobId: a.job_id ?? null,
      userId: a.user_id,
      points: a.points,
      coveredBy: a.covered_by,
      absentAt,
      crew: crews.get(jobKey({ id, jobId: a.job_id })) ?? null,
      status: liveStatus(
        {
          dueAt: new Date(a.due_at),
          doneAt: a.done_at ? new Date(a.done_at) : null,
          excused: a.excused,
          disputeOpen: false,
          // A John with no week (never, in practice) counts as ending when it's due.
          weekEndsAt: new Date(a.weeks?.ends_at ?? a.due_at),
          flaggedAt: a.flagged_at ? new Date(a.flagged_at) : null,
          closesAt: a.closes_at ? new Date(a.closes_at) : null,
          outcome: a.outcome as Outcome | null,
          coveredBy: a.covered_by,
          absentAt,
        },
        now,
        disputeHours,
      ),
    };
  });
  const { rows: table, jobs } = tableInputs(places);
  return standings(table, memberIds, jobs);
}
