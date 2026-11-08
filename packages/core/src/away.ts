import type { Database } from "./db-types";
import type { IsoDow } from "./domain";
import { dateRange } from "./format";
import { addDaysTo } from "./week";

/**
 * Time away, as the house's local calendar dates. A period runs from its
 * first away day to its last, inclusive; dates are `yyyy-MM-dd`, which
 * compare correctly as strings. Pure, and every function takes "today".
 *
 * The rules that make time away fair live elsewhere: deal.ts never hands
 * someone a John due on an away day but keeps counting their share, and
 * set_away (supabase/migrations) makes the Johns they already have due
 * before they go.
 */

export interface AwayPeriod {
  id: string;
  userId: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
}

/** Whether someone is away on a local date. */
export function awayOn(periods: readonly AwayPeriod[], userId: string, date: string): boolean {
  return periods.some((p) => p.userId === userId && p.startsOn <= date && date <= p.endsOn);
}

/** The trips that cover a local date, the one that began first first: who is away that day. */
export function tripsOn(periods: readonly AwayPeriod[], date: string): AwayPeriod[] {
  return periods
    .filter((p) => p.startsOn <= date && date <= p.endsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** The day someone is home again from a trip: the day after its last. */
export function backOn(period: Pick<AwayPeriod, "endsOn">): string {
  return addDaysTo(period.endsOn, 1);
}

/** The local dates from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysTo(d, 1)) out.push(d);
  return out;
}

/** The days of a span someone is away, in order. */
export function awayDays(periods: readonly AwayPeriod[], userId: string, from: string, to: string): string[] {
  return datesBetween(from, to).filter((d) => awayOn(periods, userId, d));
}

/**
 * Who can be on call for an on-call John this week: its sharers who are home
 * for most of it (at least four of its seven days). A flag raised on a day
 * the holder is away goes to whoever is home then (open_flag decides).
 */
export function homeForWeek(
  periods: readonly AwayPeriod[],
  sharers: readonly string[],
  startsOn: string,
  lastDay: string,
): string[] {
  const days = datesBetween(startsOn, lastDay).length;
  return sharers.filter((id) => awayDays(periods, id, startsOn, lastDay).length * 2 < days);
}

/** Someone's period that covers today, or else their next one. */
export function currentOrNext(periods: readonly AwayPeriod[], userId: string, today: string): AwayPeriod | null {
  return (
    periods
      .filter((p) => p.userId === userId && p.endsOn >= today)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null
  );
}

/** What a period still covers from today: all of it if it hasn't started, the rest if it has. */
export function remaining(period: AwayPeriod, today: string): { from: string; to: string } | null {
  if (period.endsOn < today) return null;
  return { from: period.startsOn > today ? period.startsOn : today, to: period.endsOn };
}

/** A period from its `away` row. */
export function awayPeriod(
  row: Pick<Database["public"]["Tables"]["away_periods"]["Row"], "id" | "user_id" | "starts_on" | "ends_on" | "note">,
): AwayPeriod {
  return { id: row.id, userId: row.user_id, startsOn: row.starts_on, endsOn: row.ends_on, note: row.note };
}

/** The ISO day of the week (1 Monday … 7 Sunday) of a local date. */
export function isoDayOf(date: string): IsoDow {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (day === 0 ? 7 : day) as IsoDow;
}

/** What Week says under someone away this week: "Away all week", "Away 21–23 Oct", or nothing. */
export function awayThisWeek(periods: readonly AwayPeriod[], userId: string, weekStartsOn: string): string | null {
  const days = awayDays(periods, userId, weekStartsOn, addDaysTo(weekStartsOn, 6));
  if (days.length === 0) return null;
  return days.length === 7 ? "Away all week" : `Away ${dateRange(days[0], days[days.length - 1])}`;
}

/** The month after (or, with -1, before) a `yyyy-MM` month. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
