import { describe, expect, it } from "vitest";

import type { JohnDef } from "./board";
import type { SteadyAheadWeek } from "./steady-deal";
import { aheadSections, turnRows, waitingRows, weekLookAhead } from "./steady-week";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const LIST: Pick<JohnDef, "id" | "name" | "category" | "points" | "when" | "crew">[] = [
  { id: "mop", name: "Mopping", category: "floors", points: 3, when: "day", crew: 1 },
  { id: "kitchen", name: "Kitchen", category: "kitchen", points: 2, when: "day", crew: 1 },
  { id: "garbage", name: "Garbage", category: "bins", points: 1, when: "day", crew: 1 },
  { id: "recycling", name: "Recycling", category: "bins", points: 1, when: "day", crew: 1 },
  { id: "dishes", name: "Dishes", category: "kitchen", points: 1, when: "on_call", crew: 1 },
  { id: "garden", name: "Garden", category: "other", points: 2, when: "day", crew: 0 },
];
const AHEAD: SteadyAheadWeek[] = [
  { startsOn: "2026-11-09", johns: { garbage: ["ada"], kitchen: ["me"], dishes: ["ada"], garden: ["me", "ada"] } },
  { startsOn: "2026-11-16", johns: { recycling: ["ada"], mop: ["me"], kitchen: ["ada"] } },
];
const nameOf = (id: string) => ({ me: "Glyn Finck", ada: "Ada Lovelace" })[id] ?? null;

describe("waitingRows", () => {
  it("lists every John waiting, longest first, with when its turn comes", () => {
    const rows = waitingRows(LIST, { waiting: { garbage: 1, recycling: 2, mop: 3 }, ahead: AHEAD.slice(0, 1) });
    expect(rows.map((r) => [r.name, r.meta])).toEqual([
      ["Mopping", "Floors, waiting 3 weeks"],
      ["Recycling", "Bins, waiting 2 weeks"],
      ["Garbage", "Bins, next week"],
    ]);
    expect(waitingRows(LIST, { waiting: { recycling: 1 }, ahead: AHEAD })[0].meta).toBe("Bins, week of 16 Nov");
  });

  it("is nothing when nothing waits", () => {
    expect(waitingRows(LIST, { waiting: {}, ahead: AHEAD })).toEqual([]);
  });
});

describe("turnRows", () => {
  it("says whose turn is next for the Johns not out this week, soonest first", () => {
    const rows = turnRows(LIST, { waiting: {}, ahead: AHEAD }, new Set(["garbage"]), "me", nameOf);
    expect(rows.map((r) => [r.name, r.meta])).toEqual([
      ["Kitchen", "Kitchen, your turn, next week"],
      ["Mopping", "Floors, your turn, week of 16 Nov"],
      ["Recycling", "Bins, Ada’s turn, week of 16 Nov"],
    ]);
  });

  it("leaves out waiting Johns, on call and Johns done together", () => {
    const rows = turnRows(LIST, { waiting: { kitchen: 1 }, ahead: AHEAD }, new Set(), "me", nameOf);
    expect(rows.map((r) => r.johnId)).toEqual(["garbage", "mop", "recycling"]);
  });
});

describe("aheadSections", () => {
  it("lays out Classic's next two weeks, you first", () => {
    const sections = aheadSections(LIST, AHEAD, ["ada", "me"], "me", nameOf, words);
    expect(sections.map((s) => s.label)).toEqual(["Next week", "Week of 16 Nov"]);
    expect(sections[0].people).toEqual([
      { userId: "me", who: "You", johns: ["Kitchen", "Garden"], points: 4 },
      { userId: "ada", who: "Ada", johns: ["Garbage", "Dishes", "Garden"], points: 4 },
    ]);
    expect(sections[1].people.map((p) => [p.who, p.johns])).toEqual([
      ["You", ["Mopping"]],
      ["Ada", ["Recycling", "Kitchen"]],
    ]);
  });

  it("leaves out someone who has left, and anyone with nothing", () => {
    const sections = aheadSections(LIST, [{ startsOn: "2026-11-09", johns: { mop: ["gone"], kitchen: ["ada"] } }], ["ada", "me"], "me", nameOf, words);
    expect(sections[0].people.map((p) => p.who)).toEqual(["Ada"]);
  });
});

describe("weekLookAhead", () => {
  const args = {
    list: LIST,
    state: { waiting: { recycling: 1 }, ahead: AHEAD },
    items: [
      { johnId: "garbage", carried: false },
      { johnId: "kitchen", carried: true },
    ],
    memberIds: ["me", "ada"],
    viewerId: "me",
    nameOf,
    words,
  };

  it("in Smart: the waiting, whose turn next, and the rest still coming up", () => {
    const shown = weekLookAhead({ ...args, mode: "smart" });
    expect(shown.waiting.map((r) => r.johnId)).toEqual(["recycling"]);
    // Kitchen carried from last week isn't out this week.
    expect(shown.turns.map((r) => r.johnId)).toEqual(["kitchen", "mop"]);
    expect(shown.weeks).toEqual([]);
    expect(shown.comingUp.map((j) => j.id)).toEqual(["garbage", "dishes", "garden"]);
  });

  it("in Classic: the next two weeks, and nothing coming up that they name", () => {
    const shown = weekLookAhead({ ...args, mode: "classic" });
    expect(shown.turns).toEqual([]);
    expect(shown.weeks.map((w) => w.label)).toEqual(["Next week", "Week of 16 Nov"]);
    expect(shown.comingUp).toEqual([]);
  });
});
