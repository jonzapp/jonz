import { describe, expect, it } from "vitest";

import {
  byDoneLatest,
  groupDef,
  johnDef,
  NEW_JOHN,
  weeklyEffort,
  buildWeekBoard,
  isOpen,
  monthStandings,
  rulesOf,
  onCallItems,
  heldDoneIt,
  DONE_IT_HOLD_MS,
  TODAY_ORDER,
  todayView,
  toCover,
  type AssignmentRow,
  type DisputeRow,
  type MonthRow,
  type WeekRow,
} from "./board";
import { JohnDraft } from "./schemas";

const HOUR = 3_600_000;
// Wednesday 14 Oct 2026, noon in London (BST).
const now = new Date("2026-10-14T11:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();

const WEEK: WeekRow = {
  id: "w1",
  starts_on: "2026-10-12",
  starts_at: "2026-10-11T23:00:00Z",
  ends_at: "2026-10-18T23:00:00Z",
};
const ME = "me";
const YOU = "you";

function john(id: string, overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id,
    user_id: ME,
    name: id,
    category: "kitchen",
    points: 2,
    needs_photo: false,
    due_at: at(48),
    due_moved_from: null,
    group_name: null,
    done_at: null,
    photo_path: null,
    outcome: null,
    excused: false,
    covered_by: null,
    ...overrides,
  };
}

function board(assignments: AssignmentRow[], disputes: DisputeRow[] = [], week: WeekRow | null = WEEK, everDealt = true) {
  return buildWeekBoard({ week, assignments, disputes, memberIds: [ME, YOU], userId: ME, everDealt, disputeHours: 24, now });
}

describe("johnDef", () => {
  it("reads a John's row as House shows it, the time to the minute", () => {
    expect(
      johnDef({
        id: "j1",
        name: "Bins",
        category: "bins",
        points: 2,
        every_weeks: 2,
        due_dow: 7,
        due_time: "21:00:00",
        needs_photo: true,
        group_id: null,
      }),
    ).toEqual({
      id: "j1",
      name: "Bins",
      category: "bins",
      points: 2,
      everyWeeks: 2,
      everyMonths: null,
      weekOfMonth: null,
      anchorMonth: null,
      dueDow: 7,
      dueTime: "21:00",
      needsPhoto: true,
      groupId: null,
      when: "day",
      respondHours: 12,
      perWeek: 2,
      crew: 1,
      keepDay: false,
      payMinor: 0,
      minAge: null,
    });
  });

  it("reads a John that keeps its day, and never an on-call John", () => {
    const row = { id: "j", name: "Bins", category: "bins", points: 1, every_weeks: 1, due_dow: 4, due_time: "20:00", needs_photo: false, group_id: null };
    expect(johnDef({ ...row, keep_day: true }).keepDay).toBe(true);
    expect(johnDef({ ...row, keep_day: true, kind: "on_call" }).keepDay).toBe(false);
  });

  it("reads a John that repeats in months, with the month it counts from", () => {
    expect(
      johnDef({
        id: "j3",
        name: "Fridge deep clean",
        category: "kitchen",
        points: 8,
        every_weeks: 1,
        every_months: 3,
        week_of_month: 1,
        anchor_month: 24322,
        anchor_week: 2900,
        due_dow: 6,
        due_time: "21:00:00",
        needs_photo: false,
        group_id: null,
      }),
    ).toMatchObject({ everyMonths: 3, weekOfMonth: 1, anchorMonth: 24322, anchorWeek: 2900 });
  });

  it("reads an on-call John with its window and how often it needs doing", () => {
    const row = {
      id: "j2",
      name: "Bins",
      category: "bins",
      points: 1,
      every_weeks: 1,
      due_dow: 7,
      due_time: "21:00:00",
      needs_photo: false,
      group_id: null,
    };
    expect(johnDef({ ...row, kind: "on_call", respond_hours: 8, per_week: 4 })).toMatchObject({
      when: "on_call",
      respondHours: 8,
      perWeek: 4,
    });
    expect(johnDef({ ...row, kind: "something new" }).when).toBe("day");
  });
});

describe("groupDef", () => {
  it("reads a group with who is in it, and an emptied one as nobody", () => {
    expect(groupDef({ id: "g1", name: "Upstairs", group_members: [{ user_id: "ava" }, { user_id: "ben" }] })).toEqual({
      id: "g1",
      name: "Upstairs",
      memberIds: ["ava", "ben"],
    });
    expect(groupDef({ id: "g2", name: "Attic", group_members: null }).memberIds).toEqual([]);
  });
});

describe("NEW_JOHN", () => {
  it("is a John the editor can save once it has a name", () => {
    expect(JohnDraft.safeParse(NEW_JOHN).success).toBe(false);
    expect(JohnDraft.parse({ ...NEW_JOHN, name: "Hob" })).toEqual({ ...NEW_JOHN, name: "Hob" });
  });
});

describe("weeklyEffort", () => {
  it("counts a John every N weeks as 1/N of its points", () => {
    expect(weeklyEffort([])).toBe(0);
    expect(weeklyEffort([{ points: 4, everyWeeks: 1 }])).toBe(4);
    expect(weeklyEffort([{ points: 4, everyWeeks: 2 }, { points: 3, everyWeeks: 3 }])).toBe(3);
  });

  it("counts a monthly John by how many times a year it comes round", () => {
    // Every 3 months is 4 times a year: 13 points a time is a point a week.
    expect(weeklyEffort([{ points: 13, everyWeeks: 1, everyMonths: 3 }])).toBeCloseTo(0.997, 3);
  });

  it("counts an on-call John as often as it needs doing", () => {
    expect(weeklyEffort([{ points: 1, everyWeeks: 1, when: "on_call", perWeek: 3 }])).toBe(3);
    expect(weeklyEffort([{ points: 2, everyWeeks: 1, when: "day", perWeek: 3 }])).toBe(2);
  });
});

describe("flags on the board", () => {
  const flag = (id: string, overrides: Partial<AssignmentRow> = {}) =>
    john(id, { john_id: "bins", week_id: "w1", flagged_at: at(-2), flagged_by: YOU, due_at: at(10), ...overrides });

  it("carries who flagged it and when", () => {
    const [item] = board([flag("f1")]).items;
    expect(item).toMatchObject({ flaggedBy: YOU, carried: false, status: "due-soon" });
    expect(item.flaggedAt).toEqual(new Date(at(-2)));
    const [plain] = board([john("a1")]).items;
    expect(plain).toMatchObject({ flaggedAt: null, flaggedBy: null, carried: false });
  });

  it("keeps last week's open flag with its holder, off this week's Table", () => {
    // Raised Sunday 8pm, due Monday 8am: still open on Wednesday is long past twice its window.
    const lastWeek = flag("f0", { week_id: "w0", flagged_at: "2026-10-11T19:00:00Z", due_at: "2026-10-12T07:00:00Z" });
    const b = board([lastWeek, john("a1", { user_id: YOU })]);
    const carried = b.items.find((i) => i.id === "f0")!;
    expect(carried.carried).toBe(true);
    expect(carried.status).toBe("missed");
    expect(b.table.find((r) => r.userId === ME)).toMatchObject({ missed: 0, points: 0 });
  });

  it("shows a carried flag still in its window as open", () => {
    const sunday = flag("f0", { week_id: "w0", flagged_at: "2026-10-11T22:00:00Z", due_at: "2026-10-14T22:00:00Z" });
    expect(board([sunday]).items[0].status).toBe("due-soon");
  });
});

describe("onCallItems", () => {
  const rows = [
    { john_id: "bins", user_id: ME, johns: { name: "Bins", category: "bins" } },
    { john_id: "recycling", user_id: YOU, johns: { name: "Recycling", category: "bins" } },
    { john_id: "gone", user_id: YOU, johns: { name: "Gone", category: "other", archived_at: at(-1) } },
  ];
  const flag = (id: string, overrides: Partial<AssignmentRow> = {}) =>
    john(id, { john_id: "bins", week_id: "w1", flagged_at: at(-5), flagged_by: YOU, due_at: at(7), ...overrides });

  it("lists each on-call John with who has it, leaving out deleted ones", () => {
    const items = onCallItems(rows, board([]));
    expect(items.map((i) => [i.name, i.holderId, i.openFlag, i.times])).toEqual([
      ["Bins", ME, null, 0],
      ["Recycling", YOU, null, 0],
    ]);
  });

  it("finds the open flag, the latest one first, and counts this week's", () => {
    const b = board([
      flag("done", { flagged_at: at(-30), done_at: at(-28) }),
      flag("older", { flagged_at: at(-6) }),
      flag("newest", { flagged_at: at(-1) }),
      flag("lastweek", { week_id: "w0", flagged_at: at(-60), outcome: "missed" }),
    ]);
    const [bins] = onCallItems(rows, b);
    expect(bins.openFlag?.id).toBe("newest");
    expect(bins.times).toBe(3);
  });

  it("finds the latest Done it, and holds it for ten minutes", () => {
    const b = board([
      flag("asked", { done_at: at(-1) }),
      flag("mine-old", { flagged_by: ME, flagged_at: at(-20), done_at: at(-20) }),
      flag("mine", { flagged_by: ME, flagged_at: at(-3), done_at: at(-3) }),
    ]);
    const [bins] = onCallItems(rows, b);
    expect(bins.lastDoneIt?.id).toBe("mine");
    const doneAt = bins.lastDoneIt!.doneAt!.getTime();
    expect(heldDoneIt(bins, new Date(doneAt + DONE_IT_HOLD_MS - 1))?.id).toBe("mine");
    expect(heldDoneIt(bins, new Date(doneAt + DONE_IT_HOLD_MS))).toBeNull();
  });

  it("has no open flag once it's ticked", () => {
    const [bins] = onCallItems(rows, board([flag("f1", { done_at: at(-1) })]));
    expect(bins.openFlag).toBeNull();
    expect(bins.times).toBe(1);
  });
});

describe("rulesOf", () => {
  it("reads a house's rules from its row", () => {
    expect(
      rulesOf({
        timezone: "Europe/London",
        currency: "GBP",
        week_starts: 1,
        stake_minor: 2000,
        late_forfeit_minor: 200,
        missed_forfeit_minor: 500,
        dispute_hours: 24,
        cover_grace_hours: 3,
        late_hours: 48,
        deal_mode: "classic",
        deal_budget: 2,
      }),
    ).toEqual({
      timezone: "Europe/London",
      currency: "GBP",
      weekStarts: 1,
      stakeMinor: 2000,
      lateForfeitMinor: 200,
      missedForfeitMinor: 500,
      disputeHours: 24,
      coverGraceHours: 3,
      lateHours: 48,
      dealMode: "classic",
      dealBudget: 2,
    });
  });
});

describe("buildWeekBoard", () => {
  it("is empty, and says whether anything was ever dealt, when this week wasn't", () => {
    expect(board([], [], null, false)).toMatchObject({ week: null, items: [], notStarted: true });
    expect(board([], [], null, true)).toMatchObject({ week: null, notStarted: false });
    expect(board([], [], null).table.map((r) => r.userId).sort()).toEqual([ME, YOU]);
  });

  it("gives every John its live status, in due order", () => {
    const items = board([
      john("later", { due_at: at(48) }),
      john("soon", { due_at: at(6) }),
      john("late", { due_at: at(-6) }),
      john("ticked", { due_at: at(-2), done_at: at(-3) }),
      john("settled", { outcome: "done", done_at: at(-40), due_at: at(-30) }),
      john("excused", { excused: true, due_at: at(5) }),
    ]).items;
    expect(items.map((i) => i.name)).toEqual(["settled", "late", "ticked", "excused", "soon", "later"]);
    expect(Object.fromEntries(items.map((i) => [i.name, i.status]))).toEqual({
      later: "upcoming",
      soon: "due-soon",
      late: "overdue",
      ticked: "checking",
      settled: "done",
      excused: "excused",
    });
  });

  it("says which John on the list each was dealt from, and how often that comes round, when the read has them", () => {
    const [embedded, deleted, bare] = board([
      john("embedded", { john_id: "j1", johns: { every_weeks: 2 }, due_at: at(1) }),
      john("deleted", { john_id: null, johns: null, due_at: at(2) }),
      // The web's read takes the John's id but not the list's row.
      john("bare", { john_id: "j3", due_at: at(3) }),
    ]).items;
    expect(embedded).toMatchObject({ johnId: "j1", everyWeeks: 2 });
    expect(deleted).toMatchObject({ johnId: null, everyWeeks: null });
    expect(bare).toMatchObject({ johnId: "j3", everyWeeks: null });
  });

  it("says when a tick stands, only while it can still be disputed", () => {
    const [ticked, settled] = board([
      john("ticked", { done_at: at(-3) }),
      john("settled", { done_at: at(-40), outcome: "done", due_at: at(60) }),
    ]).items;
    expect(ticked.standsAt).toEqual(new Date(now.getTime() + 21 * HOUR));
    expect(settled.standsAt).toBeNull();
  });

  it("counts a dispute's votes and finds mine", () => {
    const disputes: DisputeRow[] = [
      {
        id: "d1",
        assignment_id: "theirs",
        raised_by: ME,
        reason: "Still filthy",
        closes_at: at(20),
        dispute_votes: [
          { user_id: ME, uphold: true },
          { user_id: "third", uphold: false },
        ],
      },
    ];
    const [item] = board([john("theirs", { user_id: YOU, done_at: at(-1) })], disputes).items;
    expect(item.status).toBe("disputed");
    expect(item.dispute).toEqual({
      id: "d1",
      assignmentId: "theirs",
      raisedBy: ME,
      reason: "Still filthy",
      closesAt: new Date(at(20)),
      uphold: 1,
      reject: 1,
      myVote: true,
      answered: false,
    });
  });

  it("keeps the dates as dates, and the move made for time away", () => {
    const [item] = board([john("moved", { due_moved_from: at(72), due_at: at(10) })]).items;
    expect(item.dueAt).toEqual(new Date(at(10)));
    expect(item.movedFrom).toEqual(new Date(at(72)));
  });

  it("scores the week for the table", () => {
    const { table } = board([
      john("a", { outcome: "done", done_at: at(-30), due_at: at(-20), points: 3 }),
      john("b", { user_id: YOU, outcome: "missed", due_at: at(-20), points: 5 }),
    ]);
    expect(table.find((r) => r.userId === ME)).toMatchObject({ points: 3, done: 1, rank: 1 });
    expect(table.find((r) => r.userId === YOU)).toMatchObject({ points: 0, missed: 1, rank: 2 });
  });
});

describe("todayView", () => {
  it("puts what needs doing first, and counts what's left", () => {
    const view = todayView(
      board([
        john("done", { outcome: "done", done_at: at(-30), due_at: at(-20) }),
        john("later", { due_at: at(50) }),
        john("overdue", { due_at: at(-2) }),
        john("ticked", { done_at: at(-1) }),
        john("soon", { due_at: at(3) }),
        john("someone else's", { user_id: YOU }),
      ]),
      ME,
    );
    expect(view.mine.map((i) => i.name)).toEqual(["overdue", "soon", "later", "ticked", "done"]);
    expect(view.left).toBe(3);
  });

  it("asks for my vote only on a housemate's disputed John I haven't voted on", () => {
    const dispute = (id: string, assignment: string, votes: DisputeRow["dispute_votes"]): DisputeRow => ({
      id,
      assignment_id: assignment,
      raised_by: "third",
      reason: "No",
      closes_at: at(10),
      dispute_votes: votes,
    });
    const view = todayView(
      board(
        [
          john("theirs", { user_id: YOU, done_at: at(-1) }),
          john("voted", { user_id: YOU, done_at: at(-1) }),
          john("mine", { done_at: at(-1) }),
        ],
        [dispute("d1", "theirs", null), dispute("d2", "voted", [{ user_id: ME, uphold: false }]), dispute("d3", "mine", [])],
      ),
      ME,
    );
    expect(view.toVote.map((i) => i.name)).toEqual(["theirs"]);
  });

  it("is empty for someone with nothing this week", () => {
    expect(todayView(board([]), ME)).toEqual({ mine: [], left: 0, toVote: [], toCover: [], toOk: [] });
  });
});

describe("isOpen and TODAY_ORDER", () => {
  it("counts only what's still to do as open", () => {
    const open = (Object.keys(TODAY_ORDER) as (keyof typeof TODAY_ORDER)[]).filter(isOpen);
    expect(open.sort()).toEqual(["due-soon", "overdue", "upcoming"]);
  });
});

describe("byDoneLatest", () => {
  it("lists the latest done first, a John skipped with immunity by when it was due", () => {
    const at = (iso: string) => new Date(iso);
    const early = { id: "early", doneAt: at("2026-10-20T09:00:00Z"), dueAt: at("2026-10-21T20:00:00Z") };
    const late = { id: "late", doneAt: at("2026-10-23T18:00:00Z"), dueAt: at("2026-10-22T20:00:00Z") };
    const skipped = { id: "skipped", doneAt: null, dueAt: at("2026-10-22T08:00:00Z") };
    expect([early, skipped, late].sort(byDoneLatest).map((i) => i.id)).toEqual(["late", "skipped", "early"]);
    expect([].sort(byDoneLatest)).toEqual([]);
  });
});

describe("monthStandings", () => {
  const NOW = new Date("2026-10-21T12:00:00Z");
  const WEEK_ENDS = "2026-10-25T23:00:00Z";
  const month = (overrides: Partial<MonthRow>): MonthRow => ({
    user_id: "ava",
    points: 4,
    outcome: null,
    done_at: null,
    due_at: "2026-10-10T19:00:00Z",
    excused: false,
    covered_by: null,
    weeks: { ends_at: "2026-10-11T23:00:00Z" },
    ...overrides,
  });

  it("scores every John due this month at where it has got to", () => {
    const table = monthStandings(
      [
        month({ outcome: "done", done_at: "2026-10-10T18:00:00Z" }),
        month({ outcome: "late", done_at: "2026-10-11T08:00:00Z" }),
        month({ user_id: "ben", outcome: "missed" }),
        // Ticked yesterday, still being checked: it counts, provisionally.
        month({ user_id: "ben", due_at: "2026-10-21T19:00:00Z", done_at: "2026-10-20T12:00:00Z", weeks: { ends_at: WEEK_ENDS } }),
        // Still open, and its week isn't over: nothing yet.
        month({ user_id: "ben", due_at: "2026-10-24T19:00:00Z", weeks: { ends_at: WEEK_ENDS } }),
      ],
      ["ava", "ben"],
      24,
      NOW,
    );
    expect(table).toEqual([
      { userId: "ava", points: 6, done: 1, late: 1, missed: 0, covered: 0, helped: 0, rank: 1 },
      { userId: "ben", points: 4, done: 1, late: 0, missed: 1, covered: 0, helped: 0, rank: 2 },
    ]);
  });

  it("counts an open John as missed once its week has ended", () => {
    const [ava] = monthStandings([month({})], ["ava"], 24, NOW);
    expect(ava).toMatchObject({ points: 0, missed: 1 });
  });

  it("lists everyone, even with nothing due this month", () => {
    expect(monthStandings([], ["ava", "ben"], 24, NOW).map((r) => [r.userId, r.points, r.rank])).toEqual([
      ["ava", 0, 1],
      ["ben", 0, 1],
    ]);
  });
});

describe("toCover", () => {
  it("lists housemates' Johns past due plus the grace, most overdue first, never your own", () => {
    const b = board([
      john("late-one", { user_id: YOU, due_at: at(-4) }),
      john("later-one", { user_id: YOU, due_at: at(-10) }),
      john("in-grace", { user_id: YOU, due_at: at(-1) }),
      john("mine", { due_at: at(-10) }),
      john("ticked", { user_id: YOU, due_at: at(-10), done_at: at(-2) }),
    ]);
    expect(toCover(b, ME, now, 3).map((i) => i.id)).toEqual(["later-one", "late-one"]);
    expect(toCover(b, ME, now, 0).map((i) => i.id)).toEqual(["later-one", "late-one", "in-grace"]);
    expect(todayView(b, ME, { now, graceHours: 3 }).toCover.map((i) => i.id)).toEqual(["later-one", "late-one"]);
  });
});
