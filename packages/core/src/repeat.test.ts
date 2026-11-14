import { describe, expect, it } from "vitest";

import {
  comesBack,
  comingUp,
  dateInWeek,
  isLong,
  landsInWeek,
  LAST_OF_MONTH,
  monthIndex,
  monthOfIndex,
  landingLabel,
  monthName,
  nextLandings,
  nextLine,
  previewLandings,
  nextStartsOn,
  oftenWords,
  periodWords,
  repeatColumns,
  startMonths,
  timesAYear,
  weekdayOfMonth,
  type Repeat,
} from "./repeat";
import { weekIndex } from "./week";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const NOV_2026 = monthIndex("2026-11");

/** The fridge deep clean: the first Saturday every 3 months, from November 2026. */
const fridge: Repeat = {
  everyWeeks: 1,
  everyMonths: 3,
  weekOfMonth: 1,
  anchorMonth: NOV_2026,
  anchorWeek: 0,
  dueDow: 6,
};

describe("months and weekdays", () => {
  it("counts months from year 0 and back", () => {
    expect(monthIndex("2026-11-07")).toBe(2026 * 12 + 10);
    expect(monthOfIndex(NOV_2026)).toBe("2026-11");
    expect(monthOfIndex(monthIndex("2027-01"))).toBe("2027-01");
  });

  it("finds a weekday's date in a week, whichever day the week starts", () => {
    expect(dateInWeek("2026-11-02", 1, 6)).toBe("2026-11-07");
    expect(dateInWeek("2026-11-01", 7, 6)).toBe("2026-11-07");
    expect(dateInWeek("2026-11-01", 7, 7)).toBe("2026-11-01");
  });

  it("says which of its weekday a date is, and whether it's the last", () => {
    expect(weekdayOfMonth("2026-11-07")).toEqual({ nth: 1, last: false });
    expect(weekdayOfMonth("2026-11-28")).toEqual({ nth: 4, last: true });
    expect(weekdayOfMonth("2026-10-31")).toEqual({ nth: 5, last: true });
    expect(weekdayOfMonth("2026-10-24")).toEqual({ nth: 4, last: false });
    // A leap February: the 29th is its last Tuesday.
    expect(weekdayOfMonth("2028-02-29")).toEqual({ nth: 5, last: true });
    expect(weekdayOfMonth("2028-02-22")).toEqual({ nth: 4, last: false });
  });
});

describe("landsInWeek", () => {
  it("keeps weekly Johns on their anchor week, as before", () => {
    const a = weekIndex("2026-11-02");
    const weekly: Repeat = { everyWeeks: 2, everyMonths: null, weekOfMonth: null, anchorMonth: null, anchorWeek: a, dueDow: 7 };
    expect(landsInWeek(weekly, "2026-11-02", 1)).toBe(true);
    expect(landsInWeek(weekly, "2026-11-09", 1)).toBe(false);
    expect(landsInWeek({ ...weekly, everyWeeks: 26 }, "2027-05-03", 1)).toBe(true);
  });

  it("deals a quarterly John in the week of its first Saturday, every third month", () => {
    expect(landsInWeek(fridge, "2026-11-02", 1)).toBe(true);
    expect(landsInWeek(fridge, "2026-11-09", 1)).toBe(false);
    expect(landsInWeek(fridge, "2026-12-07", 1)).toBe(false);
    expect(landsInWeek(fridge, "2027-02-01", 1)).toBe(true);
    // Weeks that start on Sunday hold the same Saturday.
    expect(landsInWeek(fridge, "2026-11-01", 7)).toBe(true);
  });

  it("puts the last of a weekday on the fourth or the fifth, whichever the month has", () => {
    const last: Repeat = { ...fridge, everyMonths: 1, weekOfMonth: LAST_OF_MONTH };
    expect(landsInWeek(last, "2026-10-26", 1)).toBe(true); // Sat 31 Oct, the fifth
    expect(landsInWeek(last, "2026-10-19", 1)).toBe(false); // Sat 24 Oct, the fourth but not the last
    expect(landsInWeek(last, "2026-11-23", 1)).toBe(true); // Sat 28 Nov, the fourth and the last
  });

  it("lands on the right side of a year end, and in a leap February", () => {
    const sunday: Repeat = { ...fridge, everyMonths: 1, weekOfMonth: 1, dueDow: 7 };
    // The week of Mon 28 Dec 2026 holds Sun 3 Jan 2027: January's first Sunday.
    expect(landsInWeek(sunday, "2026-12-28", 1)).toBe(true);
    const leap: Repeat = { ...fridge, everyMonths: 12, weekOfMonth: LAST_OF_MONTH, anchorMonth: monthIndex("2028-02"), dueDow: 2 };
    expect(landsInWeek(leap, "2028-02-28", 1)).toBe(true);
    expect(landsInWeek(leap, "2029-02-26", 1)).toBe(true); // Tue 27 Feb 2029
    expect(landsInWeek(leap, "2028-03-27", 1)).toBe(false);
  });

  it("repeats yearly in the same month, years before or after its anchor", () => {
    const gutters: Repeat = { ...fridge, everyMonths: 12, weekOfMonth: 3, anchorMonth: NOV_2026 };
    expect(nextLandings(gutters, "2026-11-02", 1, 3)).toEqual(["2026-11-21", "2027-11-20", "2028-11-18"]);
    expect(landsInWeek(gutters, "2025-11-10", 1)).toBe(true);
  });
});

describe("nextLandings and startMonths", () => {
  it("lists the next dates a John lands on", () => {
    expect(nextLandings(fridge, "2026-11-02", 1, 4)).toEqual(["2026-11-07", "2027-02-06", "2027-05-01", "2027-08-07"]);
  });

  it("offers each month of the cycle to start from, earliest first", () => {
    const starts = startMonths(fridge, "2026-11-02", 1);
    expect(starts).toEqual([
      { month: NOV_2026, date: "2026-11-07" },
      { month: NOV_2026 + 1, date: "2026-12-05" },
      { month: NOV_2026 + 2, date: "2027-01-02" },
    ]);
    expect(startMonths({ ...fridge, everyMonths: 24 }, "2026-11-02", 1)).toHaveLength(12);
    expect(startMonths({ ...fridge, everyMonths: null, weekOfMonth: null }, "2026-11-02", 1)).toEqual([]);
  });

  it("starts a John whose date this month has gone from next month", () => {
    // From the week of 9 Nov, the first Saturday of November has passed.
    expect(startMonths(fridge, "2026-11-09", 1)[0]).toEqual({ month: NOV_2026 + 1, date: "2026-12-05" });
  });
});

describe("repeatColumns", () => {
  const now = new Date("2026-10-29T17:00:00Z"); // Thursday; next week starts Mon 2 Nov
  it("starts a new monthly John from its first month after this week", () => {
    expect(nextStartsOn(now, "Europe/London", 1)).toBe("2026-11-02");
    expect(repeatColumns({ ...fridge, anchorMonth: null }, now, "Europe/London", 1)).toEqual({
      every_weeks: 1,
      every_months: 3,
      week_of_month: 1,
      anchor_month: NOV_2026,
    });
  });

  it("keeps the month it had, and clears the months for a weekly John", () => {
    expect(repeatColumns({ ...fridge, anchorMonth: NOV_2026 + 2 }, now, "Europe/London", 1).anchor_month).toBe(NOV_2026 + 2);
    expect(repeatColumns({ ...fridge, everyWeeks: 2, everyMonths: null, weekOfMonth: null }, now, "Europe/London", 1)).toEqual({
      every_weeks: 2,
      every_months: null,
      week_of_month: null,
      anchor_month: null,
    });
  });
});

describe("long Johns", () => {
  it("counts every 4 weeks or less often as long", () => {
    expect(isLong({ everyWeeks: 3, everyMonths: null })).toBe(false);
    expect(isLong({ everyWeeks: 4, everyMonths: null })).toBe(true);
    expect(isLong({ everyWeeks: 1, everyMonths: 1 })).toBe(true);
  });

  it("brings one back only after a recent miss", () => {
    const week = new Date("2026-11-09T00:00:00Z");
    expect(comesBack({ outcome: "missed", dueAt: new Date("2026-11-07T21:00:00Z") }, week)).toBe(true);
    expect(comesBack({ outcome: "missed", dueAt: new Date("2026-10-26T21:00:00Z") }, week)).toBe(true);
    expect(comesBack({ outcome: "missed", dueAt: new Date("2026-10-20T21:00:00Z") }, week)).toBe(false);
    expect(comesBack({ outcome: "covered", dueAt: new Date("2026-11-07T21:00:00Z") }, week)).toBe(false);
    expect(comesBack({ outcome: null, dueAt: new Date("2026-11-07T21:00:00Z") }, week)).toBe(false);
    expect(comesBack(undefined, week)).toBe(false);
  });
});

describe("words", () => {
  it("says the period the way people do", () => {
    expect(periodWords({ everyWeeks: 1, everyMonths: null })).toBe("week");
    expect(periodWords({ everyWeeks: 2, everyMonths: null })).toBe("2 weeks");
    expect(periodWords({ everyWeeks: 1, everyMonths: 1 })).toBe("month");
    expect(periodWords({ everyWeeks: 1, everyMonths: 3 })).toBe("3 months");
    expect(periodWords({ everyWeeks: 1, everyMonths: 12 })).toBe("year");
    expect(periodWords({ everyWeeks: 1, everyMonths: 24 })).toBe("2 years");
    expect(oftenWords({ everyWeeks: 1, everyMonths: 6 }, words)).toBe("Twice a year");
    expect(oftenWords({ everyWeeks: 1, everyMonths: 3 }, words)).toBe("Every 3 months");
  });

  it("counts how many times a year it comes round", () => {
    expect(timesAYear({ everyWeeks: 1, everyMonths: 3 })).toBe(4);
    expect(timesAYear({ everyWeeks: 2, everyMonths: null })).toBeCloseTo(26.09, 2);
  });
});

describe("previewLandings and nextLine", () => {
  const now = new Date("2026-10-29T17:00:00Z");
  it("previews a new quarterly John from its first Saturday after this week", () => {
    const dates = previewLandings({ ...fridge, anchorMonth: null }, now, "Europe/London", 1, 4);
    expect(dates).toEqual(["2026-11-07", "2027-02-06", "2027-05-01", "2027-08-07"]);
    expect(nextLine(dates, words)).toBe("Next: Sat 7 Nov, then 6 Feb, 1 May, 7 Aug");
  });

  it("previews a new fortnightly John from this week, as saving it does", () => {
    const dates = previewLandings({ everyWeeks: 2, everyMonths: null, weekOfMonth: null, anchorMonth: null, dueDow: 7 }, now, "Europe/London", 1, 2);
    // This week (from Mon 26 Oct) is its first, so next week's is skipped: Sun 15 Nov, then 29 Nov.
    expect(dates).toEqual(["2026-11-15", "2026-11-29"]);
    expect(nextLine([], words)).toBeNull();
  });

  it("names months and dates", () => {
    expect(monthName(NOV_2026, words)).toBe("November");
    expect(landingLabel("2027-02-06", words, { day: true, year: true })).toBe("Sat 6 Feb 2027");
  });
});

describe("comingUp", () => {
  const base = { name: "", points: 8, when: "day" as const };
  it("lists long Johns landing in the next four weeks, soonest first, and nothing else", () => {
    const johns = [
      { ...base, ...fridge, id: "fridge", name: "Fridge deep clean" },
      { ...base, ...fridge, id: "gutters", name: "Clear the gutters", everyMonths: 12, weekOfMonth: 3, points: 15 },
      { ...base, ...fridge, id: "later", name: "Oven", everyMonths: 12, anchorMonth: monthIndex("2027-03") },
      { ...base, id: "bins", name: "Bins", everyWeeks: 1, everyMonths: null, weekOfMonth: null, anchorMonth: null, anchorWeek: 0, dueDow: 7 as const },
      { ...base, ...fridge, id: "call", name: "On call", when: "on_call" as const },
    ];
    // This week starts Mon 26 Oct; the four after it run to Sun 29 Nov.
    expect(comingUp(johns, "2026-10-26", 1, words)).toEqual([
      { johnId: "fridge", name: "Fridge deep clean", points: 8, date: "2026-11-07", meta: "Sat 7 Nov, every 3 months" },
      { johnId: "gutters", name: "Clear the gutters", points: 15, date: "2026-11-21", meta: "Sat 21 Nov, every year" },
    ]);
  });

  it("includes an every-4-weeks John, from its anchor week", () => {
    const a = weekIndex("2026-10-26");
    const john = { ...base, id: "w", name: "Descale", everyWeeks: 4, everyMonths: null, weekOfMonth: null, anchorMonth: null, anchorWeek: a, dueDow: 6 as const };
    expect(comingUp([john], "2026-10-26", 1, words).map((c) => c.date)).toEqual(["2026-11-28"]);
  });
});
