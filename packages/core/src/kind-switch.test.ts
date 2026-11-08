import { describe, expect, it } from "vitest";

import { familyWaits, nextFirst, switchWords } from "./kind-switch";

describe("switching a house to a family", () => {
  it("waits for the 1st only when there's money in it", () => {
    expect(familyWaits({ stakeMinor: 2000, lateForfeitMinor: 100, missedForfeitMinor: 300 })).toBe(true);
    expect(familyWaits({ stakeMinor: 0, lateForfeitMinor: 100, missedForfeitMinor: 0 })).toBe(true);
    expect(familyWaits({ stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 })).toBe(false);
  });

  it("finds the 1st of next month in the house's own time zone", () => {
    // 23:30 on 30 Nov in London is already 1 Dec in Auckland.
    const at = new Date("2026-11-30T23:30:00Z");
    expect(nextFirst(at, "Europe/London")).toBe("2026-12-01");
    expect(nextFirst(at, "Pacific/Auckland")).toBe("2027-01-01");
    expect(nextFirst(new Date("2026-12-15T12:00:00Z"), "Europe/London")).toBe("2027-01-01");
  });

  it("says the day and the month settled up before it", () => {
    expect(switchWords("2026-12-01")).toEqual({ day: "Tue 1 Dec", month: "November" });
    expect(switchWords("2027-01-01")).toEqual({ day: "Fri 1 Jan", month: "December" });
  });
});
