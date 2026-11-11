import { describe, expect, it } from "vitest";

import { myPrefsOf, NO_PREFS, planChoices, planLabel, plannable, prefsLine, withRather } from "./steady-prefs";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const LONDON = "Europe/London";
// Wednesday 7 Oct 2026, 10:00 BST.
const now = new Date("2026-10-07T09:00:00Z");
// Saturday 10 Oct, 11:00 BST.
const due = new Date("2026-10-10T10:00:00Z");

describe("myPrefsOf", () => {
  it("reads a member's row, in order, anything unknown left out", () => {
    expect(myPrefsOf({ suits_days: [6, 3, 4, 3, 9], best_time: "morning", rather: { a: 1, b: -1, c: 0, d: "yes" } })).toEqual({
      days: [3, 4, 6],
      bestTime: "morning",
      rather: { a: 1, b: -1 },
    });
  });

  it("is no preferences for an empty or odd row", () => {
    expect(myPrefsOf({})).toEqual(NO_PREFS);
    expect(myPrefsOf({ suits_days: null, best_time: "midnight", rather: [1, -1] })).toEqual(NO_PREFS);
  });
});

describe("withRather", () => {
  it("sets one John, and no preference takes it off", () => {
    const prefs = withRather(withRather(NO_PREFS, "a", 1), "b", -1);
    expect(prefs.rather).toEqual({ a: 1, b: -1 });
    expect(withRather(prefs, "a", 0).rather).toEqual({ b: -1 });
    expect(NO_PREFS.rather).toEqual({});
  });
});

describe("prefsLine", () => {
  it("says the days and the time", () => {
    expect(prefsLine({ days: [3, 4, 6], bestTime: "morning", rather: {} }, words)).toBe("Wed, Thu, Sat, mornings");
    expect(prefsLine({ days: [], bestTime: "evening", rather: {} }, words)).toBe("Evenings");
    expect(prefsLine({ days: [7], bestTime: null, rather: {} }, words)).toBe("Sun");
  });

  it("says Johns when only Johns are picked, and no preferences when nothing is", () => {
    expect(prefsLine({ days: [], bestTime: null, rather: { a: -1 } }, words)).toBe("Johns");
    expect(prefsLine(NO_PREFS, words)).toBe("No preferences");
  });
});

describe("planChoices", () => {
  it("offers each day until it's due, with the times still to come", () => {
    const plan = planChoices(due, now, LONDON, "morning", words)!;
    expect(plan.days.map((d) => d.label)).toEqual(["Wed", "Thu", "Fri", "Sat"]);
    // 09:00 has gone today; on Saturday only the morning is before 11:00.
    expect(plan.days[0].times.map((t) => t.label)).toEqual(["14:00", "19:00"]);
    expect(plan.days[1].times.map((t) => t.label)).toEqual(["09:00", "14:00", "19:00"]);
    expect(plan.days[3].times.map((t) => t.label)).toEqual(["09:00"]);
    expect(plan.dueWords).toBe("Sat 11:00");
  });

  it("chooses your best time on the latest day it fits, and says so", () => {
    const plan = planChoices(due, now, LONDON, "morning", words)!;
    expect(plan.chosen.at.toISOString()).toBe("2026-10-10T08:00:00.000Z");
    expect(plan.days[1].times[0].meta).toBe("Your best time: morning");
    expect(plan.days[1].times[1].meta).toBe("Afternoon");
  });

  it("chooses the evening when you haven't said a best time", () => {
    const plan = planChoices(due, now, LONDON, null, words)!;
    // Friday 19:00 BST: Saturday has no evening before it's due.
    expect(plan.chosen.at.toISOString()).toBe("2026-10-09T18:00:00.000Z");
    expect(plan.days.flatMap((d) => d.times).every((t) => !t.meta.startsWith("Your"))).toBe(true);
  });

  it("chooses the latest time there is when the best time never fits", () => {
    // Due Thursday 13:00: no evening left.
    const plan = planChoices(new Date("2026-10-08T12:00:00Z"), new Date("2026-10-07T19:00:00Z"), LONDON, "evening", words)!;
    expect(plan.days.map((d) => d.label)).toEqual(["Thu"]);
    expect(plan.chosen.label).toBe("09:00");
  });

  it("keeps local hours across the clocks going back", () => {
    // Friday 23 Oct, 10:00 BST; due Monday 26 Oct 11:00 GMT. Clocks go back on Sunday 25th.
    const plan = planChoices(new Date("2026-10-26T11:00:00Z"), new Date("2026-10-23T09:00:00Z"), LONDON, "morning", words)!;
    const mornings = plan.days.map((d) => d.times.find((t) => t.label === "09:00")?.at.toISOString());
    expect(mornings).toEqual([undefined, "2026-10-24T08:00:00.000Z", "2026-10-25T09:00:00.000Z", "2026-10-26T09:00:00.000Z"]);
  });

  it("is null when there's no time left before it's due", () => {
    expect(planChoices(due, new Date("2026-10-10T09:30:00Z"), LONDON, "morning", words)).toBeNull();
    expect(planChoices(due, new Date("2026-10-11T09:00:00Z"), LONDON, null, words)).toBeNull();
  });

  it("offers at most eight days", () => {
    const plan = planChoices(new Date("2026-10-30T10:00:00Z"), now, LONDON, null, words)!;
    expect(plan.days).toHaveLength(8);
  });
});

describe("plannable", () => {
  it("is your own John still to do and not late, never a flag", () => {
    const item = { userId: "me", status: "upcoming" as const, flaggedAt: null };
    expect(plannable(item, "me")).toBe(true);
    expect(plannable({ ...item, status: "due-soon" }, "me")).toBe(true);
    expect(plannable(item, "ada")).toBe(false);
    expect(plannable({ ...item, status: "overdue" }, "me")).toBe(false);
    expect(plannable({ ...item, status: "checking" }, "me")).toBe(false);
    expect(plannable({ ...item, flaggedAt: now }, "me")).toBe(false);
  });
});

describe("planLabel", () => {
  it("says a plan the way a John says its time", () => {
    expect(planLabel(new Date("2026-10-08T07:30:00Z"), now, LONDON, words)).toBe("Tomorrow 08:30");
    expect(planLabel(new Date("2026-10-07T18:00:00Z"), now, LONDON, words)).toBe("Today 19:00");
  });
});
