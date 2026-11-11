/**
 * Each person's preferences (members.suits_days, best_time, rather), as the
 * Preferences page and the deal read them, and Plan it's choices: the days
 * left before a John is due and the times on each, your best time chosen
 * already. Pure: every function takes `now`.
 */
import { TZDate } from "@date-fns/tz";
import { set } from "date-fns";

import type { BoardItem } from "./board";
import type { Json } from "./db-types";
import { BEST_TIME_HOUR, BEST_TIMES, type BestTime, type IsoDow } from "./domain";
import { dateIn, dueLabel, weekdayName } from "./format";
import { addDaysTo, localDate } from "./week";
import type { Words } from "./words-for";

export interface MyPrefs {
  /** Days that suit me, ISO weekdays in order; none is any day. */
  days: IsoDow[];
  bestTime: BestTime | null;
  /** John id → 1 rather do, −1 rather not. */
  rather: Record<string, 1 | -1>;
}

export const NO_PREFS: MyPrefs = { days: [], bestTime: null, rather: {} };

/** A member's preferences from their row, anything unknown left out. */
export function myPrefsOf(row: { suits_days?: number[] | null; best_time?: string | null; rather?: Json | null }): MyPrefs {
  const rather: Record<string, 1 | -1> = {};
  const r = row.rather;
  if (r && typeof r === "object" && !Array.isArray(r)) {
    for (const [id, v] of Object.entries(r)) if (v === 1 || v === -1) rather[id] = v;
  }
  return {
    days: [...new Set(row.suits_days ?? [])].filter((d): d is IsoDow => d >= 1 && d <= 7).sort((a, b) => a - b),
    bestTime: (BEST_TIMES as readonly string[]).includes(row.best_time ?? "") ? (row.best_time as BestTime) : null,
    rather,
  };
}

/** Your preferences with one John set to rather do (1), rather not (−1) or no preference (0). */
export function withRather(prefs: MyPrefs, johnId: string, rather: 1 | 0 | -1): MyPrefs {
  const next = { ...prefs.rather };
  if (rather === 0) delete next[johnId];
  else next[johnId] = rather;
  return { ...prefs, rather: next };
}

/** You's line for them: "Wed, Thu, Sat, mornings", "Mornings", or "No preferences". */
export function prefsLine(prefs: MyPrefs, words: Words): string {
  const days = prefs.days.map((d) => weekdayName(d, words, "short"));
  const parts = [...days, ...(prefs.bestTime ? [words(`week.steady.timeOften.${prefs.bestTime}`)] : [])];
  if (!parts.length) return Object.keys(prefs.rather).length ? words('week.steady.johns') : words('week.steady.prefsNone');
  const line = parts.join(", ");
  return line[0].toUpperCase() + line.slice(1);
}

/** A John you can plan: yours to do and not yet late, and not a flag (that's as soon as you can). */
export function plannable(item: Pick<BoardItem, "userId" | "status" | "flaggedAt">, viewerId: string): boolean {
  return item.userId === viewerId && (item.status === "upcoming" || item.status === "due-soon") && !item.flaggedAt;
}

/** One time Plan it offers: when, its label, and a line under it. */
export interface PlanTime {
  at: Date;
  label: string;
  meta: string;
  best: boolean;
}

export interface PlanDay {
  /** Local date, `yyyy-MM-dd`. */
  date: string;
  /** "Wed". */
  label: string;
  times: PlanTime[];
}

/**
 * Plan it's choices for a John due at `dueAt`: each day from today to its due
 * day with a time still to come before it's due (morning, afternoon or
 * evening, in the house's zone), and the one chosen already: your best time
 * (or evening) on the latest day it fits, else the latest time there is.
 * Null when there's no time left before it's due.
 */
export function planChoices(
  dueAt: Date,
  now: Date,
  zone: string,
  bestTime: BestTime | null, words: Words,
): { days: PlanDay[]; chosen: PlanTime; dueWords: string } | null {
  const best = bestTime ?? "evening";
  const today = localDate(now, zone);
  const dueDay = localDate(dueAt, zone);
  const days: PlanDay[] = [];
  for (let date = today, i = 0; date <= dueDay && i < 8; date = addDaysTo(date, 1), i++) {
    const times = BEST_TIMES.map((t) => {
      const at = atHour(date, BEST_TIME_HOUR[t], zone);
      return {
        at,
        label: dateIn(at, "time", zone, words),
        meta: t === bestTime ? words('week.steady.yourBest', { time: words(`week.steady.time.${t}`).toLowerCase() }) : words(`week.steady.time.${t}`),
        best: t === best,
      };
    }).filter((t) => t.at.getTime() > now.getTime() && t.at.getTime() < dueAt.getTime());
    if (times.length) days.push({ date, label: dateIn(atHour(date, 12, zone), "weekday", zone, words), times });
  }
  if (!days.length) return null;
  const withBest = [...days].reverse().find((d) => d.times.some((t) => t.best));
  const chosen = withBest ? withBest.times.find((t) => t.best)! : days[days.length - 1].times[days[days.length - 1].times.length - 1];
  return { days, chosen, dueWords: dueLabel(dueAt, now, zone, words) };
}

/** A plan's time as the John says it: "Thu 08:30", "Today 19:00". */
export function planLabel(at: Date, now: Date, zone: string, words: Words): string {
  return dueLabel(at, now, zone, words);
}

/** An hour on a local date, in a zone. */
function atHour(date: string, hour: number, zone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const local = set(new TZDate(y, m - 1, d, zone), { hours: hour, minutes: 0, seconds: 0, milliseconds: 0 });
  return new Date(local.getTime());
}
