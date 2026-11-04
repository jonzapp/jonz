import { tz } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";

import type { LiveStatus } from "./outcome";

/**
 * How times read on screen, in the house's own time zone. Pure: the caller
 * passes `now`, so "tomorrow" means the same thing in a test as on a phone.
 */

/** "Today 21:00", "Tomorrow 07:30", "Thu 21:00", "Mon 6 Oct". */
export function dueLabel(due: Date, now: Date, zone: string): string {
  const inZone = tz(zone);
  const days = differenceInCalendarDays(due, now, { in: inZone });
  const time = format(due, "HH:mm", { in: inZone });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${format(due, "EEE", { in: inZone })} ${time}`;
  return format(due, "EEE d MMM", { in: inZone });
}

/** "today 21:00", "tomorrow 07:30", "Thu 21:00", "Mon 6 Oct": a due label mid-sentence. */
export function dueInLine(due: Date, now: Date, zone: string): string {
  return dueLabel(due, now, zone).replace(/^(Today|Tomorrow|Yesterday)/, (word) => word.toLowerCase());
}

/**
 * When something already past fell due, as short as a line beside a mark
 * needs: the time today, the weekday within the week, the date before that.
 */
export function sinceLabel(at: Date, now: Date, zone: string): string {
  const inZone = tz(zone);
  const days = differenceInCalendarDays(now, at, { in: inZone });
  return format(at, days <= 0 ? "HH:mm" : days < 7 ? "EEE" : "EEE d MMM", { in: inZone });
}

/** "in 3h", "in 2 days", "3h ago" — for the line under a John. */
export function relative(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const body =
    minutes < 60 ? `${Math.max(1, minutes)} min` : hours < 36 ? `${hours}h` : `${days} ${days === 1 ? "day" : "days"}`;
  return ms >= 0 ? `in ${body}` : `${body} ago`;
}

/** "1 pt", "4 pts": a John's effort points as a label. */
export function pointsLabel(points: number): string {
  // A John done together shares its points: to a tenth ("1.3 pts").
  const shown = Math.round(points * 10) / 10;
  return `${shown} ${shown === 1 ? "pt" : "pts"}`;
}

/**
 * A range's two ends, written one way everywhere, as the mockups write it:
 * an en dash with no spaces, "6–12 Oct", "29 Oct–1 Nov".
 */
export function joinRange(first: string, last: string): string {
  return `${first}–${last}`;
}

/** "6–12 Oct", "28 Sep–4 Oct". The end is the last day, not the instant the week ends. */
export function weekRange(startsAt: Date, endsAt: Date, zone: string): string {
  const inZone = tz(zone);
  const last = new Date(endsAt.getTime() - 1);
  const sameMonth = format(startsAt, "MM", { in: inZone }) === format(last, "MM", { in: inZone });
  return sameMonth
    ? joinRange(format(startsAt, "d", { in: inZone }), format(last, "d MMM", { in: inZone }))
    : joinRange(format(startsAt, "d MMM", { in: inZone }), format(last, "d MMM", { in: inZone }));
}

/** "October 2026" from "2026-10". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(Date.UTC(y, m - 1, 15)), "MMMM yyyy");
}

export const STATUS_LABEL: Record<LiveStatus, string> = {
  upcoming: "Upcoming",
  "due-soon": "Due soon",
  overdue: "Overdue",
  checking: "Done, being checked",
  disputed: "Disputed",
  done: "Done",
  late: "Done late",
  missed: "Missed",
  excused: "Skipped",
  covered: "Covered by a housemate",
};

/** How loud a status is: nothing, a quiet outline, the done green, or hazard. */
export type StatusTone = "none" | "quiet" | "good" | "hazard";

/** The icon a status wears, named for what it shows (each app maps it to a lucide icon). */
export type StatusIcon = "clock" | "check" | "triangle" | "x" | "flag" | "shield";

export interface StatusMark {
  tone: StatusTone;
  icon: StatusIcon | null;
  /** Sentence case: a chip sets it in caps by style. */
  label: string;
}

/**
 * Focus's one status map, for Today, Week, the John sheet and the Wall alike:
 * upcoming shows nothing (its time is in the meta line), hazard only for
 * what is late, overdue, missed, covered or disputed, green only for done, and every
 * mark that shows carries an icon and a word.
 */
export const STATUS_MARK: Record<LiveStatus, StatusMark> = {
  upcoming: { tone: "none", icon: null, label: "Upcoming" },
  "due-soon": { tone: "quiet", icon: "clock", label: "Due soon" },
  checking: { tone: "quiet", icon: "check", label: "Checking" },
  done: { tone: "good", icon: "check", label: "Done" },
  late: { tone: "hazard", icon: "clock", label: "Late" },
  overdue: { tone: "hazard", icon: "triangle", label: "Overdue" },
  missed: { tone: "hazard", icon: "x", label: "Missed" },
  disputed: { tone: "hazard", icon: "flag", label: "Disputed" },
  excused: { tone: "quiet", icon: "shield", label: "Skipped" },
  // Done, but not by the person it was dealt to: for them it counts as missed.
  covered: { tone: "hazard", icon: "x", label: "Covered" },
};

/** "Sun 25 Oct": a day in the house's zone, as a title bar shows today's date. */
export function dayLabel(at: Date, zone: string): string {
  return format(at, "EEE d MMM", { in: tz(zone) });
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
export function dateRange(from: string, to: string): string {
  const day = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd, 12));
  };
  const a = day(from);
  const b = day(to);
  const utc = tz("UTC");
  if (from === to) return format(a, "EEE d MMM", { in: utc });
  if (format(a, "yyyy-MM", { in: utc }) === format(b, "yyyy-MM", { in: utc })) {
    return joinRange(format(a, "d", { in: utc }), format(b, "d MMM", { in: utc }));
  }
  return joinRange(format(a, "d MMM", { in: utc }), format(b, "d MMM", { in: utc }));
}

/** A balance against your share: "+3.5", "−9", "level". */
export function formatBalance(points: number): string {
  const rounded = Math.round(points * 2) / 2;
  if (rounded === 0) return "level";
  const body = Math.abs(rounded).toString();
  return rounded > 0 ? `+${body}` : `−${body}`;
}
