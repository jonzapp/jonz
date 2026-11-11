import { dateRange } from "./format";
import { monthWord } from "./house-page";
import { monthOf } from "./week";
import type { Words } from "./words-for";

/**
 * Rules' Who lives here (docs/specs/family-houses.md, "Switching a house"):
 * a house with money in it becomes a family on the 1st of next month, once
 * this month is settled up; one without changes at once.
 */

/** Whether a switch to a family waits for the 1st: the house has a stake or forfeits. */
export function familyWaits(rules: { stakeMinor: number; lateForfeitMinor: number; missedForfeitMinor: number }): boolean {
  return rules.stakeMinor > 0 || rules.lateForfeitMinor > 0 || rules.missedForfeitMinor > 0;
}

/** The 1st of next month in the house's time zone, as `yyyy-MM-dd`. */
export function nextFirst(now: Date, zone: string): string {
  const [y, m] = monthOf(now, zone).split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** A switch's day in words, and the month settled up before it: "Tue 1 Dec", "November". */
export function switchWords(on: string, words: Words): { day: string; month: string } {
  const [y, m] = on.split("-").map(Number);
  const before = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { day: dateRange(on, on, words), month: monthWord(before, words) };
}
