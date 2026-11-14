import { describe, expect, it } from "vitest";

import { readDealt, type BoardItem } from "./board";
import type { DealWhy } from "./deal";
import { DEFAULT_RULES, type HouseRules } from "./domain";
import { johnWhy } from "./why";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const HOUR = 3_600_000;
// Wednesday 14 Oct 2026, noon in London (BST, UTC+1).
const now = new Date("2026-10-14T11:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);

const RULES: HouseRules = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" };
const ME = "me";
const PEOPLE = [
  { userId: ME, name: "Sam Carter" },
  { userId: "priya", name: "Priya Shah" },
  { userId: "megan", name: "Megan Doyle" },
];

function item(dealt: DealWhy | null, overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: "a1",
    flaggedAt: null,
    flaggedBy: null,
    carried: false,
    dealt,
    johnId: "j1",
    everyWeeks: 1,
    userId: ME,
    name: "Bins",
    category: "kitchen",
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
    // Tomorrow 21:00: the house's default day to do it late.
    closesAt: at(33),
    ...overrides,
  };
}

const why = (b: BoardItem, viewer = ME) => johnWhy(b, { people: PEOPLE, viewerId: viewer, rules: RULES, now, zone: RULES.timezone, words });

describe("johnWhy: why it went where it did", () => {
  it("says it went to whoever was furthest behind, and how each stood", () => {
    const b = item({
      to: ME,
      by: "behind",
      weighed: [
        { userId: ME, standing: -2.5 },
        { userId: "priya", standing: 0 },
        { userId: "megan", standing: 1 },
      ],
      away: [],
    });
    const view = why(b);
    expect(view.answer).toBe(words('john.why.behind', { who: "you" }));
    expect(view.rows.map((r) => [r.name, r.value, r.meta])).toEqual([
      ["You", "−2.5", words('john.why.dealtIt')],
      ["Priya", "level", null],
      ["Megan", "+1", null],
    ]);
  });

  it("names whoever it went to, to a housemate looking", () => {
    const b = item({ to: ME, by: "behind", weighed: [{ userId: ME, standing: -1 }, { userId: "priya", standing: 0 }], away: [] });
    expect(why(b, "priya").answer).toBe(words('john.why.behind', { who: "Sam" }));
  });

  it("says when someone further behind had already been handed the most a week gives", () => {
    const b = item({
      to: ME,
      by: "behind",
      weighed: [
        { userId: "megan", standing: -4, full: true },
        { userId: ME, standing: -1 },
      ],
      away: [],
    });
    expect(why(b).answer).toBe(`${words('john.why.behind', { who: "you" })} ${words('john.why.full', { names: "Megan", one: true })}`);
    expect(why(b).rows[0].meta).toBe(words('john.why.handedMost'));
  });

  it("says when doing it last time moved it on", () => {
    const b = item({
      to: ME,
      by: "behind",
      weighed: [
        { userId: "priya", standing: -1, last: true },
        { userId: ME, standing: -1 },
      ],
      away: [],
    });
    expect(why(b).answer).toBe(`${words('john.why.nudged', { who: "you" })} ${words('john.why.movedOn', { names: "Priya", one: true, level: true })}`);
    expect(why(b).rows.find((r) => r.userId === "priya")?.meta).toBe(words('john.why.hadItLast'));
  });

  it("says when you had it last time and were still furthest behind", () => {
    const b = item({
      to: ME,
      by: "behind",
      weighed: [
        { userId: ME, standing: -5, last: true },
        { userId: "priya", standing: 0 },
      ],
      away: [],
    });
    expect(why(b).answer).toBe(`${words('john.why.behind', { who: "you" })} ${words('john.why.again', { who: "You", you: true })}`);
  });

  it("says when you were the only one home, and who was away", () => {
    const b = item({ to: ME, by: "only", weighed: [{ userId: ME, standing: 0 }], away: ["priya", "megan"] });
    expect(why(b).answer).toBe(`${words('john.why.only', { who: "You", you: true })} ${words('john.why.away', { names: "Priya and Megan", one: false })}`);
    expect(why(b).rows).toEqual([]);
  });

  it("says when it was level and went on fewer Johns, or a draw", () => {
    const level = [
      { userId: ME, standing: 0 },
      { userId: "priya", standing: 0 },
    ];
    expect(why(item({ to: ME, by: "fewer", weighed: level, away: [] })).answer).toBe(words('john.why.fewer', { who: "you" }));
    expect(why(item({ to: ME, by: "draw", weighed: level, away: [] })).answer).toBe(words('john.why.draw', { who: "you" }));
  });

  it("says when it changed hands after the deal", () => {
    const b = item({ to: "priya", by: "behind", weighed: [{ userId: "priya", standing: -2 }, { userId: ME, standing: 0 }], away: [] });
    expect(why(b).answer).toBe(`${words('john.why.behind', { who: "Priya" })} ${words('john.why.moved', { dealtTo: "Priya", holder: "you" })}`);
  });

  it("says a flag goes to whoever is on call, and owns up to a John dealt before the deal kept its working", () => {
    expect(why(item(null, { flaggedAt: at(-1) })).answer).toBe(words('john.why.flag'));
    expect(why(item(null)).answer).toBe(words('john.why.unknown'));
  });
});

describe("johnWhy: what's at stake", () => {
  it("says when it turns missed, that a miss comes back, and when a housemate can cover it", () => {
    // Due today 21:00, the grace three hours: cover opens at midnight.
    expect(why(item(null)).stakes).toBe(`${words('john.why.missedBy', { when: "tomorrow 21:00", holder: "you" })} ${words('john.why.coverFrom', { when: "tomorrow 00:00" })}`);
    expect(why(item(null), "priya").stakes).toBe(`${words('john.why.missedBy', { when: "tomorrow 21:00", holder: "Sam" })} ${words('john.why.coverFrom', { when: "tomorrow 00:00" })}`);
  });

  it("says a housemate can cover it now once the grace is up", () => {
    const b = item(null, { dueAt: at(-4), closesAt: at(20), status: "overdue" });
    expect(why(b).stakes).toBe(`${words('john.why.missedBy', { when: "tomorrow 08:00", holder: "you" })} ${words('john.why.coverNow')}`);
  });

  it("says whose work it counted as, once done", () => {
    expect(why(item(null, { status: "done", doneAt: at(-1), outcome: "done" })).stakes).toBe(words('john.why.counts', { whose: "your" }));
    expect(why(item(null, { status: "late", outcome: "late" }), "priya").stakes).toBe(words('john.why.counts', { whose: "Sam’s" }));
    expect(why(item(null, { status: "covered", coveredBy: "priya", outcome: "missed" })).stakes).toBe(
      words('john.why.coveredCounts', { who: "Priya", whose: "Priya’s" }),
    );
    expect(why(item(null, { status: "missed", outcome: "missed" })).stakes).toBe(words('john.why.missedCounts', { holder: "you" }));
    expect(why(item(null, { status: "excused", outcome: "excused" })).stakes).toBe(words('john.why.excusedCounts'));
    expect(why(item(null, { status: "disputed" })).stakes).toBeNull();
  });
});

describe("readDealt", () => {
  it("reads what the deal kept", () => {
    const kept = { to: "a", by: "behind", weighed: [{ userId: "a", standing: -1, last: true }], away: ["b"] };
    expect(readDealt(kept)).toEqual(kept);
  });

  it("is null for nothing, or a shape it doesn't know", () => {
    expect(readDealt(null)).toBeNull();
    expect(readDealt(undefined)).toBeNull();
    expect(readDealt({ to: "a", by: "vibes", weighed: [], away: [] })).toBeNull();
    expect(readDealt({ to: "a", by: "only", weighed: [{ userId: "a" }], away: [] })).toBeNull();
    expect(readDealt([1, 2])).toBeNull();
  });
});

describe("johnWhy: a John done together", () => {
  const first: DealWhy = {
    to: ME,
    by: "behind",
    weighed: [
      { userId: ME, standing: -5 },
      { userId: "priya", standing: -3 },
      { userId: "megan", standing: 2 },
    ],
    away: [],
  };
  const second: DealWhy = { to: "priya", by: "behind", weighed: first.weighed.slice(1), away: [] };
  const mine = item(first, { id: "a1", jobId: "job", points: 4 });
  const priyas = item(second, { id: "a2", jobId: "job", userId: "priya", points: 4 });

  it("says how many it needs and who was furthest behind of everyone home", () => {
    const view = johnWhy(mine, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, [mine, priyas]);
    expect(view.answer).toBe("Needs 2. You and Priya were furthest behind of the 3 home.");
    expect(view.rows.filter((r) => r.chosen).map((r) => r.userId)).toEqual([ME, "priya"]);
  });

  it("says whose work it counts as once the roll call has said who did it", () => {
    const crew = {
      tickedFrom: "a1",
      tickedBy: ME,
      total: 8,
      people: [
        { userId: ME, helper: false, points: 4 },
        { userId: "megan", helper: true, points: 4 },
      ],
    };
    const done = { ...mine, status: "done" as const, doneAt: at(-30), outcome: "done" as const, crew };
    expect(johnWhy(done, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, [done]).stakes).toBe("You and Megan did it, so it counts as 4 pts of work each.");
    const left = { ...priyas, status: "missed" as const, absentAt: at(-30), outcome: "missed" as const, crew };
    expect(johnWhy(left, { people: PEOPLE, viewerId: ME, rules: RULES, now, zone: RULES.timezone, words }, [left]).stakes).toBe(
      "Priya wasn’t there, so it’s Priya’s miss: the part goes to whoever did it, and the work comes back in the next deals.",
    );
  });
});

describe("johnWhy: Steady weeks", () => {
  const budget = (over: Partial<DealWhy>): DealWhy => ({
    to: ME,
    by: "mostRoom",
    mode: "smart",
    budget: 4,
    weighed: [
      { userId: ME, standing: -1, room: 2 },
      { userId: "priya", standing: 1, room: 0.5 },
    ],
    away: [],
    ...over,
  });

  it("says it went to whoever had the most budget left, and shows what each had left", () => {
    const view = why(item(budget({})));
    expect(view.answer).toBe(words('john.why.mostRoom', { who: "you" }));
    expect(view.key).toBe(words('john.why.keyBudget'));
    expect(view.rows.map((r) => [r.name, r.value, r.meta])).toEqual([
      ["You", "−1", `${words('john.why.dealtIt')}, ${words('john.why.left', { room: 2 })}`],
      ["Priya", "+1", words('john.why.left', { room: 0.5 })],
    ]);
  });

  it("says it was your one John, or a housemate's", () => {
    expect(why(item(budget({ by: "oneEach" }))).answer).toBe(words('john.why.oneEach', { whose: words('john.why.yours') }));
    expect(why(item(budget({ by: "oneEach" })), "priya").answer).toBe(words('john.why.oneEach', { whose: "Sam’s" }));
  });

  it("says a missed John came back to whoever missed it", () => {
    expect(why(item(budget({ by: "back", weighed: [] }))).answer).toBe(words('john.why.back', { who: "You", you: true }));
  });

  it("says how long it waited, and when it went over a budget or back to last time's holder", () => {
    expect(why(item(budget({ waited: 2, stretched: true }))).answer).toBe(
      `${words('john.why.mostRoom', { who: "you" })} ${words('john.why.waited', { weeks: 2 })} ${words('john.why.stretched', { whose: "your" })}`,
    );
    expect(why(item(budget({ waited: 2, again: true }))).answer).toBe(
      `${words('john.why.mostRoom', { who: "you" })} ${words('john.why.waited', { weeks: 2 })} ${words('john.why.againWaited')}`,
    );
  });

  it("says why it's on another day", () => {
    expect(why(item(budget({ moved: "suits" }))).answer).toBe(`${words('john.why.mostRoom', { who: "you" })} ${words('john.why.movedSuits', { who: "you" })}`);
    expect(why(item(budget({ moved: "gone" }))).answer).toBe(`${words('john.why.mostRoom', { who: "you" })} ${words('john.why.movedGone')}`);
  });

  it("shows Classic's line of turns", () => {
    const view = why(
      item({
        to: ME,
        by: "nextInLine",
        mode: "classic",
        budget: 4,
        weighed: [
          { userId: ME, standing: 0, place: 1, room: 2 },
          { userId: "priya", standing: 0, place: 2, room: 0 },
        ],
        away: [],
      }),
    );
    expect(view.answer).toBe(words('john.why.nextInLine', { who: "you" }));
    expect(view.key).toBe(words('john.why.keyTurns'));
    expect(view.rows.map((r) => [r.name, r.value, r.meta])).toEqual([
      ["You", words('john.why.inLine', { place: 1 }), words('john.why.dealtIt')],
      ["Priya", words('john.why.inLine', { place: 2 }), null],
    ]);
    expect(why(item({ to: ME, by: "turn", mode: "classic", budget: 0, weighed: [], away: [] }), "priya").answer).toBe(
      words('john.why.turn', { whose: "Sam’s" }),
    );
  });

  it("reads a dealt record back, keeping only what it knows", () => {
    const back = readDealt({ ...budget({ waited: 1, moved: "gone", stretched: true }), moved: "gone" });
    expect(back).toMatchObject({ by: "mostRoom", mode: "smart", budget: 4, waited: 1, stretched: true, moved: "gone" });
    expect(readDealt({ ...budget({}), moved: "elsewhere", waited: 0 })).not.toHaveProperty("moved");
    expect(readDealt({ ...budget({}), waited: 0 })).not.toHaveProperty("waited");
  });
});
