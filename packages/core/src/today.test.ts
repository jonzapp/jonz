import { describe, expect, it } from "vitest";

import type { AwayPeriod } from "./away";
import { buildWeekBoard, type BoardItem, type DisputeView, type WeekBoard } from "./board";
import { DEFAULT_RULES, type HouseRules } from "./domain";
import type { TableRow } from "./points";
import { buildStake } from "./stake";
import { canSwap, cantOptions, coverOffer, coverTitle, johnSheetMode, settledLine, sheetKind, sheetWhen, swapChoice, swapMeta, tickedLine, undoWarning, voteCloses, voteMeta, voteTally, voteTitle } from "./john-sheet";
import { awayShare, awayLine, awayTodayUntil, clearUntil, forfeitRoom, nextUp, nextUpMeta, nextUpState, restOfWeek, setupChecklist, standingLine, standingPlace, todayPage, whoDeals } from "./today";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const HOUR = 3_600_000;
// Wednesday 14 Oct 2026, noon in London (BST, UTC+1).
const now = new Date("2026-10-14T11:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);

const RULES: HouseRules = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" };
const ME = "me";
const PEOPLE = [
  { userId: ME, name: "Sam Carter", role: "admin" },
  { userId: "priya", name: "Priya Shah", role: "member" },
  { userId: "megan", name: "Megan Doyle", role: "member" },
];

function item(id: string, overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id,
    flaggedAt: null,
    flaggedBy: null,
    carried: false,
    dealt: null,
    johnId: `j-${id}`,
    everyWeeks: 1,
    userId: ME,
    name: id,
    kindName: "Kitchen",
    points: 2,
    needsPhoto: false,
    // Today 21:00 in London.
    dueAt: at(9),
    movedFrom: null,
    groupName: null,
    doneAt: null,
    photoPath: null,
    coveredBy: null,
    outcome: null,
    status: "due-soon",
    standsAt: null,
    dispute: null,
    // A day to do it late, as the house's default late window.
    closesAt: new Date((overrides.dueAt ?? at(9)).getTime() + 86_400_000),
    ...overrides,
  };
}

function dispute(overrides: Partial<DisputeView> = {}): DisputeView {
  return {
    id: "d1",
    assignmentId: "a1",
    raisedBy: "megan",
    reason: "Still greasy",
    closesAt: at(17),
    uphold: 1,
    reject: 1,
    myVote: null,
    ...overrides,
  };
}

const WEEK = { id: "w1", startsOn: "2026-10-12", startsAt: new Date("2026-10-11T23:00:00Z"), endsAt: new Date("2026-10-18T23:00:00Z") };

function board(items: BoardItem[], overrides: Partial<WeekBoard> = {}): WeekBoard {
  return { week: WEEK, items, table: [], notStarted: false, ...overrides };
}

describe("nextUp", () => {
  it("is nothing when there's nothing to do", () => {
    expect(nextUp([])).toBeNull();
    expect(nextUp([item("a", { status: "checking" }), item("b", { status: "done" })])).toBeNull();
  });

  it("puts what's overdue first, then whatever is due soonest, whatever order it comes in", () => {
    const later = item("later", { status: "upcoming", dueAt: at(50) });
    const soon = item("soon", { status: "due-soon", dueAt: at(3) });
    const overdue = item("overdue", { status: "overdue", dueAt: at(-20) });
    expect(nextUp([later, soon, overdue])?.id).toBe("overdue");
    expect(nextUp([later, soon])?.id).toBe("soon");
    // Two due at the same moment: the first stays first.
    expect(nextUp([item("x", { dueAt: at(3) }), item("y", { dueAt: at(3) })])?.id).toBe("x");
  });
});

describe("restOfWeek", () => {
  const mine = [
    item("done", { status: "done", dueAt: at(-30), doneAt: at(-31) }),
    item("next", { status: "due-soon", dueAt: at(3) }),
    item("checking", { status: "checking" }),
    item("later", { status: "upcoming", dueAt: at(50) }),
    item("excused", { status: "excused", dueAt: at(-40) }),
    item("disputed", { status: "disputed" }),
    item("late", { status: "late", dueAt: at(-50), doneAt: at(-2) }),
    item("missed", { status: "missed" }),
  ];

  it("leaves out the John Next up shows, and folds what's finished, keeping a missed John in view", () => {
    const rest = restOfWeek(mine, "next");
    expect(rest.going.map((i) => i.id)).toEqual(["later", "disputed", "checking", "missed"]);
    // The latest done first, as Week folds them (an excused John by when it was due).
    expect(rest.finished.map((i) => i.id)).toEqual(["late", "done", "excused"]);
  });

  it("keeps every John when the card shows none (away, or all clear)", () => {
    expect(restOfWeek(mine, null).going.map((i) => i.id)).toEqual(["next", "later", "disputed", "checking", "missed"]);
  });

  it("is empty for an empty week", () => {
    expect(restOfWeek([], null)).toEqual({ going: [], finished: [] });
  });
});

describe("awayTodayUntil", () => {
  const trip = (id: string, startsOn: string, endsOn: string, userId = ME): AwayPeriod => ({ id, userId, startsOn, endsOn, note: null });

  it("is the last day of the trip you're on today, its first and last days included", () => {
    expect(awayTodayUntil([trip("p", "2026-10-12", "2026-10-16")], ME, "2026-10-14")).toBe("2026-10-16");
    expect(awayTodayUntil([trip("p", "2026-10-14", "2026-10-16")], ME, "2026-10-14")).toBe("2026-10-16");
    expect(awayTodayUntil([trip("p", "2026-10-10", "2026-10-14")], ME, "2026-10-14")).toBe("2026-10-14");
  });

  it("is nothing at home: no trips, one still to come, one over, or someone else's", () => {
    expect(awayTodayUntil([], ME, "2026-10-14")).toBeNull();
    expect(awayTodayUntil([trip("p", "2026-10-15", "2026-10-16")], ME, "2026-10-14")).toBeNull();
    expect(awayTodayUntil([trip("p", "2026-10-01", "2026-10-13")], ME, "2026-10-14")).toBeNull();
    expect(awayTodayUntil([trip("p", "2026-10-12", "2026-10-16", "priya")], ME, "2026-10-14")).toBeNull();
  });

  it("runs trips that follow on from each other together, but not across a day at home", () => {
    const back = [trip("b", "2026-10-17", "2026-10-20"), trip("a", "2026-10-12", "2026-10-16"), trip("c", "2026-10-21", "2026-10-22")];
    expect(awayTodayUntil(back, ME, "2026-10-14")).toBe("2026-10-22");
    const gap = [trip("a", "2026-10-12", "2026-10-16"), trip("b", "2026-10-18", "2026-10-20")];
    expect(awayTodayUntil(gap, ME, "2026-10-14")).toBe("2026-10-16");
  });
});

describe("awayLine", () => {
  const trip = (id: string, startsOn: string, endsOn: string, userId = ME): AwayPeriod => ({ id, userId, startsOn, endsOn, note: null });

  it("names a trip of yours that starts within a fortnight", () => {
    expect(awayLine([trip("p", "2026-10-16", "2026-10-19")], ME, "2026-10-14", words)).toBe("You’re away 16–19 Oct");
    expect(awayLine([trip("p", "2026-10-15", "2026-10-15")], ME, "2026-10-14", words)).toBe("You’re away Thu 15 Oct");
    expect(awayLine([trip("p", "2026-10-28", "2026-11-02")], ME, "2026-10-14", words)).toBe("You’re away 28 Oct–2 Nov");
  });

  it("says until when while you're away, back-to-back trips together", () => {
    expect(awayLine([trip("a", "2026-10-12", "2026-10-16"), trip("b", "2026-10-17", "2026-10-20")], ME, "2026-10-14", words)).toBe(
      "You’re away until Tue 20 Oct",
    );
  });

  it("is nothing for no trip, one over, one more than a fortnight off, or someone else's", () => {
    expect(awayLine([], ME, "2026-10-14", words)).toBeNull();
    expect(awayLine([trip("p", "2026-10-01", "2026-10-13")], ME, "2026-10-14", words)).toBeNull();
    expect(awayLine([trip("p", "2026-10-28", "2026-10-30")], ME, "2026-10-14", words)).toBe("You’re away 28–30 Oct");
    expect(awayLine([trip("p", "2026-10-29", "2026-10-30")], ME, "2026-10-14", words)).toBeNull();
    expect(awayLine([trip("p", "2026-10-16", "2026-10-19", "priya")], ME, "2026-10-14", words)).toBeNull();
  });

  it("names the soonest of several trips", () => {
    expect(awayLine([trip("b", "2026-10-24", "2026-10-25"), trip("a", "2026-10-18", "2026-10-19")], ME, "2026-10-14", words)).toBe(
      "You’re away 18–19 Oct",
    );
  });
});

describe("nextUpState", () => {
  const state = (b: WeekBoard, mine: BoardItem[], options: { userId?: string; awayUntil?: string | null; members?: typeof PEOPLE } = {}) =>
    nextUpState({ board: b, mine, userId: options.userId ?? ME, members: options.members ?? PEOPLE, awayUntil: options.awayUntil ?? null });
  const unstarted = board([], { week: null, notStarted: true });

  it("is the setup checklist for an admin before anything's dealt, and a wait for everyone else", () => {
    expect(state(unstarted, [])).toEqual({ kind: "setup" });
    expect(state(unstarted, [], { userId: "priya" })).toEqual({ kind: "waiting", admin: "Sam" });
    expect(state(unstarted, [], { userId: "priya", members: PEOPLE.slice(1) })).toEqual({
      kind: "waiting",
      admin: null,
    });
  });

  it("says when a started house's week isn't out yet", () => {
    expect(state(board([], { week: null }), [])).toEqual({ kind: "undealt" });
  });

  it("is time away, even over a John that's still to do", () => {
    expect(state(board([]), [item("a")], { awayUntil: "2026-10-16" })).toEqual({ kind: "away", until: "2026-10-16" });
  });

  it("is your next John", () => {
    const next = item("next", { status: "overdue", dueAt: at(-20) });
    expect(state(board([]), [item("later", { status: "upcoming" }), next])).toEqual({ kind: "john", item: next });
  });

  it("is all clear until the week turns over, saying when nothing was yours", () => {
    expect(state(board([]), [item("a", { status: "checking" })])).toEqual({ kind: "clear", until: WEEK.endsAt, nothingYours: false });
    expect(state(board([]), [])).toEqual({ kind: "clear", until: WEEK.endsAt, nothingYours: true });
  });

  it("isn't clear while the house votes on a tick of yours, which may come back", () => {
    const disputed = item("a", { status: "disputed", dispute: dispute() });
    expect(state(board([]), [item("b", { status: "done" }), disputed])).toEqual({ kind: "voting", item: disputed });
    // A John still to do comes first.
    const next = item("c");
    expect(state(board([]), [disputed, next])).toEqual({ kind: "john", item: next });
  });
});

describe("whoDeals", () => {
  it("is the first admin to have joined, by first name, or an admin when none can be named", () => {
    expect(whoDeals(PEOPLE)).toBe("Sam");
    expect(whoDeals([...PEOPLE.slice(1), { userId: "tom", name: "Tom Reilly", role: "admin" }, PEOPLE[0]])).toBe("Tom");
    expect(whoDeals(PEOPLE.slice(1))).toBeNull();
    expect(whoDeals([])).toBeNull();
  });
});

describe("clearUntil", () => {
  it("names the day the week turns over, in the house's zone", () => {
    // Midnight in London is still Sunday evening in New York.
    expect(clearUntil(WEEK.endsAt, "Europe/London", now, words)).toBe("You’re clear until Mon");
    expect(clearUntil(WEEK.endsAt, "America/New_York", now, words)).toBe("You’re clear until Sun");
  });

  it("follows the clocks going back", () => {
    // The week of the October change ends at midnight GMT, not BST.
    expect(clearUntil(new Date("2026-10-26T00:00:00Z"), "Europe/London", new Date("2026-10-22T12:00:00Z"), words)).toBe("You’re clear until Mon");
  });

  it("dates a day that could be read as today, or one six days out", () => {
    // On Monday 26 Oct, with the week turning over next Monday.
    const monday = new Date("2026-10-26T09:00:00Z");
    expect(clearUntil(new Date("2026-11-02T00:00:00Z"), "Europe/London", monday, words)).toBe("You’re clear until Mon 2 Nov");
    // On Tuesday, the Monday six days out.
    expect(clearUntil(new Date("2026-11-02T00:00:00Z"), "Europe/London", new Date("2026-10-27T09:00:00Z"), words)).toBe(
      "You’re clear until Mon 2 Nov",
    );
    // A near day is plain.
    expect(clearUntil(new Date("2026-11-02T00:00:00Z"), "Europe/London", new Date("2026-10-30T09:00:00Z"), words)).toBe("You’re clear until Mon");
  });
});

describe("nextUpMeta", () => {
  it("says the kind, when it's due and what being late costs", () => {
    expect(nextUpMeta(item("a", { kindName: "Bathroom" }), { rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      kind: "Bathroom",
      due: "due today 21:00, £1 if late",
      overdue: null,
    });
    expect(nextUpMeta(item("a", { dueAt: at(30), status: "upcoming" }), { rules: RULES, now, zone: RULES.timezone, words }).due).toBe("due tomorrow 18:00, £1 if late");
  });

  it("says what's at stake when being late is free but missing isn't, and nothing when both are", () => {
    expect(nextUpMeta(item("a"), { rules: { ...RULES, lateForfeitMinor: 0 }, now, zone: RULES.timezone, words }).due).toBe("due today 21:00, £3 if missed");
    expect(nextUpMeta(item("a"), { rules: { ...RULES, lateForfeitMinor: 0, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).due).toBe("due today 21:00");
  });

  it("prints pence and other currencies", () => {
    expect(nextUpMeta(item("a"), { rules: { ...RULES, lateForfeitMinor: 150 }, now, zone: RULES.timezone, words }).due).toBe("due today 21:00, £1.50 if late");
    expect(nextUpMeta(item("a"), { rules: { ...RULES, currency: "CAD" }, now, zone: RULES.timezone, words }).due).toBe("due today 21:00, $1 if late");
  });

  it("says when time away pulled it forward", () => {
    expect(nextUpMeta(item("a", { movedFrom: at(48) }), { rules: RULES, now, zone: RULES.timezone, words }).due).toBe("due today 21:00, before you go, £1 if late");
  });

  it("says the kind as every row does, and none for a John with no kind", () => {
    expect(nextUpMeta(item("a", { kindName: "Floors" }), { rules: RULES, now, zone: RULES.timezone, words }).kind).toBe("Floors");
    expect(nextUpMeta(item("a", { kindName: "" }), { rules: RULES, now, zone: RULES.timezone, words }).kind).toBe("");
  });

  it("keeps the kind on an overdue John, and says since when it's due and what it costs now and if it's missed", () => {
    // Due at 09:00 this morning, yesterday (Tuesday), and the week before.
    expect(nextUpMeta(item("a", { status: "overdue", dueAt: at(-3) }), { rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      kind: "Kitchen",
      due: null,
      overdue: { since: "Overdue since 09:00", cost: "£1 now, £3 if missed" },
    });
    expect(nextUpMeta(item("a", { status: "overdue", dueAt: at(-20) }), { rules: RULES, now, zone: RULES.timezone, words }).overdue?.since).toBe("Overdue since Tue");
    expect(nextUpMeta(item("a", { status: "overdue", dueAt: at(-8 * 24) }), { rules: RULES, now, zone: RULES.timezone, words }).overdue?.since).toBe(
      "Overdue since Tue 6 Oct",
    );
  });

  it("says only the costs that aren't free on an overdue John", () => {
    const overdue = item("a", { status: "overdue", dueAt: at(-20) });
    expect(nextUpMeta(overdue, { rules: { ...RULES, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).overdue?.cost).toBe("£1 now");
    expect(nextUpMeta(overdue, { rules: { ...RULES, lateForfeitMinor: 0 }, now, zone: RULES.timezone, words }).overdue?.cost).toBe("£3 if missed");
    expect(nextUpMeta(overdue, { rules: { ...RULES, lateForfeitMinor: 0, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).overdue?.cost).toBeNull();
  });

  it("caps each cost at what's left of your stake, and says none once nothing is", () => {
    const overdue = item("a", { status: "overdue", dueAt: at(-20) });
    expect(nextUpMeta(item("a"), { rules: RULES, now, zone: RULES.timezone, words }, 500).due).toBe("due today 21:00, £1 if late");
    expect(nextUpMeta(overdue, { rules: RULES, now, zone: RULES.timezone, words }, 250).overdue?.cost).toBe("£1 now, £2.50 if missed");
    expect(nextUpMeta(item("a"), { rules: RULES, now, zone: RULES.timezone, words }, 40).due).toBe("due today 21:00, £0.40 if late");
    expect(nextUpMeta(item("a"), { rules: RULES, now, zone: RULES.timezone, words }, 0).due).toBe("due today 21:00");
    expect(nextUpMeta(overdue, { rules: RULES, now, zone: RULES.timezone, words }, 0).overdue?.cost).toBeNull();
  });
});

describe("forfeitRoom", () => {
  const stake = (forfeits: [string, number][], memberIds = [ME, "priya", "megan"]) =>
    buildStake({
      ledger: forfeits.map(([userId, amount], i) => ({
        id: i,
        user_id: userId,
        kind: "forfeit",
        amount_minor: -amount,
        month: "2026-10",
        counterparty_user_id: null,
        created_at: "2026-10-10T12:00:00Z",
      })),
      closedMonths: [],
      memberIds,
      stakeMinor: 2000,
      month: "2026-10",
    });

  it("is the stake less what you've forfeited this month", () => {
    expect(forfeitRoom(stake([]), ME, "2026-10")).toBe(2000);
    expect(forfeitRoom(stake([[ME, 300], [ME, 100], ["priya", 1000]]), ME, "2026-10")).toBe(1600);
  });

  it("is nothing once you've reached the stake, or gone past it", () => {
    expect(forfeitRoom(stake([[ME, 2000]]), ME, "2026-10")).toBe(0);
    expect(forfeitRoom(stake([[ME, 2300]]), ME, "2026-10")).toBe(0);
  });

  it("is nothing in a house of one, where every forfeit comes back", () => {
    expect(forfeitRoom(stake([], [ME]), ME, "2026-10")).toBe(0);
  });

  it("isn't known before the Stake is read, or for a John in another month", () => {
    expect(forfeitRoom(null, ME, "2026-10")).toBeNull();
    expect(forfeitRoom(stake([]), ME, "2026-09")).toBeNull();
  });
});

describe("standingPlace", () => {
  it("writes places as ordinals, the teens included", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map((n) => standingPlace(n, false, words))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });

  it("says joint on a tie", () => {
    expect(standingPlace(2, true, words)).toBe("Joint 2nd");
  });
});

describe("standingLine", () => {
  const row = (userId: string, points: number, rank: number): TableRow => ({ userId, points, rank, done: 0, late: 0, missed: 0, covered: 0, helped: 0 });
  const table = [row("priya", 9, 1), row(ME, 6, 2), row("megan", 6, 2), row("tom", 1, 4)];
  const share = (userId: string, net: number) => ({ userId, forfeitedRaw: 0, forfeited: 0, received: 0, net });
  const stake = (net: number, month = "2026-10") => ({ month, projection: [share("priya", -net), share(ME, net)] });
  const line = (overrides: Partial<Parameters<typeof standingLine>[0]> = {}) =>
    standingLine({ table, userId: ME, stake: stake(401), currency: "GBP", ...overrides }, words);

  it("puts your place this week beside the month's money", () => {
    expect(line()).toBe("Joint 2nd this week, up £4.01 in October");
    expect(line({ table: [row(ME, 9, 1), row("priya", 6, 2)], stake: stake(-300) })).toBe("1st this week, down £3 in October");
    expect(line({ stake: stake(0) })).toBe("Joint 2nd this week, square in October");
    expect(line({ stake: stake(5, "2027-01"), currency: "CAD" })).toBe("Joint 2nd this week, up $0.05 in January");
  });

  it("leaves out the money until the Stake is read, or while you aren't in it", () => {
    expect(line({ stake: null })).toBe("Joint 2nd this week");
    expect(line({ stake: { month: "2026-10", projection: [] } })).toBe("Joint 2nd this week");
  });

  it("leaves out the place while nobody has scored, alone in the house, or off the table", () => {
    expect(line({ table: [row(ME, 0, 1), row("priya", 0, 1)] })).toBe("Up £4.01 in October");
    expect(line({ table: [row(ME, 4, 1)] })).toBe("Up £4.01 in October");
    expect(line({ table: [row("priya", 4, 1), row("megan", 2, 2)] })).toBe("Up £4.01 in October");
  });

  it("is nothing when neither is known", () => {
    expect(line({ table: [], stake: null })).toBeNull();
  });
});

describe("setupChecklist", () => {
  it("ticks off the John list and the housemates, and is ready once both have something", () => {
    expect(setupChecklist(null, 1)).toEqual({ johnCount: null, johns: false, housemates: false, ready: false });
    expect(setupChecklist([], 3)).toEqual({ johnCount: 0, johns: false, housemates: true, ready: false });
    expect(setupChecklist(["a", "b", "c"], 1)).toEqual({ johnCount: 3, johns: true, housemates: false, ready: false });
    expect(setupChecklist(["a"], 2)).toEqual({ johnCount: 1, johns: true, housemates: true, ready: true });
  });
});

describe("the vote's words", () => {
  it("says when it closes, and that it's closing once that time has passed", () => {
    expect(voteCloses(at(17), now, words)).toBe("closes in 17h");
    expect(voteCloses(at(0.5), now, words)).toBe("closes in 30 min");
    expect(voteCloses(now, now, words)).toBe("closing now");
    expect(voteCloses(at(-1), now, words)).toBe("closing now");
  });

  it("says who disputed it, by first name, or someone who left", () => {
    expect(voteMeta(dispute(), PEOPLE, now, words)).toBe("Megan says it’s not done, closes in 17h");
    expect(voteMeta(dispute({ raisedBy: null }), PEOPLE, now, words)).toBe("Someone who left says it’s not done, closes in 17h");
    expect(voteMeta(dispute({ raisedBy: "gone" }), PEOPLE, now, words)).toBe("Someone who left says it’s not done, closes in 17h");
  });

  it("titles a vote with whose John it is, or just the John once they've left", () => {
    expect(voteTitle({ userId: "priya", name: "Clean the bathroom" }, PEOPLE, words)).toBe("Vote on Priya’s Clean the bathroom");
    expect(voteTitle({ userId: "gone", name: "Clean the bathroom" }, PEOPLE, words)).toBe("Vote on Clean the bathroom");
  });

  it("tallies done before not done, the buttons' order", () => {
    expect(voteTally(dispute({ uphold: 2, reject: 0 }), now, words)).toBe("0 done, 2 not done, closes in 17h");
  });
});

describe("johnSheetMode", () => {
  it("goes by whose John it is and where it has got to", () => {
    const mode = (status: BoardItem["status"], userId = ME) => johnSheetMode({ userId, status }, ME);
    expect(mode("upcoming")).toBe("yours-open");
    expect(mode("due-soon")).toBe("yours-open");
    expect(mode("overdue")).toBe("yours-open");
    expect(mode("checking")).toBe("yours-checking");
    expect(mode("disputed")).toBe("yours-disputed");
    expect(mode("upcoming", "priya")).toBe("theirs-open");
    expect(mode("checking", "priya")).toBe("theirs-checking");
    expect(mode("disputed", "priya")).toBe("theirs-disputed");
    for (const status of ["done", "late", "excused", "missed"] as const) {
      expect(mode(status)).toBe("settled");
      expect(mode(status, "priya")).toBe("settled");
    }
  });
});

describe("the sheet's header", () => {
  it("says the kind, the group, the points and how often", () => {
    expect(sheetKind(item("a", { kindName: "Bathroom", points: 1 }), words)).toBe("Bathroom, 1 pt, every week");
    expect(sheetKind(item("a", { groupName: "Upstairs bathroom", points: 4, everyWeeks: 2 }), words)).toBe(
      "Kitchen, Upstairs bathroom, 4 pts, every 2 weeks",
    );
    expect(sheetKind(item("a", { kindName: "Bins" }), words)).toBe("Bins, 2 pts, every week");
    expect(sheetKind(item("a", { points: 8, everyMonths: 3 }), words)).toBe("Kitchen, 8 pts, every 3 months");
    // Its John taken off the list since the deal (or a read that didn't say): no "every".
    expect(sheetKind(item("a", { johnId: null, everyWeeks: null }), words)).toBe("Kitchen, 2 pts");
  });

  it("says the house's time after yours when your clock isn't the house's", () => {
    // In October London is on summer time, 7 hours ahead of Regina: 21:00 there is 14:00 here,
    // and 03:00 on Thursday there is still Wednesday evening here.
    const away = { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: "America/Regina", words };
    expect(sheetWhen(item("a"), away).text).toBe("Due today 14:00 (21:00 house time), late costs £1, missed £3");
    expect(sheetWhen(item("a", { dueAt: at(15) }), away).text).toBe("Due today 20:00 (Thu 03:00 house time), late costs £1, missed £3");
  });

  it("says when it's due and what lateness costs while it's to do", () => {
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({ sign: null, text: "Due today 21:00, late costs £1, missed £3" });
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: { ...RULES, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).text).toBe("Due today 21:00, late costs £1");
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: { ...RULES, lateForfeitMinor: 0 }, now, zone: RULES.timezone, words }).text).toBe("Due today 21:00, missed costs £3");
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: { ...RULES, lateForfeitMinor: 0, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).text).toBe("Due today 21:00");
    expect(sheetWhen(item("a", { movedFrom: at(48) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).text).toBe(
      "Due today 21:00, before you go, late costs £1, missed £3",
    );
  });

  it("signs overdue and disputed Johns, and says only when the rest were due", () => {
    expect(sheetWhen(item("a", { status: "overdue", dueAt: at(-20) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      sign: "overdue",
      text: "Overdue since Tue, £1 now, £3 if missed",
    });
    expect(sheetWhen(item("a", { status: "overdue", dueAt: at(-20) }), { people: PEOPLE, viewerId: ME, rules: { ...RULES, lateForfeitMinor: 0, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).text).toBe(
      "Overdue since Tue",
    );
    expect(sheetWhen(item("a", { status: "disputed", dispute: dispute() }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      sign: "disputed",
      text: "Disputed by Megan",
    });
    expect(sheetWhen(item("a", { status: "checking", movedFrom: at(48) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({ sign: null, text: "Due today 21:00" });
    expect(sheetWhen(item("a", { status: "disputed", dispute: dispute({ raisedBy: null }) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).text).toBe(
      "Disputed by someone who left",
    );
  });

  it("tells whoever raised the dispute that they did", () => {
    const priyas = item("a", { userId: "priya", status: "disputed", dispute: dispute({ raisedBy: ME }) });
    expect(sheetWhen(priyas, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).text).toBe("Disputed by you");
    expect(sheetWhen(priyas, { people: PEOPLE, viewerId: "megan", rules: RULES, now, zone: RULES.timezone, words }).text).toBe("Disputed by Sam");
  });

  it("says what happened once it's settled, in place of what lateness costs, signing late and missed", () => {
    const settled = (status: BoardItem["status"]) =>
      sheetWhen(item("a", { userId: "priya", status, doneAt: at(-48) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words });
    expect(settled("done")).toEqual({ sign: null, text: "Priya did it on time, on Mon at 12:00." });
    expect(settled("late")).toEqual({ sign: "late", text: "Priya did it late, on Mon at 12:00." });
    expect(settled("missed")).toEqual({ sign: "missed", text: "It was missed." });
    expect(settled("excused")).toEqual({ sign: null, text: "Priya used a skip on it, so there’s no forfeit." });
  });

  it("caps what lateness costs at what's left of the stake", () => {
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, 200).text).toBe("Due today 21:00, late costs £1, missed £2");
    expect(sheetWhen(item("a"), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, 0).text).toBe("Due today 21:00");
    expect(sheetWhen(item("a", { status: "overdue", dueAt: at(-20) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, 100).text).toBe(
      "Overdue since Tue, £1 now, £1 if missed",
    );
  });
});

describe("tickedLine", () => {
  const ticked = (doneAt: Date, userId = "megan", standsAt: Date | null = at(21)) =>
    tickedLine(item("a", { userId, status: "checking", doneAt, standsAt }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words });

  it("says who ticked it and when, and when it stands", () => {
    expect(ticked(at(-2))).toBe("Megan ticked this at 10:00, stands in 21h");
    expect(ticked(at(-24))).toBe("Megan ticked this yesterday at 12:00, stands in 21h");
    expect(ticked(at(-48))).toBe("Megan ticked this on Mon at 12:00, stands in 21h");
    expect(ticked(at(-24 * 9))).toBe("Megan ticked this on Mon 5 Oct at 12:00, stands in 21h");
    expect(ticked(at(-2), ME)).toBe("You ticked this at 10:00, stands in 21h");
  });

  it("counts days in the house's zone", () => {
    // 00:30 in London on Wednesday is still Tuesday in UTC.
    expect(ticked(new Date("2026-10-13T23:30:00Z"))).toBe("Megan ticked this at 00:30, stands in 21h");
  });

  it("says it stands any minute once its time has passed", () => {
    expect(ticked(at(-25), "megan", at(-1))).toBe("Megan ticked this yesterday at 11:00, stands any minute");
    expect(ticked(at(-2), "megan", null)).toBe("Megan ticked this at 10:00");
  });
});

describe("settledLine", () => {
  const settled = (status: BoardItem["status"], rules = RULES, userId = "priya") =>
    settledLine(item("a", { userId, status, doneAt: at(-48) }), { people: PEOPLE, viewerId: ME, rules, now, zone: rules.timezone, words });

  it("says what happened, and never what lateness costs", () => {
    expect(settled("done")).toBe("Priya did it on time, on Mon at 12:00.");
    expect(settled("done", RULES, ME)).toBe("You did it on time, on Mon at 12:00.");
    expect(settled("late")).toBe("Priya did it late, on Mon at 12:00.");
    expect(settled("excused")).toBe("Priya used a skip on it, so there’s no forfeit.");
    expect(settled("missed")).toBe("It was missed.");
  });

  it("leaves out when it was ticked when it never was, and says nothing for a John still going", () => {
    expect(settledLine(item("a", { status: "done" }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toBe("You did it on time.");
    expect(settled("checking")).toBe("");
  });
});

describe("cantOptions", () => {
  const theirs = [
    item("later", { userId: "priya", status: "upcoming", dueAt: at(50) }),
    item("soon", { userId: "megan", status: "due-soon", dueAt: at(3) }),
    item("ticked", { userId: "priya", status: "checking" }),
  ];
  const mine = item("mine");
  const b = board([mine, item("mine-too"), ...theirs]);
  const me = (immunityTokens: number, swapTokens: number) => ({ userId: ME, immunityTokens, swapTokens });

  it("offers immunity and housemates' open Johns, soonest first", () => {
    expect(cantOptions(mine, b, me(1, 1))).toEqual({ immunity: 1, swapFor: [theirs[1], theirs[0]] });
    expect(cantOptions(mine, b, me(2, 0))).toEqual({ immunity: 2, swapFor: [] });
    expect(cantOptions(mine, b, me(0, 1))?.immunity).toBe(0);
  });

  it("never swaps a flag: it stays with whoever was on call", () => {
    const flagged = { flaggedAt: at(-1), flaggedBy: "priya" };
    const myFlag = item("my-flag", flagged);
    const theirFlag = item("their-flag", { ...flagged, userId: "megan", status: "due-soon", dueAt: at(1) });
    const fb = board([mine, myFlag, theirFlag, ...theirs]);
    expect(cantOptions(myFlag, fb, me(1, 1))).toEqual({ immunity: 1, swapFor: [] });
    expect(cantOptions(mine, fb, me(0, 1))?.swapFor).toEqual([theirs[1], theirs[0]]);
  });

  it("swaps only Johns not yet due, yours and theirs", () => {
    const late = item("late", { status: "overdue", dueAt: at(-20) });
    const theirsLate = item("theirs-late", { userId: "megan", status: "overdue", dueAt: at(-2) });
    const ob = board([mine, late, theirsLate, ...theirs]);
    expect(cantOptions(late, ob, me(1, 1))).toEqual({ immunity: 1, swapFor: [] });
    expect(cantOptions(late, ob, me(0, 1))).toBeNull();
    expect(cantOptions(mine, ob, me(0, 1))?.swapFor).toEqual([theirs[1], theirs[0]]);
  });

  it("offers nothing without a token to spend, or a swap with nobody to swap with", () => {
    expect(cantOptions(mine, b, me(0, 0))).toBeNull();
    expect(cantOptions(mine, board([mine, theirs[2]]), me(0, 1))).toBeNull();
    expect(cantOptions(mine, b, null)).toBeNull();
  });

  it("offers nothing on a housemate's John or one that's done", () => {
    expect(cantOptions(theirs[0], b, me(1, 1))).toBeNull();
    expect(cantOptions(item("done", { status: "checking" }), b, me(1, 1))).toBeNull();
  });

  it("lists a choice's status word in what a screen reader hears, and in the meta once it's picked", () => {
    const overdue = item("Descale the kettle", { userId: "priya", points: 1, status: "overdue", dueAt: at(-20) });
    expect(swapChoice(overdue, { people: PEOPLE, viewerId: "", rules: RULES, now, zone: RULES.timezone, words }, false)).toEqual({
      meta: "Priya, was due Tue, 1 pt",
      label: "Descale the kettle, Overdue, Priya, was due Tue, 1 pt",
    });
    expect(swapChoice(overdue, { people: PEOPLE, viewerId: "", rules: RULES, now, zone: RULES.timezone, words }, true).meta).toBe("Overdue, Priya, was due Tue, 1 pt");
    // An upcoming John has no word to say.
    const later = item("Bins", { userId: "megan", status: "upcoming", dueAt: at(50) });
    expect(swapChoice(later, { people: PEOPLE, viewerId: "", rules: RULES, now, zone: RULES.timezone, words }, true)).toEqual({ meta: "Megan, Fri 14:00, 2 pts", label: "Bins, Megan, Fri 14:00, 2 pts" });
  });

  it("lists a housemate's John as the swap does, saying when an overdue one was due", () => {
    expect(swapMeta(item("a", { userId: "priya", points: 3 }), { people: PEOPLE, viewerId: "", rules: RULES, now, zone: RULES.timezone, words })).toBe("Priya, today 21:00, 3 pts");
    expect(swapMeta(item("a", { userId: "megan", points: 1, status: "overdue", dueAt: at(-20) }), { people: PEOPLE, viewerId: "", rules: RULES, now, zone: RULES.timezone, words })).toBe(
      "Megan, was due Tue, 1 pt",
    );
  });
});

describe("canSwap", () => {
  const me = (swapTokens: number) => ({ userId: ME, swapTokens });
  const mine = item("mine");
  const theirs = item("theirs", { userId: "priya" });

  it("is ready with a token, one of your Johns open and a housemate's to trade it for", () => {
    expect(canSwap(board([mine, theirs]), me(1))).toBe(true);
  });

  it("isn't without a token, or with nothing of yours open, or nothing of theirs", () => {
    expect(canSwap(board([mine, theirs]), me(0))).toBe(false);
    expect(canSwap(board([mine, theirs]), null)).toBe(false);
    // Yours is disputed (Priya on the seeded house): nothing to swap.
    expect(canSwap(board([item("mine", { status: "disputed", dispute: dispute() }), theirs]), me(1))).toBe(false);
    expect(canSwap(board([mine, item("theirs", { userId: "priya", status: "checking" })]), me(1))).toBe(false);
    expect(canSwap(board([]), me(1))).toBe(false);
  });
});

describe("undoWarning", () => {
  it("is nothing before the John's due time", () => {
    expect(undoWarning({ dueAt: at(2), doneAt: at(-1) }, RULES, now, words)).toBeNull();
  });

  it("warns after the due time that ticking again counts as late, and what late costs", () => {
    expect(undoWarning({ dueAt: at(-5), doneAt: at(-6) }, RULES, now, words)).toBe(
      "It’s past its due time, so it’s overdue as soon as it’s undone, and ticking it again counts as late: £1.",
    );
    // Capped at what's left of the stake: nothing left, nothing said about money.
    expect(undoWarning({ dueAt: at(-5), doneAt: at(-6) }, RULES, now, words, 0)).toBe(
      "It’s past its due time, so it’s overdue as soon as it’s undone, and ticking it again counts as late.",
    );
  });

  it("is nothing for a tick that was late already: ticking again costs the same", () => {
    expect(undoWarning({ dueAt: at(-5), doneAt: at(-1) }, RULES, now, words)).toBeNull();
  });
});

describe("the copy", () => {
  it("names the card's way into If you can't by what you hold", () => {
    expect(words('today.nextUp.cant', { skip: true, swap: true })).toBe("Use a skip or swap");
    expect(words('today.nextUp.cant', { skip: true, swap: false })).toBe("Use a skip");
    expect(words('today.nextUp.cant', { skip: false, swap: true })).toBe("Swap this John");
  });

  it("says what using a skip leaves you with", () => {
    expect(words('john.sheet.skipSentence', { john: "Fresh towels", left: 0 })).toBe("Skip Fresh towels this week? No forfeit, and that’s your last skip.");
    expect(words('john.sheet.skipSentence', { john: "Fresh towels", left: 1 })).toBe("Skip Fresh towels this week? No forfeit, and you’ll have 1 left.");
  });

  it("says how your share catches up after time away, by the house's make-up rate", () => {
    expect(words('today.nextUp.awayBody', { share: awayShare(100) })).toMatch(/^Your share catches up/);
    expect(words('today.nextUp.awayBody', { share: awayShare(50) })).toMatch(/^Half your share/);
    expect(words('today.nextUp.awayBody', { share: awayShare(0) })).toMatch(/nothing to catch up/);
  });

  it("counts the list and the house for the setup checklist", () => {
    expect(words('today.nextUp.onTheList', { count: 0 })).toBe("Nothing on the list yet");
    expect(words('today.nextUp.onTheList', { count: 3 })).toBe("3 on the list");
  });
});

describe("todayPage", () => {
  const page = (overrides: Partial<Parameters<typeof todayPage>[0]> = {}) =>
    todayPage({
      board: board([]),
      mine: [],
      userId: ME,
      me: { userId: ME, immunityTokens: 0, swapTokens: 0 },
      members: PEOPLE,
      rules: RULES,
      away: { today: "2026-10-14", periods: [] },
      stake: null,
      ...overrides,
    }, words);
  const next = item("next", { dueAt: at(3) });
  const theirs = item("theirs", { userId: "priya", status: "upcoming", dueAt: at(30) });
  const stake = buildStake({ ledger: [], closedMonths: [], memberIds: [ME, "priya"], stakeMinor: 2000, month: "2026-10" });

  it("offers a swap for a John you'd rather not, and shows asks made to you, once they're read", () => {
    const mineNot = item("next", { johnId: "bins", dueAt: at(3) });
    const theirsKeen = item("theirs", { johnId: "hob", userId: "priya", status: "upcoming", dueAt: at(30) });
    const members = PEOPLE.map((p) => ({
      ...p,
      prefs: { days: [], bestTime: null, rather: (p.userId === ME ? { bins: -1 } : { bins: 1 }) as Record<string, 1 | -1> },
    }));
    const b = board([mineNot, theirsKeen]);
    expect(page({ board: b, mine: [mineNot], members })).toMatchObject({ swap: null, offers: [] });
    const now = new Date(at(0));
    expect(page({ board: b, mine: [mineNot], members, offers: [], now }).swap).toMatchObject({ kind: "suggest", theirs: { id: "theirs" } });
    const ask = { id: "o1", mine: "theirs", theirs: "next", asked_by: "priya", asked_user_id: ME, expires_at: at(10).toISOString() };
    expect(page({ board: b, mine: [mineNot], members, offers: [ask], now }).offers).toHaveLength(1);
  });

  it("puts your next John on the card and the rest beside it", () => {
    const later = item("later", { status: "upcoming", dueAt: at(40) });
    const done = item("done", { status: "done" });
    expect(page({ mine: [later, done, next] })).toMatchObject({ state: { kind: "john", item: next }, going: [later], finished: [done] });
  });

  it("says what you hold that could skip or swap it", () => {
    const b = board([next, theirs]);
    const held = (immunityTokens: number, swapTokens: number) =>
      page({ board: b, mine: [next], me: { userId: ME, immunityTokens, swapTokens } }).cant;
    expect(held(0, 0)).toEqual({ immunity: false, swap: false });
    expect(held(1, 0)).toEqual({ immunity: true, swap: false });
    expect(held(0, 1)).toEqual({ immunity: false, swap: true });
    // A swap token with nobody's open John to take is nothing to spend.
    expect(page({ board: board([next]), mine: [next], me: { userId: ME, immunityTokens: 0, swapTokens: 1 } }).cant.swap).toBe(false);
    expect(page({ mine: [], me: { userId: ME, immunityTokens: 2, swapTokens: 1 } }).cant).toEqual({ immunity: false, swap: false });
  });

  it("knows what's left of your stake for the card's John's month, once the Stake is read", () => {
    expect(page({ mine: [next] }).room).toBeNull();
    expect(page({ mine: [next], stake }).room).toBe(2000);
    expect(page({ stake }).room).toBeNull();
  });

  it("mentions a trip to come, or one you're on when the card says something else", () => {
    const trip = (startsOn: string, endsOn: string): AwayPeriod => ({ id: "p", userId: ME, startsOn, endsOn, note: null });
    expect(page({ away: { today: "2026-10-14", periods: [trip("2026-10-20", "2026-10-22")] } }).away).toBe("You’re away 20–22 Oct");
    // Away now: the card says so, and the line doesn't.
    const now = page({ mine: [next], away: { today: "2026-10-14", periods: [trip("2026-10-13", "2026-10-16")] } });
    expect(now.state).toEqual({ kind: "away", until: "2026-10-16" });
    expect(now.away).toBeNull();
    // Before the week is out, the card is about that.
    expect(
      page({ board: board([], { week: null }), away: { today: "2026-10-14", periods: [trip("2026-10-13", "2026-10-16")] } }).away,
    ).toBe("You’re away until Fri 16 Oct");
    expect(page({ away: null }).away).toBeNull();
  });

  it("says where you stand once the week is out", () => {
    const table: TableRow[] = [
      { userId: ME, points: 4, rank: 1, done: 2, late: 0, missed: 0, covered: 0, helped: 0 },
      { userId: "priya", points: 2, rank: 2, done: 1, late: 0, missed: 0, covered: 0, helped: 0 },
    ];
    expect(page({ board: board([], { table }), stake }).standing).toBe("1st this week, square in October");
    expect(page({ board: board([], { week: null, table }), stake }).standing).toBeNull();
  });
});

describe("from a real board", () => {
  it("picks Next up and the rest from buildWeekBoard's statuses", () => {
    const week = { id: "w1", starts_on: "2026-10-12", starts_at: WEEK.startsAt.toISOString(), ends_at: WEEK.endsAt.toISOString() };
    const row = (id: string, dueIn: number, doneAgo: number | null = null) => ({
      id,
      user_id: ME,
      name: id,
      points: 1,
      needs_photo: false,
      due_at: at(dueIn).toISOString(),
      original_due_at: null,
      group_name: null,
      done_at: doneAgo === null ? null : at(-doneAgo).toISOString(),
      photo_path: null,
      outcome: null,
      excused: false,
      covered_by: null,
    });
    const b = buildWeekBoard({
      week,
      assignments: [row("ticked", 5, 1), row("later", 60), row("late", -20)],
      disputes: [],
      memberIds: [ME],
      userId: ME,
      everDealt: true,
      disputeHours: 24,
      now,
    });
    expect(nextUp(b.items)?.id).toBe("late");
    expect(restOfWeek(b.items, "late").going.map((i) => [i.id, i.status])).toEqual([
      ["later", "upcoming"],
      ["ticked", "checking"],
    ]);
  });
});

describe("covering a housemate's John", () => {
  // Priya's Bins, due 05:00 today: seven hours overdue at noon.
  const priyas = (overrides: Partial<BoardItem> = {}) =>
    item("Bins", { userId: "priya", status: "overdue", dueAt: at(-7), points: 3, ...overrides });

  it("offers the cover once the grace is over, and says when it opens before that", () => {
    expect(coverOffer(priyas(), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      kind: "cover",
      text: "Priya hasn’t done it. If you do, it counts as Priya’s miss, and you get 3 pts and £3.",
    });
    expect(coverOffer(priyas(), { people: PEOPLE, viewerId: ME, rules: { ...RULES, missedForfeitMinor: 0 }, now, zone: RULES.timezone, words }).text).toBe(
      "Priya hasn’t done it. If you do, it counts as Priya’s miss, and you get 3 pts.",
    );
    expect(coverOffer(priyas({ dueAt: at(-1) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({
      kind: "soon",
      text: "It’s still Priya’s to do. Anyone else can cover it from today 14:00.",
    });
  });

  it("offers nothing on your own John, or one that isn't overdue", () => {
    expect(coverOffer(priyas({ userId: ME }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).kind).toBeNull();
    expect(coverOffer(priyas({ status: "due-soon", dueAt: at(2) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).kind).toBeNull();
    expect(coverOffer(priyas({ status: "checking", doneAt: at(-1) }), { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).kind).toBeNull();
  });

  it("names whose John it is on Needs you", () => {
    expect(coverTitle(priyas(), PEOPLE, words)).toBe("Cover Priya’s Bins");
    expect(coverTitle(priyas({ userId: "gone" }), PEOPLE, words)).toBe("Cover Bins");
  });

  it("is the coverer's to check and undo while it's live, and settled after", () => {
    const live = { userId: "priya", status: "covered" as const, coveredBy: ME, outcome: null };
    expect(johnSheetMode(live, ME)).toBe("yours-checking");
    expect(johnSheetMode(live, "priya")).toBe("theirs-checking");
    expect(johnSheetMode(live, "megan")).toBe("theirs-checking");
    expect(johnSheetMode({ ...live, outcome: "covered" }, ME)).toBe("settled");
    // Disputed, the cover is the coverer's to answer.
    expect(johnSheetMode({ ...live, status: "disputed" }, ME)).toBe("yours-disputed");
    expect(johnSheetMode({ ...live, status: "disputed" }, "priya")).toBe("theirs-disputed");
  });

  it("says who covered it and when", () => {
    const covered = priyas({ status: "covered", coveredBy: "megan", doneAt: at(-2), standsAt: at(21) });
    expect(tickedLine(covered, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toBe("Megan covered this at 10:00, stands in 21h");
    expect(tickedLine({ ...covered, coveredBy: ME }, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toBe("You covered this at 10:00, stands in 21h");
    expect(sheetWhen(covered, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toEqual({ sign: "covered", text: "Covered, was due 05:00" });
  });

  it("says, settled, that it counts as the assignee's miss", () => {
    const settled = priyas({ status: "covered", outcome: "covered", coveredBy: "megan", doneAt: at(-48) });
    expect(settledLine(settled, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words })).toBe("Megan did it for Priya on Mon at 12:00, so it counts as Priya’s miss.");
    expect(settledLine(settled, { people: PEOPLE, viewerId: "priya", rules: RULES, now, zone: RULES.timezone, words })).toBe("Megan did it for you on Mon at 12:00, so it counts as your miss.");
    expect(settledLine(settled, { people: PEOPLE, viewerId: "megan", rules: RULES, now, zone: RULES.timezone, words })).toBe("You did it for Priya on Mon at 12:00, so it counts as Priya’s miss.");
    expect(sheetWhen(settled, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }).sign).toBe("covered");
  });

  it("leaves the undo warning off a cover", () => {
    expect(undoWarning(priyas({ status: "covered", coveredBy: ME, doneAt: at(-1) }), RULES, now, words)).toBeNull();
  });
});
