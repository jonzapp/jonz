import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import { awayDays, currentOrNext, type AwayPeriod } from "./away";
import { byDoneLatest, type BoardItem } from "./board";
import { FOCUS_SHELL_COPY, TABLE_COPY } from "./copy";
import { MAKEUP_LABEL } from "./deal";
import { dateRange, firstName, formatBalance, pointsLabel, STATUS_LABEL, STATUS_MARK, weekRange } from "./format";
import type { LiveStatus } from "./outcome";
import { addDaysTo, localDate } from "./week";
import type { Words } from "./words-for";

// Week: the whole house's week at a glance. A summary whose parts add up to
// the week's Johns and filter the list, one group per person with finished
// Johns folded away, and the deal's fairness in a sentence. Each John's row
// is john-row.ts's, as on Today. Pure: every function takes what it needs,
// `now` included.

/** The summary's parts, in the bar's order. Every John is in exactly one. */
export const WEEK_PARTS = ["done", "checking", "disputed", "overdue", "toGo"] as const;
export type WeekPart = (typeof WEEK_PARTS)[number];

/**
 * The part a John's status counts towards. Done takes everything finished
 * (late, excused and covered too), and overdue takes missed, so the parts never
 * overlap and always add up.
 */
export function weekPart(status: LiveStatus): WeekPart {
  switch (status) {
    case "done":
    case "late":
    case "excused":
    case "covered":
      return "done";
    case "checking":
      return "checking";
    case "disputed":
      return "disputed";
    case "overdue":
    case "missed":
      return "overdue";
    default:
      return "toGo";
  }
}

/** Finished and folded away: done, done late, excused, or covered by a housemate. */
export function weekFinished(status: LiveStatus): boolean {
  return status === "done" || status === "late" || status === "excused" || status === "covered";
}

export interface WeekSummary {
  total: number;
  /** All five parts, in order, zeros included: they add up to `total`. */
  parts: { part: WeekPart; count: number; label: string }[];
  /** The bar, spoken: "11 Johns: 5 done, 2 checking, 1 disputed, 1 overdue, 2 to go". */
  spoken: string;
}

/** The week in five parts that add up to its Johns. */
export function weekSummary(items: readonly { status: LiveStatus }[], words: Words): WeekSummary {
  const counts = new Map<WeekPart, number>(WEEK_PARTS.map((p) => [p, 0]));
  for (const item of items) {
    const part = weekPart(item.status);
    counts.set(part, counts.get(part)! + 1);
  }
  const parts = WEEK_PARTS.map((part) => ({ part, count: counts.get(part)!, label: words(`week.summary.parts.${part}` as const) }));
  const said = parts.filter((p) => p.count > 0).map((p) => words('week.summary.part', { count: p.count, label: p.label }));
  return { total: items.length, parts, spoken: words('week.summary.bar', { total: items.length, parts: said.join(", ") }) };
}

/** Pressing a legend part: show only it, or, pressed again, everything. */
export function toggleWeekFilter(current: WeekPart | null, part: WeekPart): WeekPart | null {
  return current === part ? null : part;
}

/** The filter as it stands: none once its part has nothing left in it (the week moved on). */
export function liveWeekFilter(summary: WeekSummary, filter: WeekPart | null): WeekPart | null {
  if (filter === null) return null;
  return (summary.parts.find((p) => p.part === filter)?.count ?? 0) > 0 ? filter : null;
}

/**
 * Whether the week can be dealt again: nothing in it ticked or settled yet,
 * as deal_week asks (it refuses otherwise). An empty week can.
 */
export function weekUnticked(items: readonly Pick<BoardItem, "doneAt" | "outcome">[]): boolean {
  return items.every((i) => i.doneAt === null && i.outcome === null);
}

/** What needs doing first: overdue and missed, then due soon, upcoming, disputed, and being checked. */
const ROW_ORDER: Record<LiveStatus, number> = {
  overdue: 0,
  missed: 0,
  "due-soon": 1,
  upcoming: 2,
  disputed: 3,
  checking: 4,
  done: 5,
  late: 5,
  excused: 5,
  covered: 5,
};

/** What needs doing first, then the sooner due. */
function byNeed(a: { status: LiveStatus; dueAt: Date }, b: { status: LiveStatus; dueAt: Date }): number {
  return ROW_ORDER[a.status] - ROW_ORDER[b.status] || a.dueAt.getTime() - b.dueAt.getTime();
}

/** One person's group on Week. */
export interface WeekPerson<T> {
  userId: string;
  /** Rows to show: what's still in play, what needs doing first; with a filter, every one of theirs in it. */
  rows: T[];
  /** Folded away under "Done (n)": what's finished. Empty while a filter is on. */
  folded: T[];
  /** Theirs this week, whatever the filter. */
  total: number;
  /** How many of theirs are finished, whatever the filter. */
  done: number;
}

/**
 * The house's week, one group per person: the viewer first, then everyone
 * else in the order they joined (`memberIds`), then anyone who has left but
 * still holds a John this week. Everyone in the house gets a group, with or
 * without Johns. With a filter, only the people with Johns in its part,
 * showing just those, unfolded.
 */
export function weekPeople<T extends { userId: string; status: LiveStatus; dueAt: Date; doneAt?: Date | null; jobId?: string | null }>(
  items: readonly T[],
  memberIds: readonly string[],
  viewerId: string,
  filter: WeekPart | null = null,
): WeekPerson<T>[] {
  const order = [...memberIds];
  for (const item of items) if (!order.includes(item.userId)) order.push(item.userId);
  const ids = order.includes(viewerId) ? [viewerId, ...order.filter((id) => id !== viewerId)] : order;

  const people = ids.map((userId) => {
    const theirs = items.filter((i) => i.userId === userId);
    return {
      userId,
      // A John done together has its own row under Together (weekTogether), but counts here.
      ...weekList(theirs.filter((i) => !i.jobId), filter),
      total: theirs.length,
      done: theirs.filter((i) => weekFinished(i.status)).length,
    };
  });
  return filter ? people.filter((p) => p.rows.length > 0) : people;
}

/**
 * Each John done together once (a job's places, crew.ts): the viewer's own
 * place in it if they have one, else the place its roll call was ticked
 * from, else its first. What needs doing first; with a filter, only those
 * with a place in its part.
 */
export function weekTogether<
  T extends { id: string; userId: string; status: LiveStatus; dueAt: Date; doneAt?: Date | null; jobId?: string | null; crew?: { tickedFrom: string } | null },
>(items: readonly T[], viewerId: string, filter: WeekPart | null = null): T[] {
  const jobs = new Map<string, T[]>();
  for (const i of items) if (i.jobId) jobs.set(i.jobId, [...(jobs.get(i.jobId) ?? []), i]);
  const shown: T[] = [];
  for (const places of jobs.values()) {
    if (filter && !places.some((p) => weekPart(p.status) === filter)) continue;
    const ticked = places[0].crew?.tickedFrom;
    shown.push(places.find((p) => p.userId === viewerId) ?? places.find((p) => p.id === ticked) ?? places[0]);
  }
  return shown.sort((a, b) => Number(weekFinished(a.status)) - Number(weekFinished(b.status)) || byNeed(a, b));
}

/** The week with each John done together as one row (weekTogether's), for the laptop's table. */
export function oneRowPerJob<
  T extends { id: string; userId: string; status: LiveStatus; dueAt: Date; doneAt?: Date | null; jobId?: string | null; crew?: { tickedFrom: string } | null },
>(items: readonly T[], viewerId: string): T[] {
  const together = new Set(weekTogether(items, viewerId).map((i) => i.id));
  return items.filter((i) => !i.jobId || together.has(i.id));
}

/**
 * The whole house's week as one list, the laptop's table: what needs doing
 * first, whoever's it is, then the finished ones to fold; with a filter,
 * just that part's, unfolded.
 */
export function weekList<T extends { status: LiveStatus; dueAt: Date; doneAt?: Date | null }>(
  items: readonly T[],
  filter: WeekPart | null = null,
): { rows: T[]; folded: T[] } {
  if (filter) return { rows: items.filter((i) => weekPart(i.status) === filter).sort(byNeed), folded: [] };
  return {
    rows: items.filter((i) => !weekFinished(i.status)).sort(byNeed),
    // In Today's order for its fold: the latest done first.
    folded: items.filter((i) => weekFinished(i.status)).sort(byDoneLatest),
  };
}

/**
 * A person's header, on the right: "1 of 3 done, 6 pts", or nothing for
 * someone with no Johns this week. Their time away has a line of its own
 * under it (weekAwayNote), so neither is ever cut short.
 */
export function weekPersonMeta(p: { done: number; total: number; points: number }, words: Words): string | null {
  if (p.total === 0) return null;
  return `${words('week.summary.doneOf', { done: p.done, total: p.total })}, ${pointsLabel(p.points)}`;
}

/**
 * Someone's time away, as their header says it: the time away that falls in
 * this week (even if it's over), or else their next, if it starts within a
 * week of today. "away all week" when it covers the whole week.
 */
export function weekAwayNote(
  periods: readonly AwayPeriod[],
  userId: string,
  weekStartsOn: string,
  today: string, words: Words,
): string | null {
  const weekEndsOn = addDaysTo(weekStartsOn, 6);
  if (awayDays(periods, userId, weekStartsOn, weekEndsOn).length === 7) return words('week.summary.awayAllWeek');
  const inWeek = periods
    .filter((p) => p.userId === userId && p.startsOn <= weekEndsOn && p.endsOn >= weekStartsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const next = currentOrNext(periods, userId, today);
  const period =
    inWeek.find((p) => p.endsOn >= today) ??
    inWeek[0] ??
    (next && next.startsOn <= addDaysTo(today, 7) ? next : null);
  return period ? words('week.summary.away', { days: dateRange(period.startsOn, period.endsOn) }) : null;
}

/**
 * On a laptop, where the house is one table rather than a group per person,
 * everyone's time away in one line under the summary, in Week's order:
 * "Megan is away 28–31 Oct. You’re away all week." Null when nobody is.
 */
export function weekAwayLine(
  notes: readonly { userId: string; away: string | null }[],
  viewerId: string,
  nameOf: (userId: string) => string | null, words: Words,
): string | null {
  const said = notes
    .filter((n): n is { userId: string; away: string } => n.away !== null)
    .map((n) => words('week.summary.isAway', { who: weekWho(n.userId, viewerId, nameOf, words), note: n.away, you: n.userId === viewerId }));
  // Each is a sentence of its own ("You’re away all week"), so each ends as one.
  return said.length > 0 ? `${said.join(". ")}.` : null;
}

/**
 * The summary's first line: the week's days and when it ends, in the house's
 * zone. "19–25 Oct, ends tonight", ", ends tomorrow", ", ends Sun".
 */
export function weekRangeLine(startsAt: Date, endsAt: Date, now: Date, zone: string, words: Words): string {
  const days = weekRange(startsAt, endsAt, zone);
  if (now >= endsAt) return words('week.summary.range', { days, ends: words('week.summary.ended') });
  const last = new Date(endsAt.getTime() - 1);
  const lastDay = localDate(last, zone);
  const today = localDate(now, zone);
  const ends =
    lastDay === today
      ? words('week.summary.endsTonight')
      : lastDay === addDaysTo(today, 1)
        ? words('week.summary.endsTomorrow')
        : words('week.summary.endsOn', { day: format(last, "EEE", { in: tz(zone) }) });
  return words('week.summary.range', { days, ends });
}

/** Someone by first name mid-sentence, or "a former housemate" once they've left (no name). */
function called(name: string | null, words: Words): string {
  return name ? firstName(name) : words('week.summary.someoneGone');
}

/** Whose a John or a group is, as Week labels it: "You", a first name, or "A former housemate". */
export function weekWho(userId: string, viewerId: string, nameOf: (userId: string) => string | null, words: Words): string {
  if (userId === viewerId) return words('week.table.you');
  const name = nameOf(userId);
  return name ? firstName(name) : FOCUS_SHELL_COPY.formerHousemate;
}

/**
 * A John's row on the laptop's table, to a screen reader, which can't see
 * the columns: "Descale the kettle, Kitchen, was due Sun, Tom, 1 pt, Overdue".
 * Upcoming says nothing for its status, as its row shows none.
 */
export function weekSpokenRow(
  item: Pick<BoardItem, "name" | "status">,
  meta: string,
  who: string,
  points: number,
): string {
  const status = STATUS_MARK[item.status].tone === "none" ? [] : [STATUS_LABEL[item.status]];
  return [item.name, meta, who, pointsLabel(points), ...status].join(", ");
}

/**
 * The fair shares sheet behind the footer: everyone's balance against their
 * share, in Week's order (you first, then the order they joined), as the
 * Table writes it ("+1.5", "−4", "level"), and the key under it, with how
 * the house makes up time away.
 */
export function weekShareRows(
  balances: readonly { userId: string; balance: number }[],
  memberIds: readonly string[],
  viewerId: string,
  awayMakeup: number,
  words: Words,
): { rows: { userId: string; balance: string }[]; key: string } {
  const order = [viewerId, ...memberIds.filter((id) => id !== viewerId)];
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const rows = [...balances]
    .sort((a, b) => rank(a.userId) - rank(b.userId))
    .map((b) => ({ userId: b.userId, balance: formatBalance(b.balance) }));
  const makeup = MAKEUP_LABEL[awayMakeup] ?? MAKEUP_LABEL[100];
  return { rows, key: words('week.summary.sharesKey', { key: TABLE_COPY.sharesKey, makeup: makeup.toLowerCase() }) };
}

/**
 * The deal's fairness in one sentence, from everyone's balance against their
 * fair share (handed minus share over the recent weeks; below zero is
 * behind). Even when nobody is half a point off; still even when nobody is
 * more than half a John off, a John being this week's average; otherwise it
 * names whoever is furthest off (behind before ahead, on a tie), in points
 * rounded to the half. Nothing for a house of one, where there's nobody to
 * be fair between.
 */
export function weekFairness(
  balances: readonly { userId: string; balance: number }[],
  johnPoints: readonly number[],
  viewerId: string,
  nameOf: (userId: string) => string | null, words: Words,
): string | null {
  if (balances.length < 2) return null;
  const furthest = balances.reduce((worst, b) =>
    Math.abs(b.balance) > Math.abs(worst.balance) || (Math.abs(b.balance) === Math.abs(worst.balance) && b.balance < worst.balance)
      ? b
      : worst,
  );
  const off = Math.abs(furthest.balance);
  if (off < 0.5) return words('week.summary.fairLevel');
  const john = johnPoints.length > 0 ? johnPoints.reduce((a, b) => a + b, 0) / johnPoints.length : 1;
  if (off <= john / 2) return words('week.summary.fairClose');
  const points = pointsLabel(Math.round(off * 2) / 2);
  const you = furthest.userId === viewerId;
  const who = called(nameOf(furthest.userId), words);
  return furthest.balance < 0
    ? words('week.summary.fairBehind', { who, points, you })
    : words('week.summary.fairAhead', { who, points, you });
}
