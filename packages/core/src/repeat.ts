import type { JohnDef } from "./board";
import type { Category, IsoDow } from "./domain";
import { addDaysTo, isDueInWeek, nextWeek, weekIndex, weekWindow } from "./week";
import type { Words } from "./words-for";

/**
 * How often a John comes round, on any period.
 *
 * A John repeats every N weeks (1 to 26) from the week it was added, or every
 * N months (1 to 60; a year is 12) on a weekday of the month: the first,
 * second, third or fourth of its due day, or the last. Monthly Johns land on
 * a weekday rather than a date, so they fall on a day people plan around and
 * never on a 31st that isn't there.
 *
 * The deal stays weekly: a monthly John is dealt in the week that holds its
 * date, which is the one day in that week on its due weekday. Pure, no clock.
 */

/** The most weeks apart a weekly John can be. Past that, months read better. */
export const MAX_EVERY_WEEKS = 26;
/** The most months apart a John can be: every five years. */
export const MAX_EVERY_MONTHS = 60;
/** `week_of_month` for the last of its weekday in the month (the fourth or the fifth). */
export const LAST_OF_MONTH = 5;
/** How far ahead Week's "Coming up" looks, in weeks after this one. */
export const COMING_UP_WEEKS = 4;
/** How long after a missed long John's due time it still comes back: two weeks covers one due on a Sunday and settled on the Monday. */
export const COMES_BACK_DAYS = 14;

/** A John's timing, as the list holds it (`johns`). */
export interface Repeat {
  everyWeeks: number;
  /** Null for a John that repeats in weeks. */
  everyMonths: number | null;
  /** 1 to 4, or LAST_OF_MONTH; null for a John that repeats in weeks. */
  weekOfMonth: number | null;
  /** monthIndex of a month it lands in; null for a John that repeats in weeks. */
  anchorMonth: number | null;
  /** weekIndex of a week it lands in, for a John that repeats in weeks. */
  anchorWeek: number;
  dueDow: IsoDow;
}

/** Months counted from year 0, so "every 3 months" means the same on every machine. `date` is `yyyy-MM-dd` or `yyyy-MM`. */
export function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** A monthIndex back as `yyyy-MM`. */
export function monthOfIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The local date, in the week that starts on `startsOn`, that falls on `dow`: the day dueAt puts a John on. */
export function dateInWeek(startsOn: string, weekStarts: IsoDow, dow: IsoDow): string {
  return addDaysTo(startsOn, (dow - weekStarts + 7) % 7);
}

/** Which of its weekday a date is in its month (1 for the first), and whether it's the last. */
export function weekdayOfMonth(date: string): { nth: number; last: boolean } {
  const [y, m, d] = date.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { nth: Math.ceil(d / 7), last: d + 7 > days };
}

/** Whether a date is the right one of its weekday in its month (ignoring which months). */
function rightWeekday(weekOfMonth: number, date: string): boolean {
  const place = weekdayOfMonth(date);
  return weekOfMonth === LAST_OF_MONTH ? place.last : place.nth === weekOfMonth;
}

/** Whether a John is due in the week that starts on `startsOn`. */
export function landsInWeek(repeat: Repeat, startsOn: string, weekStarts: IsoDow): boolean {
  if (repeat.everyMonths === null || repeat.weekOfMonth === null) {
    return isDueInWeek(repeat.everyWeeks, repeat.anchorWeek, weekIndex(startsOn));
  }
  const date = dateInWeek(startsOn, weekStarts, repeat.dueDow);
  if (!rightWeekday(repeat.weekOfMonth, date)) return false;
  const month = monthIndex(date);
  const anchor = repeat.anchorMonth ?? month;
  const every = repeat.everyMonths;
  return (((month - anchor) % every) + every) % every === 0;
}

/**
 * The next `count` dates a John lands on, in weeks starting with the one
 * that starts on `fromStartsOn`, as local dates. Gives up after ten years of
 * weeks, so a John that can't land returns fewer.
 */
export function nextLandings(repeat: Repeat, fromStartsOn: string, weekStarts: IsoDow, count: number): string[] {
  const out: string[] = [];
  for (let w = 0; w < 522 && out.length < count; w++) {
    const startsOn = addDaysTo(fromStartsOn, w * 7);
    if (landsInWeek(repeat, startsOn, weekStarts)) out.push(dateInWeek(startsOn, weekStarts, repeat.dueDow));
  }
  return out;
}

/**
 * The months a monthly John could start from, earliest first: one for each
 * month of its cycle (at most a year's worth), each with the first date it
 * would land on, from the week that starts on `fromStartsOn`. The first is
 * where a new John starts.
 */
export function startMonths(
  repeat: Pick<Repeat, "everyMonths" | "weekOfMonth" | "dueDow">,
  fromStartsOn: string,
  weekStarts: IsoDow,
): { month: number; date: string }[] {
  if (repeat.everyMonths === null || repeat.weekOfMonth === null) return [];
  const wanted = Math.min(repeat.everyMonths, 12);
  const out: { month: number; date: string }[] = [];
  for (let w = 0; w < 80 && out.length < wanted; w++) {
    const date = dateInWeek(addDaysTo(fromStartsOn, w * 7), weekStarts, repeat.dueDow);
    const month = monthIndex(date);
    if (rightWeekday(repeat.weekOfMonth, date) && !out.some((o) => o.month === month)) out.push({ month, date });
  }
  return out;
}

/**
 * A long John: one that comes round every 4 weeks or less often. Week shows
 * these coming up, and one that's missed comes back in the next deal instead of
 * waiting for its turn.
 */
export function isLong(repeat: Pick<Repeat, "everyWeeks" | "everyMonths">): boolean {
  return repeat.everyMonths !== null || repeat.everyWeeks >= 4;
}

/**
 * Whether a long John goes back into this week's deal: its last assignment
 * before the week was missed (not covered, not excused) and was due within
 * the last COMES_BACK_DAYS. Each time it comes back is an assignment of its
 * own, so it keeps coming back each week until someone does it.
 */
export function comesBack(last: { outcome: string | null; dueAt: Date } | undefined, weekStartsAt: Date): boolean {
  if (!last || last.outcome !== "missed") return false;
  return weekStartsAt.getTime() - last.dueAt.getTime() <= COMES_BACK_DAYS * 86_400_000;
}

/** How many times a year a John comes round. */
export function timesAYear(repeat: Pick<Repeat, "everyWeeks" | "everyMonths">): number {
  return repeat.everyMonths !== null ? 12 / repeat.everyMonths : 365.25 / 7 / repeat.everyWeeks;
}

/** The period as the sentence says it, after "Every": "week", "2 weeks", "month", "3 months", "year", "2 years". */
export function periodWords(repeat: Pick<Repeat, "everyWeeks" | "everyMonths">): string {
  const { everyWeeks: w, everyMonths: m } = repeat;
  if (m === null) return w === 1 ? "week" : `${w} weeks`;
  if (m % 12 === 0) return m === 12 ? "year" : `${m / 12} years`;
  return m === 1 ? "month" : `${m} months`;
}

/** How often, on its own: "Every week", "Every 2 weeks", "Every month", "Every 3 months", "Twice a year", "Every year". */
export function oftenWords(repeat: Pick<Repeat, "everyWeeks" | "everyMonths">, words: Words): string {
  return repeat.everyMonths === 6 ? words('house.repeat.twiceAYear') : `Every ${periodWords(repeat)}`;
}

/** Which of its weekday, in words: "first" … "fourth", "last". */
export function placeWord(weekOfMonth: number, words: Words): string {
  const place = weekOfMonth >= 1 && weekOfMonth <= LAST_OF_MONTH ? (weekOfMonth as 1 | 2 | 3 | 4 | 5) : LAST_OF_MONTH;
  return words(`house.repeat.places.${place}`);
}

/** When in the week or month, short, for a list's meta line: "Sun 21:00", or "first Sat 21:00" for a monthly John. */
export function dueWords(repeat: Pick<Repeat, "weekOfMonth">, dueTime: string, dayShort: string, words: Words): string {
  return repeat.weekOfMonth === null ? `${dayShort} ${dueTime}` : `${placeWord(repeat.weekOfMonth, words)} ${dayShort} ${dueTime}`;
}

/** The week after the one `now` is in, where a new or changed John's timing starts: this week is already dealt. */
export function nextStartsOn(now: Date, zone: string, weekStarts: IsoDow): string {
  return nextWeek(weekWindow(now, zone, weekStarts), zone, weekStarts).startsOn;
}

/**
 * A John's timing as the list stores it. A monthly John keeps the month it
 * starts from when it has one, and otherwise starts from the first month it
 * lands in after this week; a weekly John clears the monthly columns.
 */
export function repeatColumns(
  john: { everyWeeks: number; everyMonths: number | null; weekOfMonth: number | null; anchorMonth: number | null; dueDow: number },
  now: Date,
  zone: string,
  weekStarts: IsoDow,
): { every_weeks: number; every_months: number | null; week_of_month: number | null; anchor_month: number | null } {
  if (john.everyMonths === null || john.weekOfMonth === null) {
    return { every_weeks: john.everyWeeks, every_months: null, week_of_month: null, anchor_month: null };
  }
  const repeat = { everyMonths: john.everyMonths, weekOfMonth: john.weekOfMonth, dueDow: john.dueDow as IsoDow };
  const anchor = john.anchorMonth ?? startMonths(repeat, nextStartsOn(now, zone, weekStarts), weekStarts)[0]?.month ?? null;
  return { every_weeks: 1, every_months: john.everyMonths, week_of_month: john.weekOfMonth, anchor_month: anchor };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** A monthIndex as its month's name: "November". */
export function monthName(index: number): string {
  return MONTH_NAMES[((index % 12) + 12) % 12];
}

/** A local date in a short line: "Sat 7 Nov", or "7 Nov" without the day, with the year when `year` says so. */
export function landingLabel(date: string, opts: { day?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = DAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const words = `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}${opts.year ? ` ${y}` : ""}`;
  return opts.day ? `${weekday} ${words}` : words;
}

/**
 * Where a John being edited would land next, from next week: the dates
 * repeatColumns would give it. A weekly John not saved yet counts from this
 * week, as saving it does; a monthly one with no month yet starts from its
 * first.
 */
export function previewLandings(
  john: { everyWeeks: number; everyMonths: number | null; weekOfMonth: number | null; anchorMonth: number | null; anchorWeek?: number; dueDow: number },
  now: Date,
  zone: string,
  weekStarts: IsoDow,
  count: number,
): string[] {
  const from = nextStartsOn(now, zone, weekStarts);
  const dueDow = john.dueDow as IsoDow;
  const anchorWeek = john.anchorWeek ?? weekIndex(weekWindow(now, zone, weekStarts).startsOn);
  const monthly = john.everyMonths !== null && john.weekOfMonth !== null;
  const anchorMonth = monthly
    ? (john.anchorMonth ?? startMonths({ everyMonths: john.everyMonths, weekOfMonth: john.weekOfMonth, dueDow }, from, weekStarts)[0]?.month ?? null)
    : null;
  return nextLandings({ ...john, dueDow, anchorWeek, anchorMonth }, from, weekStarts, count);
}

/** "Next: Sat 7 Nov, then 6 Feb, 1 May, 7 Aug", or null when it can't land. */
export function nextLine(dates: readonly string[], words: Words): string | null {
  if (dates.length === 0) return null;
  const [first, ...rest] = dates;
  const firstLabel = landingLabel(first, { day: true });
  return rest.length
    ? words('house.repeat.nextThen', { first: firstLabel, rest: rest.map((d) => landingLabel(d)).join(", ") })
    : words('house.repeat.next', { first: firstLabel });
}

/** A long John not dealt yet, as Week's "Coming up" shows it. */
export interface ComingUp {
  johnId: string;
  name: string;
  category: Category;
  points: number;
  /** The local date it lands on. */
  date: string;
  /** Its row's meta line: "Sat 7 Nov, every 3 months". */
  meta: string;
}

/**
 * The long Johns that land in the COMING_UP_WEEKS weeks after the one that
 * starts on `startsOn`, soonest first: the deal hands each out in its week,
 * so until then they have nobody's name on them. On-call Johns never come
 * up: they come round when they're flagged.
 */
export function comingUp(
  johns: readonly (Pick<JohnDef, "id" | "name" | "category" | "points" | "everyWeeks" | "everyMonths" | "weekOfMonth" | "anchorMonth" | "anchorWeek" | "dueDow" | "when">)[],
  startsOn: string,
  weekStarts: IsoDow, words: Words,
): ComingUp[] {
  const out: ComingUp[] = [];
  for (const j of johns) {
    if (j.when === "on_call" || !isLong(j) || (j.everyMonths === null && j.anchorWeek === undefined)) continue;
    const repeat: Repeat = { ...j, anchorWeek: j.anchorWeek ?? 0 };
    for (let w = 1; w <= COMING_UP_WEEKS; w++) {
      const week = addDaysTo(startsOn, w * 7);
      if (!landsInWeek(repeat, week, weekStarts)) continue;
      const date = dateInWeek(week, weekStarts, j.dueDow);
      out.push({
        johnId: j.id,
        name: j.name,
        category: j.category,
        points: j.points,
        date,
        meta: words('house.repeat.comingUpWhen', { date: landingLabel(date, { day: true }), often: oftenWords(j, words).toLocaleLowerCase() }),
      });
      break;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** The quick picks at the top of How often, in the order they show; each label is house.repeat.quick.<key>. */
export const REPEAT_QUICK = [
  { key: "week", everyWeeks: 1, everyMonths: null },
  { key: "twoWeeks", everyWeeks: 2, everyMonths: null },
  { key: "month", everyWeeks: 1, everyMonths: 1 },
  { key: "threeMonths", everyWeeks: 1, everyMonths: 3 },
  { key: "sixMonths", everyWeeks: 1, everyMonths: 6 },
  { key: "year", everyWeeks: 1, everyMonths: 12 },
] as const satisfies readonly { key: string; everyWeeks: number; everyMonths: number | null }[];

/** The time sheet's quick picks; each label is house.repeat.clock.<key>. */
export const REPEAT_CLOCK = [
  { key: "morning", time: "09:00" },
  { key: "midday", time: "12:00" },
  { key: "evening", time: "18:00" },
  { key: "night", time: "21:00" },
] as const;
