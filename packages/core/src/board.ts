import { crewByJob, jobKey, tableInputs, type Crew, type CrewRow } from "./crew";
import type { Database, Json } from "./db-types";
import type { DealWhy } from "./deal";
import type { Category, Currency, HouseRules, IsoDow, JohnWhen, Outcome } from "./domain";
import { canCover, closesAt, liveStatus, standsAt, type LiveStatus } from "./outcome";
import { standings, type TableRow } from "./points";
import { timesAYear } from "./repeat";

/** Weeks in an average year, for turning how often a John comes round into a week's worth. */
const WEEKS_A_YEAR = 365.25 / 7;

// The week as both apps show it, built from the rows they each read through
// RLS (the web on the server, the native app on the phone), so the two can't
// disagree about what a John's status is.

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/** One John on the house's list, as House shows and edits it (the shape of a JohnDraft). */
export interface JohnDef {
  id: string;
  name: string;
  category: Category;
  points: number;
  /** Every N weeks, for a John that repeats in weeks (repeat.ts). */
  everyWeeks: number;
  /** Every N months (12 a year), or null for a John that repeats in weeks. */
  everyMonths: number | null;
  /** Which of its due day in the month (1 to 4, or 5 the last), for a John that repeats in months. */
  weekOfMonth: number | null;
  /** A month it lands in (repeat.ts monthIndex); null on a weekly John, or a monthly one not saved yet. */
  anchorMonth: number | null;
  /** The week a weekly John counts from; absent on one not saved yet. */
  anchorWeek?: number;
  dueDow: IsoDow;
  /** "21:00": the database's time, to the minute. */
  dueTime: string;
  needsPhoto: boolean;
  /** The group that shares it; null means the whole house. */
  groupId: string | null;
  /** On a set day (`day`), or on call: whenever someone flags it (`johns.kind`). */
  when: JohnWhen;
  /** On call: how long whoever is on call has to do it once it's flagged, in hours. */
  respondHours: number;
  /** On call: about how many times a week it needs doing, which is what the deal weighs it as. */
  perWeek: number;
  /** Done by: how many do it together (1 to 6), or 0 for everyone home (crew.ts). Its points are per person. */
  crew: number;
  /** Keeps its day: always dealt, on its own day, whatever the budget (steady.ts). Never on call. */
  keepDay: boolean;
}

/** Where a new John starts in the editor: a weekly kitchen John, due Sunday night, for the whole house. */
export const NEW_JOHN: Omit<JohnDef, "id"> = {
  name: "",
  category: "kitchen",
  points: 2,
  everyWeeks: 1,
  everyMonths: null,
  weekOfMonth: null,
  anchorMonth: null,
  dueDow: 7,
  dueTime: "21:00",
  needsPhoto: false,
  groupId: null,
  when: "day",
  respondHours: 12,
  perWeek: 2,
  crew: 1,
  keepDay: false,
};

/** A John on the list, from its row (a read without the on-call or monthly columns gets a weekly John due on a day). */
export function johnDef(
  row: Pick<Row<"johns">, "id" | "name" | "category" | "points" | "every_weeks" | "due_dow" | "due_time" | "needs_photo" | "group_id"> &
    Partial<
      Pick<Row<"johns">, "kind" | "respond_hours" | "per_week" | "every_months" | "week_of_month" | "anchor_month" | "anchor_week" | "crew" | "keep_day">
    >,
): JohnDef {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Category,
    points: row.points,
    everyWeeks: row.every_weeks,
    everyMonths: row.every_months ?? null,
    weekOfMonth: row.week_of_month ?? null,
    anchorMonth: row.anchor_month ?? null,
    ...(row.anchor_week !== undefined ? { anchorWeek: row.anchor_week } : {}),
    dueDow: row.due_dow as IsoDow,
    dueTime: row.due_time.slice(0, 5),
    needsPhoto: row.needs_photo,
    groupId: row.group_id,
    when: row.kind === "on_call" ? "on_call" : "day",
    respondHours: row.respond_hours ?? NEW_JOHN.respondHours,
    perWeek: row.per_week ?? NEW_JOHN.perWeek,
    crew: row.kind === "on_call" ? 1 : (row.crew ?? 1),
    keepDay: row.kind !== "on_call" && (row.keep_day ?? false),
  };
}

/** A group of housemates, as House shows and edits it. */
export interface GroupDef {
  id: string;
  name: string;
  memberIds: string[];
}

/** A group from its row, with who is in it. */
export function groupDef(row: Pick<Row<"groups">, "id" | "name"> & { group_members: { user_id: string }[] | null }): GroupDef {
  return { id: row.id, name: row.name, memberIds: (row.group_members ?? []).map((m) => m.user_id) };
}

/**
 * How much effort the list asks of the house in an average week: a
 * fortnightly John counts half, a quarterly one a thirteenth, an on-call one
 * as often as it needs doing, and one done together once per person (for
 * everyone home, `people`: the house).
 */
export function weeklyEffort(
  johns: readonly (Pick<JohnDef, "points" | "everyWeeks"> & Partial<Pick<JohnDef, "when" | "perWeek" | "everyMonths" | "crew">>)[],
  people = 1,
): number {
  return johns.reduce((sum, j) => {
    const each =
      j.when === "on_call"
        ? j.points * (j.perWeek ?? 1)
        : j.everyMonths
          ? (j.points * timesAYear({ everyWeeks: j.everyWeeks, everyMonths: j.everyMonths })) / WEEKS_A_YEAR
          : j.points / j.everyWeeks;
    const crew = j.when === "on_call" ? 1 : (j.crew ?? 1);
    return sum + each * (crew === 0 ? Math.max(1, people) : crew);
  }, 0);
}

/** The house's rules, from its row. */
export function rulesOf(
  house: Pick<
    Row<"houses">,
    | "timezone"
    | "currency"
    | "week_starts"
    | "stake_minor"
    | "late_forfeit_minor"
    | "missed_forfeit_minor"
    | "dispute_hours"
    | "cover_grace_hours"
    | "late_hours"
    | "deal_mode"
    | "deal_budget"
  >,
): HouseRules {
  return {
    timezone: house.timezone,
    currency: house.currency as Currency,
    weekStarts: house.week_starts as IsoDow,
    stakeMinor: house.stake_minor,
    lateForfeitMinor: house.late_forfeit_minor,
    missedForfeitMinor: house.missed_forfeit_minor,
    disputeHours: house.dispute_hours,
    coverGraceHours: house.cover_grace_hours,
    lateHours: house.late_hours,
    dealMode: house.deal_mode === "classic" ? "classic" : "smart",
    dealBudget: house.deal_budget,
  };
}

export type WeekRow = Pick<Row<"weeks">, "id" | "starts_on" | "starts_at" | "ends_at">;

export type AssignmentRow = Pick<
  Row<"assignments">,
  | "id"
  | "user_id"
  | "name"
  | "category"
  | "points"
  | "needs_photo"
  | "due_at"
  | "due_moved_from"
  | "group_name"
  | "done_at"
  | "photo_path"
  | "outcome"
  | "excused"
  | "covered_by"
> & {
  /** The John on the list it was dealt from: null once that John is deleted, absent when not read. */
  john_id?: string | null;
  /** That John as the list has it now (`johns(every_weeks, every_months)`), when the read embeds it. */
  johns?: { every_weeks: number; every_months?: number | null } | null;
  /** The week it was dealt or flagged in, when read: a flag can outlast its week. */
  week_id?: string;
  /** On a flag: when it was raised, and by whom (null: opened again after a miss). */
  flagged_at?: string | null;
  flagged_by?: string | null;
  /** On a John due on a day: when it turns missed (null on one dealt before the late window), when read. */
  closes_at?: string | null;
  /** Why the deal gave it to whom it did (deal.ts DealWhy), when read; null on a flag or one dealt before the deal kept it. */
  dealt?: Json | null;
  /** On a Together John's place: the job its places share (crew.ts), when read. */
  job_id?: string | null;
  /** When a roll call left its holder off, when read. */
  absent_at?: string | null;
  /** Who did it, on the place a roll call was ticked from (`crew(user_id, helper, points)`), when read. */
  crew?: CrewRow[] | null;
  /** When its holder planned to do it (Plan it), when read. */
  planned_at?: string | null;
  /** In a family: a kid's tick waiting for a parent's OK, when read. */
  awaits_ok?: boolean;
};

/** An open dispute, with its votes: `disputes` and `dispute_votes` as read. */
export interface DisputeRow {
  id: string;
  assignment_id: string;
  raised_by: string | null;
  reason: string;
  closes_at: string;
  dispute_votes: { user_id: string; uphold: boolean }[] | null;
}

export interface DisputeView {
  id: string;
  assignmentId: string;
  raisedBy: string | null;
  reason: string;
  closesAt: Date;
  uphold: number;
  reject: number;
  /** How the viewer voted, or null if they haven't. */
  myVote: boolean | null;
}

export interface BoardItem {
  id: string;
  /** The John on the list it was dealt from; null once that John is deleted, or when the read didn't say. */
  johnId: string | null;
  /** How often that John comes round, from the list; null when the read didn't embed it or the John is gone. */
  everyWeeks: number | null;
  /** Every N months instead, when it repeats in months; null or absent otherwise, or when the read didn't say. */
  everyMonths?: number | null;
  userId: string;
  name: string;
  category: string;
  points: number;
  needsPhoto: boolean;
  dueAt: Date;
  /** Set when time away pulled the due date forward: when it was due before. */
  movedFrom: Date | null;
  /** The group it belongs to, as dealt; null for everyone's. */
  groupName: string | null;
  doneAt: Date | null;
  photoPath: string | null;
  /** The housemate who covered it, when it was done by someone other than `userId`. */
  coveredBy: string | null;
  outcome: Outcome | null;
  status: LiveStatus;
  /** When a tick in the dispute window stands, if nothing changes; null while it waits for a parent's OK. */
  standsAt: Date | null;
  /** In a family: a kid's tick waiting for a parent's OK (no closing time). */
  awaitsOk?: boolean;
  dispute: DisputeView | null;
  /** On a flag (an on-call John someone said needs doing): when, and who said so. */
  flaggedAt: Date | null;
  flaggedBy: string | null;
  /** When it turns missed if nobody does it (outcome.ts closesAt). */
  closesAt: Date;
  /** A John from last week that is still open (a flag, or one due late on its last day): it stays its holder's, and isn't on this week's Table. */
  carried: boolean;
  /** Why the deal gave it to whom it did; null on a flag, or a John dealt before the deal kept it. */
  dealt: DealWhy | null;
  /** On a Together John: the job its places share (crew.ts); null on a John done by one. */
  jobId?: string | null;
  /** Everyone with a place in its job on the board, its holder among them, in the board's order; null on a John done by one. */
  together?: string[] | null;
  /** When the roll call left its holder off: a miss once that stands. */
  absentAt?: Date | null;
  /** Who did it, once a roll call ticked it: on every place it settled. */
  crew?: Crew | null;
  /** When its holder planned to do it (Plan it): they're reminded then. */
  plannedAt?: Date | null;
}

export interface WeekBoard {
  week: { id: string; startsOn: string; startsAt: Date; endsAt: Date } | null;
  items: BoardItem[];
  table: TableRow[];
  /** Nothing has ever been dealt in this house. */
  notStarted: boolean;
}

/**
 * This week's board: every John with its live status and any open dispute
 * on it, and the week's table. `week` is null when this week hasn't been
 * dealt; `everDealt` says whether any week ever has.
 */
export function buildWeekBoard(input: {
  week: WeekRow | null;
  assignments: readonly AssignmentRow[];
  disputes: readonly DisputeRow[];
  memberIds: readonly string[];
  /** Whose votes count as "mine". */
  userId: string;
  everDealt: boolean;
  disputeHours: number;
  now: Date;
}): WeekBoard {
  const { week, now, disputeHours, memberIds } = input;
  if (!week) return { week: null, items: [], table: standings([], memberIds), notStarted: !input.everDealt };

  // A job has one check, raised on one of its places: every place shows it.
  const jobOf = new Map(input.assignments.map((a) => [a.id, jobKey({ id: a.id, jobId: a.job_id })]));
  const disputeBy = new Map<string, DisputeView>();
  for (const d of input.disputes) {
    const votes = d.dispute_votes ?? [];
    disputeBy.set(jobOf.get(d.assignment_id) ?? d.assignment_id, {
      id: d.id,
      assignmentId: d.assignment_id,
      raisedBy: d.raised_by,
      reason: d.reason,
      closesAt: new Date(d.closes_at),
      uphold: votes.filter((v) => v.uphold).length,
      reject: votes.filter((v) => !v.uphold).length,
      myVote: votes.find((v) => v.user_id === input.userId)?.uphold ?? null,
    });
  }

  const endsAt = new Date(week.ends_at);
  const crews = crewByJob(input.assignments);
  const sorted = [...input.assignments].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const items: BoardItem[] = sorted
    .map((a) => {
      const job = jobKey({ id: a.id, jobId: a.job_id });
      const dispute = disputeBy.get(job) ?? null;
      const doneAt = a.done_at ? new Date(a.done_at) : null;
      const absentAt = a.absent_at ? new Date(a.absent_at) : null;
      const outcome = a.outcome as Outcome | null;
      const dueAt = new Date(a.due_at);
      const flaggedAt = a.flagged_at ? new Date(a.flagged_at) : null;
      // Weeks follow on from each other, so last week ended when this one started.
      const carried = a.week_id !== undefined && a.week_id !== week.id;
      const facts = {
        dueAt,
        doneAt,
        excused: a.excused,
        disputeOpen: dispute !== null,
        awaitsOk: a.awaits_ok ?? false,
        weekEndsAt: carried ? new Date(week.starts_at) : endsAt,
        flaggedAt,
        closesAt: a.closes_at ? new Date(a.closes_at) : null,
        absentAt,
      };
      const status = liveStatus({ ...facts, outcome, coveredBy: a.covered_by }, now, disputeHours);
      const checkedFrom = doneAt ?? absentAt;
      return {
        id: a.id,
        johnId: a.john_id ?? null,
        everyWeeks: a.johns?.every_weeks ?? null,
        everyMonths: a.johns?.every_months ?? null,
        userId: a.user_id,
        name: a.name,
        category: a.category,
        points: a.points,
        needsPhoto: a.needs_photo,
        dueAt,
        movedFrom: a.due_moved_from ? new Date(a.due_moved_from) : null,
        groupName: a.group_name,
        doneAt,
        photoPath: a.photo_path,
        coveredBy: a.covered_by,
        outcome,
        status,
        standsAt: checkedFrom && !outcome && !facts.awaitsOk ? standsAt(checkedFrom, disputeHours) : null,
        awaitsOk: facts.awaitsOk && !outcome,
        dispute,
        flaggedAt,
        flaggedBy: a.flagged_by ?? null,
        closesAt: closesAt(facts),
        carried,
        dealt: readDealt(a.dealt),
        jobId: a.job_id ?? null,
        together: a.job_id ? sorted.filter((x) => x.job_id === a.job_id).map((x) => x.user_id) : null,
        absentAt,
        crew: crews.get(job) ?? null,
        plannedAt: a.planned_at ? new Date(a.planned_at) : null,
      };
    });

  const { rows, jobs } = tableInputs(items.filter((i) => !i.carried));
  return {
    week: { id: week.id, startsOn: week.starts_on, startsAt: new Date(week.starts_at), endsAt },
    items,
    table: standings(rows, memberIds, jobs),
    notStarted: false,
  };
}

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
        needsPhoto: r.johns!.needs_photo ?? false,
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
 * Disputes waiting for the viewer's vote: anyone's tick but their own (a
 * cover of their John included). A job's one check is listed once, on the
 * place it was raised on.
 */
function toVote(board: WeekBoard, userId: string): BoardItem[] {
  return board.items.filter((i) => {
    const d = i.dispute;
    if (!d || d.myVote !== null) return false;
    const checked = board.items.find((x) => x.id === d.assignmentId) ?? i;
    return checked === i && (i.coveredBy ?? i.userId) !== userId;
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

const DEALT_BY: ReadonlySet<string> = new Set(["only", "behind", "fewer", "draw", "back", "oneEach", "mostRoom", "turn", "nextInLine"]);
const MOVED: ReadonlySet<string> = new Set(["taken", "suits", "away", "gone"]);

/** A stored DealWhy, or null when there is none or it isn't one (a shape this build doesn't know). */
export function readDealt(json: Json | null | undefined): DealWhy | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const { to, by, weighed, away, mode, budget, waited, stretched, again, moved } = json;
  if (typeof to !== "string" || typeof by !== "string" || !DEALT_BY.has(by)) return null;
  if (!Array.isArray(weighed) || !Array.isArray(away)) return null;
  const people: DealWhy["weighed"] = [];
  for (const w of weighed) {
    if (!w || typeof w !== "object" || Array.isArray(w)) return null;
    if (typeof w.userId !== "string" || typeof w.standing !== "number") return null;
    people.push({
      userId: w.userId,
      standing: w.standing,
      ...(w.last === true ? { last: true as const } : {}),
      ...(w.full === true ? { full: true as const } : {}),
      ...(typeof w.room === "number" ? { room: w.room } : {}),
      ...(typeof w.place === "number" ? { place: w.place } : {}),
    });
  }
  return {
    to,
    by: by as DealWhy["by"],
    weighed: people,
    away: away.filter((id): id is string => typeof id === "string"),
    ...(mode === "smart" || mode === "classic" ? { mode } : {}),
    ...(typeof budget === "number" ? { budget } : {}),
    ...(typeof waited === "number" && waited > 0 ? { waited } : {}),
    ...(stretched === true ? { stretched: true as const } : {}),
    ...(again === true ? { again: true as const } : {}),
    ...(typeof moved === "string" && MOVED.has(moved) ? { moved: moved as DealWhy["moved"] } : {}),
  };
}
