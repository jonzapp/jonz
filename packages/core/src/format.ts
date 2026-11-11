import { tz } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";

import type { LiveStatus } from "./outcome";
import type { Words } from "./words-for";

/**
 * How times read on screen, in the house's own time zone and the reader's
 * language. Pure: the caller passes `now`, so "tomorrow" means the same thing
 * in a test as on a phone. Each date's shape is a line in the words files
 * (`common.date.pattern.*`), so a language can put the day before the month.
 */

type Pattern =
  | "time"
  | "timeSeconds"
  | "weekday"
  | "weekdayLong"
  | "weekdayTiny"
  | "weekdayNarrow"
  | "day"
  | "dayMonth"
  | "dayMonthLong"
  | "dayMonthYear"
  | "dayMonthLongYear"
  | "weekdayDayMonth"
  | "weekdayDayMonthYear"
  | "weekdayLongDayMonthLong"
  | "month"
  | "monthShort"
  | "monthYear";

/** `at` in one of the words files' date shapes, in `zone`, with the reader's day and month names. */
export function dateIn(at: Date, pattern: Pattern, zone: string, words: Words): string {
  return format(at, words(`common.date.pattern.${pattern}`), { in: tz(zone), locale: words.dates });
}

/** A local `yyyy-MM-dd` date in one of the words files' shapes: the same day in every time zone. */
export function localDay(date: string, pattern: Pattern, words: Words): string {
  const [y, m, d] = date.split("-").map(Number);
  return dateIn(new Date(Date.UTC(y, m - 1, d, 12)), pattern, "UTC", words);
}

const WEEKDAY_WIDTH = { long: "weekdayLong", short: "weekday", tiny: "weekdayTiny", narrow: "weekdayNarrow" } as const;

/**
 * A day of the week (1 = Monday … 7 = Sunday) in the reader's language:
 * "Monday", "Mon" when short, "Mo" tiny (a row of day chips), "M" narrow
 * (a calendar's heading).
 */
export function weekdayName(dow: number, words: Words, width: keyof typeof WEEKDAY_WIDTH = "long"): string {
  // 1 January 2024 was a Monday.
  return dateIn(new Date(Date.UTC(2024, 0, dow, 12)), WEEKDAY_WIDTH[width], "UTC", words);
}

/** A month (0 = January) in the reader's language: "November", or "Nov" when short. */
export function monthNameOf(index: number, words: Words, short = false): string {
  return dateIn(new Date(Date.UTC(2024, ((index % 12) + 12) % 12, 15, 12)), short ? "monthShort" : "month", "UTC", words);
}

/** "Today 21:00", "Tomorrow 07:30", "Thu 21:00", "Mon 6 Oct". */
export function dueLabel(due: Date, now: Date, zone: string, words: Words): string {
  return dueSaid(due, now, zone, words, false);
}

/** "today 21:00", "tomorrow 07:30", "Thu 21:00", "Mon 6 Oct": a due label mid-sentence. */
export function dueInLine(due: Date, now: Date, zone: string, words: Words): string {
  return dueSaid(due, now, zone, words, true);
}

function dueSaid(due: Date, now: Date, zone: string, words: Words, inLine: boolean): string {
  const days = differenceInCalendarDays(due, now, { in: tz(zone) });
  const time = dateIn(due, "time", zone, words);
  const near = days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday" : null;
  if (near) return words(inLine ? `common.date.inLine.${near}` : `common.date.${near}`, { time });
  if (days > 1 && days < 7) return words("common.date.weekdayTime", { day: dateIn(due, "weekday", zone, words), time });
  return dateIn(due, "weekdayDayMonth", zone, words);
}

/**
 * When something already past fell due, as short as a line beside a mark
 * needs: the time today, the weekday within the week, the date before that.
 */
export function sinceLabel(at: Date, now: Date, zone: string, words: Words): string {
  const days = differenceInCalendarDays(now, at, { in: tz(zone) });
  return dateIn(at, days <= 0 ? "time" : days < 7 ? "weekday" : "weekdayDayMonth", zone, words);
}

/** "in 3h", "in 2 days", "3h ago" — for the line under a John. */
export function relative(target: Date, now: Date, words: Words): string {
  const ms = target.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span =
    minutes < 60
      ? words("common.date.minutes", { n: Math.max(1, minutes) })
      : hours < 36
        ? words("common.date.hours", { n: hours })
        : words("common.date.days", { n: days });
  return words(ms >= 0 ? "common.date.in" : "common.date.ago", { span });
}

/** "1 pt", "4 pts": a John's effort points as a label. */
export function pointsLabel(points: number, words: Words): string {
  // A John done together shares its points: to a tenth ("1.3 pts").
  return words("common.points", { n: Math.round(points * 10) / 10 });
}

/**
 * A range's two ends, written one way everywhere, as the mockups write it:
 * an en dash with no spaces, "6–12 Oct", "29 Oct–1 Nov".
 */
export function joinRange(first: string, last: string, words: Words): string {
  return words("common.date.range", { first, last });
}

/** "6–12 Oct", "28 Sep–4 Oct". The end is the last day, not the instant the week ends. */
export function weekRange(startsAt: Date, endsAt: Date, zone: string, words: Words): string {
  const last = new Date(endsAt.getTime() - 1);
  const sameMonth = format(startsAt, "MM", { in: tz(zone) }) === format(last, "MM", { in: tz(zone) });
  return joinRange(dateIn(startsAt, sameMonth ? "day" : "dayMonth", zone, words), dateIn(last, "dayMonth", zone, words), words);
}

/** "October 2026" from "2026-10". */
export function monthLabel(month: string, words: Words): string {
  const [y, m] = month.split("-").map(Number);
  return dateIn(new Date(Date.UTC(y, m - 1, 15)), "monthYear", "UTC", words);
}

/** A status as a sentence says it: "Done, being checked", "Covered by someone else". */
export function statusLabel(status: LiveStatus, words: Words): string {
  return words(`common.status.${status}`);
}

/** A status as its mark's one word says it: "Checking", "Covered". Sentence case: a chip sets it in caps by style. */
export function statusWord(status: LiveStatus, words: Words): string {
  return words(`common.statusMark.${status}`);
}

/** How loud a status is: nothing, a quiet outline, the done green, or hazard. */
export type StatusTone = "none" | "quiet" | "good" | "hazard";

/** The icon a status wears, named for what it shows (each app maps it to a lucide icon). */
export type StatusIcon = "clock" | "check" | "triangle" | "x" | "flag" | "shield";

export interface StatusMark {
  tone: StatusTone;
  icon: StatusIcon | null;
}

/**
 * Focus's one status map, for Today, Week, the John sheet and the Wall alike:
 * upcoming shows nothing (its time is in the meta line), hazard only for
 * what is late, overdue, missed, covered or disputed, green only for done, and every
 * mark that shows carries an icon and a word (`statusWord`).
 */
export const STATUS_MARK: Record<LiveStatus, StatusMark> = {
  upcoming: { tone: "none", icon: null },
  "due-soon": { tone: "quiet", icon: "clock" },
  checking: { tone: "quiet", icon: "check" },
  done: { tone: "good", icon: "check" },
  late: { tone: "hazard", icon: "clock" },
  overdue: { tone: "hazard", icon: "triangle" },
  missed: { tone: "hazard", icon: "x" },
  disputed: { tone: "hazard", icon: "flag" },
  excused: { tone: "quiet", icon: "shield" },
  // Done, but not by the person it was dealt to: for them it counts as missed.
  covered: { tone: "hazard", icon: "x" },
};

/** "Sun 25 Oct": a day in the house's zone, as a title bar shows today's date. */
export function dayLabel(at: Date, zone: string, words: Words): string {
  return dateIn(at, "weekdayDayMonth", zone, words);
}

/** First letters of up to two words: "Priya Shah" → "PS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** The longest name a profile holds: `profiles.display_name`'s check. */
export const NAME_MAX = 60;

/**
 * A display name from its parts, as Sign in with Apple hands them over, and
 * only once: given, middle, family. Blank parts drop out, runs of whitespace
 * close up, and it stops at NAME_MAX characters (code points, as Postgres
 * counts them). Null when nothing is left, so the caller keeps the name it has.
 */
export function nameFromParts(parts: readonly (string | null | undefined)[]): string | null {
  const name = parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  if (!name) return null;
  return Array.from(name).slice(0, NAME_MAX).join("").trim();
}

/** "Priya" from "Priya Shah": housemates use first names. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "14–21 Oct", "28 Oct–2 Nov", "Fri 16 Oct" for a single day. Local `yyyy-MM-dd` dates. */
export function dateRange(from: string, to: string, words: Words): string {
  if (from === to) return localDay(from, "weekdayDayMonth", words);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return joinRange(localDay(from, sameMonth ? "day" : "dayMonth", words), localDay(to, "dayMonth", words), words);
}

/** A balance against your share: "+3.5", "−9", "level". */
export function formatBalance(points: number, words: Words): string {
  const rounded = Math.round(points * 2) / 2;
  if (rounded === 0) return words("common.balance.level");
  const body = words.intl.formatNumber(Math.abs(rounded), { useGrouping: false });
  return rounded > 0 ? `+${body}` : `−${body}`;
}
