import { describe, expect, it } from "vitest";

import type { AwayPeriod } from "./away";
import type { BoardItem, DisputeView } from "./board";
import type { LiveStatus } from "./outcome";
import {
  liveWeekFilter,
  toggleWeekFilter,
  WEEK_PARTS,
  weekAwayLine,
  weekAwayNote,
  weekFairness,
  weekFinished,
  weekList,
  weekPart,
  weekPeople,
  weekPersonMeta,
  weekRangeLine,
  weekShareRows,
  weekSpokenRow,
  weekSummary,
  weekUnticked,
  weekWho,
} from "./week-summary";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const HOUR = 3_600_000;
// Thursday 22 Oct 2026, 15:00 in London (BST, an hour ahead of UTC).
const now = new Date("2026-10-22T14:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
const ZONE = "Europe/London";
const ALL: LiveStatus[] = ["upcoming", "due-soon", "overdue", "checking", "disputed", "done", "late", "missed", "excused"];
const NAMES: Record<string, string> = { sam: "Sam Carter", priya: "Priya Shah", tom: "Tom Reilly", megan: "Megan Doyle" };
const nameOf = (id: string): string | null => NAMES[id] ?? null;

function item(id: string, overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id,
    flaggedAt: null,
    flaggedBy: null,
    carried: false,
    dealt: null,
    johnId: `j-${id}`,
    everyWeeks: 1,
    userId: "sam",
    name: id,
    category: "kitchen",
    points: 2,
    needsPhoto: false,
    dueAt: at(30),
    movedFrom: null,
    groupName: null,
    doneAt: null,
    photoPath: null,
    coveredBy: null,
    outcome: null,
    status: "upcoming",
    standsAt: null,
    dispute: null,
    // A day to do it late, as the house's default late window.
    closesAt: new Date((overrides.dueAt ?? at(30)).getTime() + 86_400_000),
    ...overrides,
  };
}

function dispute(overrides: Partial<DisputeView> = {}): DisputeView {
  return {
    id: "d1",
    assignmentId: "a1",
    raisedBy: "megan",
    reason: "Still grubby",
    closesAt: at(17),
    uphold: 1,
    reject: 1,
    myVote: null,
    ...overrides,
  };
}

/** The mockup's week: 11 Johns across four people. */
const MOCKUP: BoardItem[] = [
  item("towels", { status: "due-soon", category: "bathroom", dueAt: at(6) }),
  item("fridge", { status: "checking", doneAt: at(-6), standsAt: at(18) }),
  item("bins", { status: "done", doneAt: at(-40), dueAt: at(-30) }),
  item("bathroom", { userId: "priya", status: "disputed", category: "bathroom", dispute: dispute() }),
  item("hob", { userId: "priya", status: "done", dueAt: at(-50) }),
  item("loo", { userId: "priya", status: "done", dueAt: at(-20) }),
  item("plants", { userId: "tom", status: "overdue", category: "other", dueAt: at(-50) }),
  item("stairs", { userId: "tom", status: "due-soon", category: "floors", dueAt: at(6) }),
  item("mop", { userId: "tom", status: "late", dueAt: at(-30), doneAt: at(-20) }),
  item("wipe", { userId: "megan", status: "checking", doneAt: at(-3), standsAt: at(21) }),
  item("caddy", { userId: "megan", status: "done", dueAt: at(-10) }),
];
const MEMBERS = ["priya", "sam", "tom", "megan"];

describe("weekPart and weekFinished", () => {
  it("puts every status in exactly one of the five parts", () => {
    for (const status of ALL) expect(WEEK_PARTS).toContain(weekPart(status));
    expect(ALL.map(weekPart)).toEqual(["toGo", "toGo", "overdue", "checking", "disputed", "done", "done", "overdue", "done"]);
  });

  it("folds away only what's finished: done, late and excused", () => {
    expect(ALL.filter(weekFinished)).toEqual(["done", "late", "excused"]);
  });
});

describe("weekSummary", () => {
  it("adds up to the week's Johns: the mockup's 5, 2, 1, 1 and 2 make 11", () => {
    const summary = weekSummary(MOCKUP, words);
    expect(summary.total).toBe(11);
    expect(summary.parts.map((p) => [p.part, p.count])).toEqual([
      ["done", 5],
      ["checking", 2],
      ["disputed", 1],
      ["overdue", 1],
      ["toGo", 2],
    ]);
    expect(summary.parts.reduce((sum, p) => sum + p.count, 0)).toBe(summary.total);
    expect(summary.spoken).toBe("11 Johns: 5 done, 2 checking, 1 disputed, 1 overdue, 2 to go");
  });

  it("adds up for every mix of statuses, a disputed tick counted once (never as done too)", () => {
    const items = ALL.map((status, i) => item(`a${i}`, { status }));
    const summary = weekSummary(items, words);
    expect(summary.parts.reduce((sum, p) => sum + p.count, 0)).toBe(ALL.length);
    expect(summary.parts.find((p) => p.part === "done")!.count).toBe(3);
    expect(summary.parts.find((p) => p.part === "overdue")!.count).toBe(2);
  });

  it("keeps all five parts at zero, and says so, for an empty week", () => {
    const summary = weekSummary([], words);
    expect(summary.total).toBe(0);
    expect(summary.parts.map((p) => p.count)).toEqual([0, 0, 0, 0, 0]);
    expect(summary.parts.map((p) => p.label)).toEqual(["done", "checking", "disputed", "overdue", "to go"]);
    expect(summary.spoken).toBe("No Johns this week");
  });

  it("speaks of one John in the singular and leaves out empty parts", () => {
    expect(weekSummary([item("a")], words).spoken).toBe("1 John: 1 to go");
  });
});

describe("the filter", () => {
  it("shows one part, and clears when that part is pressed again", () => {
    expect(toggleWeekFilter(null, "done")).toBe("done");
    expect(toggleWeekFilter("done", "done")).toBeNull();
    expect(toggleWeekFilter("done", "overdue")).toBe("overdue");
  });

  it("lets go once its part is empty, as when the last overdue John is ticked", () => {
    const summary = weekSummary([item("a", { status: "checking" })], words);
    expect(liveWeekFilter(summary, "checking")).toBe("checking");
    expect(liveWeekFilter(summary, "overdue")).toBeNull();
    expect(liveWeekFilter(summary, null)).toBeNull();
  });
});

describe("weekUnticked", () => {
  it("is true only while nothing this week has been ticked or settled", () => {
    expect(weekUnticked([item("a"), item("b", { status: "overdue" })])).toBe(true);
    expect(weekUnticked([item("a"), item("b", { doneAt: at(-1), status: "checking" })])).toBe(false);
    expect(weekUnticked([item("a", { outcome: "excused", status: "excused" })])).toBe(false);
    expect(weekUnticked([])).toBe(true);
  });
});

describe("weekPeople", () => {
  it("puts you first, then everyone else in the order they joined", () => {
    expect(weekPeople(MOCKUP, MEMBERS, "sam").map((p) => p.userId)).toEqual(["sam", "priya", "tom", "megan"]);
  });

  it("shows what's still in play, what needs doing first, and folds what's finished", () => {
    const tom = weekPeople(MOCKUP, MEMBERS, "sam").find((p) => p.userId === "tom")!;
    expect(tom.rows.map((i) => i.id)).toEqual(["plants", "stairs"]);
    expect(tom.folded.map((i) => i.id)).toEqual(["mop"]);
    expect([tom.done, tom.total]).toEqual([1, 3]);
    const sam = weekPeople(MOCKUP, MEMBERS, "sam")[0];
    // Due soon before being checked, whatever the due times.
    expect(sam.rows.map((i) => i.id)).toEqual(["towels", "fridge"]);
  });

  it("orders ties by when they're due", () => {
    const items = [item("later", { dueAt: at(50) }), item("sooner", { dueAt: at(40) })];
    expect(weekPeople(items, ["sam"], "sam")[0].rows.map((i) => i.id)).toEqual(["sooner", "later"]);
  });

  it("gives everyone in the house a group, Johns or not, and anyone who left but holds one a group at the end", () => {
    const people = weekPeople([item("a", { userId: "gone" })], ["sam", "priya"], "priya");
    expect(people.map((p) => [p.userId, p.total])).toEqual([
      ["priya", 0],
      ["sam", 0],
      ["gone", 1],
    ]);
  });

  it("with a filter, shows only the people with Johns in it, unfolded", () => {
    const done = weekPeople(MOCKUP, MEMBERS, "sam", "done");
    expect(done.map((p) => [p.userId, p.rows.length, p.folded.length])).toEqual([
      ["sam", 1, 0],
      ["priya", 2, 0],
      ["tom", 1, 0],
      ["megan", 1, 0],
    ]);
    // The header still counts the whole week.
    expect(done[1].total).toBe(3);
    expect(weekPeople(MOCKUP, MEMBERS, "sam", "overdue").map((p) => p.userId)).toEqual(["tom"]);
  });

  it("is empty for an empty house", () => {
    expect(weekPeople([], [], "sam")).toEqual([]);
  });
});

describe("weekList", () => {
  it("lists the whole house's open Johns, what needs doing first, and folds the finished, the latest done first, as Today does", () => {
    const { rows, folded } = weekList(MOCKUP);
    expect(rows.map((i) => i.id)).toEqual(["plants", "towels", "stairs", "bathroom", "fridge", "wipe"]);
    // By when each was ticked, or due when it never was.
    expect(folded.map((i) => i.id)).toEqual(["caddy", "loo", "mop", "bins", "hob"]);
    expect(rows.length + folded.length).toBe(MOCKUP.length);
  });

  it("with a filter, lists only that part, unfolded", () => {
    expect(weekList(MOCKUP, "checking")).toEqual({ rows: [MOCKUP[1], MOCKUP[9]], folded: [] });
    expect(weekList([], "done")).toEqual({ rows: [], folded: [] });
  });
});

describe("weekPersonMeta", () => {
  it("says how many are done and the points", () => {
    expect(weekPersonMeta({ done: 1, total: 3, points: 6 }, words)).toBe("1 of 3 done, 6 pts");
    expect(weekPersonMeta({ done: 1, total: 2, points: 1 }, words)).toBe("1 of 2 done, 1 pt");
    expect(weekPersonMeta({ done: 0, total: 2, points: 0 }, words)).toBe("0 of 2 done, 0 pts");
    expect(weekPersonMeta({ done: 2, total: 2, points: 1.5 }, words)).toBe("2 of 2 done, 1.5 pts");
  });

  it("says nothing for someone with no Johns", () => {
    expect(weekPersonMeta({ done: 0, total: 0, points: 0 }, words)).toBeNull();
  });
});

describe("weekAwayNote", () => {
  const away = (userId: string, startsOn: string, endsOn: string): AwayPeriod => ({
    id: `${userId}-${startsOn}`,
    userId,
    startsOn,
    endsOn,
    note: null,
  });
  // The week runs Wednesday 21 to Tuesday 27 Oct; today is Monday 26th.
  const WEEK = "2026-10-21";
  const TODAY = "2026-10-26";

  it("names time away in this week, the whole trip, even past its end", () => {
    expect(weekAwayNote([away("megan", "2026-10-27", "2026-10-30")], "megan", WEEK, TODAY, words)).toBe("away 27–30 Oct");
    expect(weekAwayNote([away("tom", "2026-10-21", "2026-10-22")], "tom", WEEK, TODAY, words)).toBe("away 21–22 Oct");
  });

  it("names the next trip when it starts within a week of today", () => {
    expect(weekAwayNote([away("megan", "2026-10-29", "2026-11-01")], "megan", WEEK, TODAY, words)).toBe("away 29 Oct–1 Nov");
    expect(weekAwayNote([away("megan", "2026-11-03", "2026-11-04")], "megan", WEEK, TODAY, words)).toBeNull();
  });

  it("says all week for someone away the whole of it", () => {
    expect(weekAwayNote([away("sam", "2026-10-01", "2026-11-30")], "sam", WEEK, TODAY, words)).toBe("away all week");
    expect(
      weekAwayNote([away("sam", "2026-10-21", "2026-10-23"), away("sam", "2026-10-24", "2026-10-27")], "sam", WEEK, TODAY, words),
    ).toBe("away all week");
  });

  it("prefers the trip still to come over one already over, and ignores everyone else's", () => {
    const periods = [away("tom", "2026-10-21", "2026-10-22"), away("tom", "2026-10-27", "2026-10-27"), away("sam", "2026-10-26", "2026-10-26")];
    expect(weekAwayNote(periods, "tom", WEEK, TODAY, words)).toBe("away Tue 27 Oct");
    expect(weekAwayNote([], "tom", WEEK, TODAY, words)).toBeNull();
  });
});

describe("weekAwayLine", () => {
  it("says who's away, in the order given, speaking to you as you", () => {
    expect(
      weekAwayLine(
        [
          { userId: "sam", away: "away all week" },
          { userId: "priya", away: null },
          { userId: "megan", away: "away 28–31 Oct" },
        ],
        "sam",
        nameOf,
       words),
    ).toBe("You’re away all week. Megan is away 28–31 Oct.");
  });

  it("names someone who has left as someone who left", () => {
    expect(weekAwayLine([{ userId: "cal", away: "away 21–22 Oct" }], "sam", nameOf, words)).toBe("Someone who left is away 21–22 Oct.");
  });

  it("is nothing when nobody's away", () => {
    expect(weekAwayLine([{ userId: "sam", away: null }], "sam", nameOf, words)).toBeNull();
    expect(weekAwayLine([], "sam", nameOf, words)).toBeNull();
  });
});

describe("weekRangeLine", () => {
  // Monday 19 to Sunday 25 Oct 2026 in London. The clocks go back at 02:00 on the
  // 25th, so the week ends at midnight GMT, 00:00 UTC on the 26th.
  const startsAt = new Date("2026-10-18T23:00:00Z");
  const endsAt = new Date("2026-10-26T00:00:00Z");

  it("says the week ends tonight on its last day, across the clocks going back", () => {
    expect(weekRangeLine(startsAt, endsAt, new Date("2026-10-25T23:30:00Z"), ZONE, words)).toBe("19–25 Oct, ends tonight");
    expect(weekRangeLine(startsAt, endsAt, new Date("2026-10-25T00:30:00Z"), ZONE, words)).toBe("19–25 Oct, ends tonight");
  });

  it("says tomorrow the day before, and the weekday before that", () => {
    expect(weekRangeLine(startsAt, endsAt, new Date("2026-10-24T12:00:00Z"), ZONE, words)).toBe("19–25 Oct, ends tomorrow");
    expect(weekRangeLine(startsAt, endsAt, new Date("2026-10-19T08:00:00Z"), ZONE, words)).toBe("19–25 Oct, ends Sun");
  });

  it("says it has ended from the moment it ends", () => {
    expect(weekRangeLine(startsAt, endsAt, endsAt, ZONE, words)).toBe("19–25 Oct, ended");
  });

  it("reads the days in the house's zone, not the device's", () => {
    // The same instants, for a house in New York: its week is the 18th to the 25th's evening.
    expect(weekRangeLine(startsAt, endsAt, new Date("2026-10-25T12:00:00Z"), "America/New_York", words)).toBe("18–25 Oct, ends tonight");
  });

  it("spans two months", () => {
    const start = new Date("2026-10-26T00:00:00Z");
    const end = new Date("2026-11-02T00:00:00Z");
    expect(weekRangeLine(start, end, new Date("2026-10-28T12:00:00Z"), ZONE, words)).toBe("26 Oct–1 Nov, ends Sun");
  });
});

describe("weekSpokenRow", () => {
  it("says every column in a sentence: name, meta, whose, points and status", () => {
    expect(weekSpokenRow({ name: "Descale the kettle", status: "overdue" }, "Kitchen, was due Sun", "Tom", 1, words)).toBe(
      "Descale the kettle, Kitchen, was due Sun, Tom, 1 pt, Overdue",
    );
    expect(weekSpokenRow({ name: "Bins out", status: "checking" }, "Bins, stands in 21h", "You", 0, words)).toBe(
      "Bins out, Bins, stands in 21h, You, 0 pts, Done, being checked",
    );
  });

  it("says no status for an upcoming John, which shows none", () => {
    expect(weekSpokenRow({ name: "Bins out", status: "upcoming" }, "Bins, Thu 07:00", "Megan", 2, words)).toBe(
      "Bins out, Bins, Thu 07:00, Megan, 2 pts",
    );
  });
});

describe("weekShareRows", () => {
  const balances = [
    { userId: "tom", balance: -4.2 },
    { userId: "sam", balance: 0.1 },
    { userId: "megan", balance: 3.3 },
    { userId: "priya", balance: 0.75 },
  ];

  it("lists you first, then the order they joined, with each balance as the Table writes it", () => {
    expect(weekShareRows(balances, ["priya", "sam", "tom", "megan"], "sam", 100, words).rows).toEqual([
      { userId: "sam", balance: "level" },
      { userId: "priya", balance: "+1" },
      { userId: "tom", balance: "−4" },
      { userId: "megan", balance: "+3.5" },
    ]);
  });

  it("puts anyone it doesn't know at the end, and lists nobody when there are no shares", () => {
    expect(weekShareRows([{ userId: "cal", balance: 1 }, ...balances.slice(0, 1)], ["tom"], "sam", 100, words).rows.map((r) => r.userId)).toEqual([
      "tom",
      "cal",
    ]);
    expect(weekShareRows([], [], "sam", 100, words).rows).toEqual([]);
  });

  it("says how the house makes up time away, in full by default", () => {
    expect(weekShareRows([], [], "sam", 50, words).key).toBe("Below zero is behind, above is ahead. Time away is made up: half.");
    expect(weekShareRows([], [], "sam", 0, words).key).toBe("Below zero is behind, above is ahead. Time away is made up: not at all.");
    expect(weekShareRows([], [], "sam", 75, words).key).toBe("Below zero is behind, above is ahead. Time away is made up: in full.");
  });
});

describe("weekWho", () => {
  it("says You, a first name, or someone who left", () => {
    expect(weekWho("sam", "sam", nameOf, words)).toBe("You");
    expect(weekWho("megan", "sam", nameOf, words)).toBe("Megan");
    expect(weekWho("cal", "sam", nameOf, words)).toBe("Someone who left");
  });
});

describe("weekFairness", () => {
  const four = (balances: number[]) => balances.map((balance, i) => ({ userId: ["sam", "priya", "tom", "megan"][i], balance }));

  it("is even when everyone is within half a point of their share", () => {
    expect(weekFairness(four([0, 0.25, -0.4, 0]), [2, 2], "sam", nameOf, words)).toBe("The deal is even: everyone’s on their share.");
    expect(weekFairness(four([0, 0, 0, 0]), [], "sam", nameOf, words)).toBe("The deal is even: everyone’s on their share.");
  });

  it("is still even when nobody is more than half this week's average John off", () => {
    // Johns of 2 and 4 points average 3, so half a John is 1.5.
    expect(weekFairness(four([1.5, -1, 0, -0.5]), [2, 4], "sam", nameOf, words)).toBe(
      "The deal is even: nobody’s more than half a John off their share.",
    );
  });

  it("names whoever is furthest off, rounded to the half point", () => {
    expect(weekFairness(four([1, -4.2, 0, 3]), [2, 2], "sam", nameOf, words)).toBe(
      "Priya is 4 pts behind on fair shares, and catching up a little each week.",
    );
    expect(weekFairness(four([-1, 3.3, 0, -2]), [2, 2], "sam", nameOf, words)).toBe(
      "Priya is 3.5 pts ahead on fair shares; the next deals even it out.",
    );
  });

  it("speaks to you when it's you", () => {
    expect(weekFairness(four([-3, 0, 1, 2]), [2], "sam", nameOf, words)).toBe(
      "You’re 3 pts behind on fair shares, and catching up a little each week.",
    );
  });

  it("names the one behind on a tie with someone ahead", () => {
    expect(weekFairness(four([3, 0, -3, 0]), [2], "sam", nameOf, words)).toBe(
      "Tom is 3 pts behind on fair shares, and catching up a little each week.",
    );
  });

  it("takes a John as one point when nothing's been dealt", () => {
    expect(weekFairness(four([0, 0.75, 0, 0]), [], "sam", nameOf, words)).toBe("Priya is 1 pt ahead on fair shares; the next deals even it out.");
  });

  it("says nothing for a house of one, or before the shares are read", () => {
    expect(weekFairness([{ userId: "sam", balance: 0 }], [2], "sam", nameOf, words)).toBeNull();
    expect(weekFairness([], [2], "sam", nameOf, words)).toBeNull();
  });
});
