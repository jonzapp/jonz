import { describe, expect, it } from "vitest";

import { NEW_JOHN } from "./board";
import { budgetChoices, comesRound, type BudgetJohn } from "./steady-budget";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const john = (id: string, points: number, over: Partial<BudgetJohn> = {}): BudgetJohn => ({ ...NEW_JOHN, id, points, ...over });

// The design's two-person list: about 9 points a week.
const LIST = [
  john("mopping", 3),
  john("garbage", 1, { dueDow: 4 }),
  john("sweeping", 2, { dueDow: 3 }),
  john("kitchen", 2, { dueDow: 3 }),
  john("recycling", 1, { dueDow: 4 }),
];
const TWO = ["ava", "ben"];

describe("comesRound", () => {
  it("says how often each John comes round, less often on a smaller budget", () => {
    const light = comesRound(LIST, TWO, {}, "smart", 2);
    const busy = comesRound(LIST, TWO, {}, "smart", 6);
    for (const j of LIST) {
      expect(busy.gaps.get(j.id)).toBeCloseTo(1);
      expect(light.gaps.get(j.id)!).toBeGreaterThan(1.5);
    }
    expect(light.each).toBeGreaterThanOrEqual(1);
    expect(light.each).toBeLessThan(busy.each);
  });

  it("always deals a John that keeps its day, and counts on call at its calls a week", () => {
    const bins = john("bins", 1, { keepDay: true, dueDow: 2 });
    expect(comesRound([...LIST, bins], TWO, {}, "smart", 2).gaps.get("bins")).toBeCloseTo(1);
    // On call seven times a week is seven points, so on Light it's someone's one John when it's dealt.
    const dishes = john("dishes", 1, { when: "on_call", perWeek: 7 });
    const light = comesRound([...LIST, dishes], TWO, {}, "smart", 2);
    expect(light.gaps.get("dishes")!).toBeLessThan(Infinity);
    expect(light.each).toBeLessThan(comesRound(LIST, TWO, {}, "smart", 2).each + 0.01);
  });

  it("hands a group's John only to the group", () => {
    const list = [john("upstairs", 2, { groupId: "g" })];
    expect(comesRound(list, ["ava", "ben", "cal"], { g: ["cal"] }, "smart", 2).gaps.get("upstairs")).toBeCloseTo(1);
  });
});

describe("budgetChoices", () => {
  it("offers Light, Usual, Busy and no limit, each saying what it does to this list", () => {
    const { choices, need, tooLong } = budgetChoices(LIST, TWO, {}, "smart", words);
    expect(choices.map((c) => c.budget)).toEqual([2, 4, 6, 0]);
    expect(choices.map((c) => c.label)).toEqual(["Light, 2 points", "Usual, 4 points", "Busy, 6 points", "No limit"]);
    expect(choices[0].effect).toMatch(/^About one John each\. Each comes round every 2( to 3)? weeks\.$/);
    expect(choices[2].effect).toBe(`${words('week.steady.johnsEach', { n: 3 })} ${words('week.steady.everyWeek')}`);
    expect(choices[3].effect).toBe(words('week.steady.noLimit'));
    expect(need).toBeCloseTo(4.5);
    expect(tooLong).toBe(false);
  });

  it("suggests the smallest budget that keeps every John within three times its schedule", () => {
    expect(budgetChoices(LIST, TWO, {}, "smart", words).choices.filter((c) => c.suggested).map((c) => c.budget)).toEqual([2]);
    // Twice the list for the same two: Light would leave weekly Johns four weeks apart.
    const long = [...LIST, ...LIST.map((j) => ({ ...j, id: `${j.id}-2` }))];
    const { choices } = budgetChoices(long, TWO, {}, "smart", words);
    expect(choices.find((c) => c.suggested)!.budget).toBeGreaterThan(2);
  });

  it("says when even Busy can't keep up, and how much the list asks", () => {
    const huge = Array.from({ length: 16 }, (_, i) => john(`j${i}`, 5, { dueDow: ((i % 7) + 1) as BudgetJohn["dueDow"] }));
    const { choices, need, tooLong } = budgetChoices(huge, TWO, {}, "smart", words);
    expect(tooLong).toBe(true);
    expect(need).toBeCloseTo(40);
    expect(choices.find((c) => c.suggested)!.budget).toBe(6);
    expect(words('week.steady.tooLong', { need })).toContain("about 40 points a week each");
  });

  it("works for a house of one, and in Classic", () => {
    const { choices } = budgetChoices(LIST.slice(0, 2), ["ava"], {}, "classic", words);
    expect(choices.filter((c) => c.suggested)).toHaveLength(1);
  });
});
