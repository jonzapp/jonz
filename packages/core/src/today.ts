import { tz } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";

import { currentOrNext, type AwayPeriod } from "./away";
import { byDoneLatest, isOpen, TODAY_ORDER } from "./board-views";
import { type BoardItem, type WeekBoard } from "./board";
import type { Currency, HouseRules } from "./domain";
import { dateIn, dateRange, dueInLine, firstName, sinceLabel } from "./format";
import { monthWord } from "./house-page";
import { johnKind } from "./john-row";
import { cantOptions } from "./john-sheet";
import { formatMoney } from "./money";
import { type LiveStatus } from "./outcome";
import { can, type HouseRole } from "./permissions";
import { pocketMoney } from "./pocket";
import type { TableRow } from "./points";
import type { StakeView } from "./stake";
import { NO_PREFS, type MyPrefs } from "./steady-prefs";
import { swapAsk, swapOffersToYou, type SwapAsk, type SwapOfferRow, type SwapOfferToYou } from "./steady-swap";
import { forfeits, overdueCost, type Person } from "./today-parts";
import { addDaysTo, monthOf } from "./week";
import type { Viewing } from "./viewing";
import type { Words } from "./words-for";

export { tickerOf } from "./today-parts";

// Today as Focus shows it, and the John sheet: which John is Next up and
// what the rest of your week holds, the words in their meta lines (what
// lateness costs, from the house's rules and what's left of your stake),
// the standing line, time away, the setup checklist, and what the sheet
// offers for a John and whoever is looking. Pure: every function that
// reads the clock takes `now`. Weeks and months are the house's
// (`rules.timezone`); a time is said in the zone the caller passes, the
// reader's own when their clock isn't the house's.

/** Settled without a forfeit still to see: what "Done (n)" folds away. A missed John stays out, in hazard. */
const FOLDED: ReadonlySet<LiveStatus> = new Set<LiveStatus>(["done", "late", "excused"]);

function inTodayOrder(items: readonly BoardItem[]): BoardItem[] {
  return [...items].sort((a, b) => TODAY_ORDER[a.status] - TODAY_ORDER[b.status] || a.dueAt.getTime() - b.dueAt.getTime());
}

/** Your next open John: overdue first, then whatever is due soonest. Null when nothing's left to do. */
export function nextUp(mine: readonly BoardItem[]): BoardItem | null {
  return inTodayOrder(mine).find((i) => isOpen(i.status)) ?? null;
}

/**
 * The rest of your week beside the John that Next up shows (`shownId`):
 * what's still going (to do, being checked, disputed, and a missed John,
 * which keeps its hazard in view) in Today's order, and what's finished,
 * for the "Done (n)" fold, the latest done first, as Week folds it.
 */
export function restOfWeek(
  mine: readonly BoardItem[],
  shownId: string | null,
): { going: BoardItem[]; finished: BoardItem[] } {
  const others = inTodayOrder(mine).filter((i) => i.id !== shownId);
  return { going: others.filter((i) => !FOLDED.has(i.status)), finished: others.filter((i) => FOLDED.has(i.status)).sort(byDoneLatest) };
}

/**
 * The last day of the time away you're on today, or null when you're home.
 * Trips that run on from each other count as one.
 */
export function awayTodayUntil(periods: readonly AwayPeriod[], userId: string, today: string): string | null {
  const mine = periods.filter((p) => p.userId === userId).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const now = mine.find((p) => p.startsOn <= today && today <= p.endsOn);
  if (!now) return null;
  let until = now.endsOn;
  for (const p of mine) if (p.startsOn <= addDaysTo(until, 1) && p.endsOn > until) until = p.endsOn;
  return until;
}

/** How far ahead Today mentions a trip of yours, as the web's banner did. */
const AWAY_NOTICE_DAYS = 14;

/**
 * Your time away as Today's line under the week says it: "You're away
 * until Fri 30 Oct" while you're gone (when the card is saying something
 * else, before the week is out), or "You're away 28–31 Oct" for a trip that
 * starts within a fortnight. Null when there's neither.
 */
export function awayLine(periods: readonly AwayPeriod[], userId: string, today: string, words: Words): string | null {
  const until = awayTodayUntil(periods, userId, today);
  if (until) return words('today.nextUp.away', { day: dateRange(until, until, words) });
  const next = currentOrNext(periods, userId, today);
  if (!next || next.startsOn > addDaysTo(today, AWAY_NOTICE_DAYS)) return null;
  return words('today.nextUp.awaySoon', { range: dateRange(next.startsOn, next.endsOn, words) });
}

/** What takes the Next up card's place: the setup, a wait, time away, your next John, or nothing to do. */
export type NextUpState =
  /** Nothing has ever been dealt, and you're an admin: the setup checklist. */
  | { kind: "setup" }
  /** Nothing has ever been dealt, and someone else deals: who. */
  | { kind: "waiting"; admin: string | null }
  /** The house has started, but this week isn't out yet. */
  | { kind: "undealt" }
  /** You're away today, until this local date (the last day away). */
  | { kind: "away"; until: string }
  | { kind: "john"; item: BoardItem }
  /** Nothing of yours to do, but the house is voting on a tick of yours: it may come back. */
  | { kind: "voting"; item: BoardItem }
  /** Nothing of yours left to do; new Johns come when the week turns over, at `until`. */
  | { kind: "clear"; until: Date; nothingYours: boolean };

/**
 * Who deals, as "Sam will deal it soon." names them on Today and Week: the
 * first admin to have joined (`members` in the order they joined), by first
 * name.
 */
export function whoDeals(members: readonly (Person & { role: string })[]): string | null {
  const admin = members.find((m) => can(m.role as HouseRole, "weeks:write"));
  return admin ? firstName(admin.name) : null;
}

/** Which of Today's card states shows, from the week, your Johns, who deals and your time away. */
export function nextUpState(input: {
  board: WeekBoard;
  mine: readonly BoardItem[];
  userId: string;
  /** Who lives here, in the order they joined: the first admin is who deals. */
  members: readonly (Person & { role: string })[];
  /** From awayTodayUntil: null at home, or while time away isn't read yet. */
  awayUntil: string | null;
}): NextUpState {
  const { board, mine, members } = input;
  if (board.notStarted) {
    if (members.some((m) => m.userId === input.userId && can(m.role as HouseRole, "weeks:write"))) return { kind: "setup" };
    return { kind: "waiting", admin: whoDeals(members) };
  }
  if (!board.week) return { kind: "undealt" };
  if (input.awayUntil) return { kind: "away", until: input.awayUntil };
  const item = nextUp(mine);
  if (item) return { kind: "john", item };
  // Not clear yet while the house might say a tick of yours wasn't done.
  const disputed = mine.find((i) => i.status === "disputed");
  if (disputed) return { kind: "voting", item: disputed };
  return { kind: "clear", until: board.week.endsAt, nothingYours: mine.length === 0 };
}

/**
 * "You're clear until Wed": the day the week turns over, in the house's
 * zone, with its date when the day alone could be read as today or this
 * week's ("until Mon 2 Nov", on a Monday or six days out).
 */
export function clearUntil(until: Date, zone: string, now: Date, words: Words): string {
  const inZone = tz(zone);
  const days = differenceInCalendarDays(until, now, { in: inZone });
  return words('today.nextUp.clear', { day: dateIn(until, days >= 6 || days % 7 === 0 ? "weekdayDayMonth" : "weekday", zone, words) });
}

/**
 * How much more lateness can cost you in a month: forfeits are capped at
 * the stake, so it's the stake less what you've forfeited in it so far
 * (from the Stake's projection), and nothing in a house of one, where
 * every forfeit comes back. Null when it isn't known: the Stake not read
 * yet, or a John due in another month than the one it projects.
 */
export function forfeitRoom(
  stake: Pick<StakeView, "month" | "stakeMinor" | "projection"> | null,
  userId: string,
  month: string,
): number | null {
  if (stake === null || stake.month !== month) return null;
  if (stake.projection.length < 2) return 0;
  const forfeited = stake.projection.find((p) => p.userId === userId)?.forfeitedRaw ?? 0;
  return Math.max(0, stake.stakeMinor - forfeited);
}

/** The meta under Next up's John. */
export interface NextUpMeta {
  /** The kind, after its lid dot. */
  kind: string;
  /** While it's to do: when it's due and what being late costs. Null once overdue. */
  due: string | null;
  /** Overdue: since when (hazard words after a hazard sign, on a line of their own), and what it costs. */
  overdue: { since: string; cost: string | null } | null;
}

/**
 * "Bathroom" and "due today 21:00, £1 if late"; overdue, "Kitchen" and
 * "Overdue since Tue" with "£1 now, £3 if missed". `room` caps the costs
 * at what's left of your stake (forfeitRoom).
 */
export function nextUpMeta(item: BoardItem, { rules, now, zone, words }: Pick<Viewing, "rules" | "now" | "zone" | "words">, room: number | null = null): NextUpMeta {
  const kind = johnKind(item.category, item.kindName);
  if (item.status === "overdue") {
    return {
      kind,
      due: null,
      overdue: { since: words('today.nextUp.overdueSince', { when: sinceLabel(item.dueAt, now, zone, words) }), cost: overdueCost(rules, room, words) },
    };
  }
  const due = words('today.nextUp.due', { when: dueInLine(item.dueAt, now, zone, words) }) + (item.movedFrom ? `, ${words('today.nextUp.beforeYouGo')}` : "");
  const { late, missed } = forfeits(rules, room, words);
  const cost = late ? words('today.nextUp.ifLate', { amount: late }) : missed ? words('today.nextUp.ifMissed', { amount: missed }) : null;
  // A kid's John in a family says what it earns instead (there's nothing to lose).
  const earns = item.payMinor ? words('house.pocket.earns', { money: pocketMoney(item.payMinor, rules.currency, words) }) : null;
  return { kind, due: [due, cost ?? earns].filter(Boolean).join(", "), overdue: null };
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Where you are on a table, in words: "2nd", or "Joint 2nd" on a tie. */
export function standingPlace(rank: number, joint: boolean, words: Words): string {
  return joint ? words('today.nextUp.joint', { place: ordinal(rank) }) : ordinal(rank);
}

/** "October" from "2026-10". */
function monthName(month: string, words: Words): string {
  return monthWord(month, words);
}

/**
 * Today's one standing line: "Joint 2nd this week, up £4.01 in October".
 * The place is from this week's Table (joint on a tie), left out while
 * nobody has scored or there's nobody to beat; the money is your net this
 * month from the Stake's projection, left out until it's read or while
 * you aren't in it. Null when neither is known.
 */
export function standingLine(input: {
  table: readonly TableRow[];
  userId: string;
  /** The Stake, or null until it's read. */
  stake: Pick<StakeView, "month" | "projection"> | null;
  currency: Currency;
}, words: Words): string | null {
  const { table, userId, stake, currency } = input;
  const me = table.find((r) => r.userId === userId);
  const scored = table.some((r) => r.points > 0);
  const place =
    me && table.length > 1 && scored
      ? words('today.nextUp.thisWeek', { place: standingPlace(me.rank, table.some((r) => r.userId !== userId && r.rank === me.rank), words) })
      : null;
  const net = stake?.projection.find((p) => p.userId === userId)?.net ?? null;
  const month = stake ? monthName(stake.month, words) : null;
  const money =
    net === null || month === null
      ? null
      : net > 0
        ? words('today.nextUp.up', { amount: formatMoney(net, currency, words), month })
        : net < 0
          ? words('today.nextUp.down', { amount: formatMoney(-net, currency, words), month })
          : words('today.nextUp.square', { month });
  const line = [place, money].filter(Boolean).join(", ");
  return line ? line[0].toUpperCase() + line.slice(1) : null;
}

/** An admin's first steps, before anything is dealt: each one done or not, and whether the deal is ready. */
export interface SetupChecklist {
  /** How many Johns are on the list; null while it's being read. */
  johnCount: number | null;
  johns: boolean;
  housemates: boolean;
  /** Both of the above: the deal turns amber. */
  ready: boolean;
}

/** From the John list (null while it's being read) and how many live here. */
export function setupChecklist(list: readonly unknown[] | null, memberCount: number): SetupChecklist {
  const johnCount = list ? list.length : null;
  const johns = (johnCount ?? 0) > 0;
  const housemates = memberCount > 1;
  return { johnCount, johns, housemates, ready: johns && housemates };
}

/** Everything Today shows, shaped from what the screen reads. */
export interface TodayPage {
  /** What the card shows: your next John, or what takes its place. */
  state: NextUpState;
  /** The rest of your week: what's still going, and what's folded into "Done (n)". */
  going: BoardItem[];
  finished: BoardItem[];
  /** What you hold that could skip or swap Next up's John. */
  cant: { immunity: boolean; swap: boolean };
  /** How much more lateness can cost you in Next up's John's month (forfeitRoom). */
  room: number | null;
  /** Your time away, when the card isn't already saying so (awayLine). */
  away: string | null;
  /** Where you stand (standingLine), once the week is out. */
  standing: string | null;
  /** A John you'd rather not that someone would rather do, or your ask about it (steady-swap.ts). */
  swap: SwapAsk<BoardItem> | null;
  /** Asks to swap made to you, still open. */
  offers: SwapOfferToYou<BoardItem>[];
}

/** Today's card, rows and lines from the week, you, your trips and the Stake (each null until it's read). */
export function todayPage(input: {
  board: WeekBoard;
  /** Your Johns this week (todayView's `mine`). */
  mine: readonly BoardItem[];
  userId: string;
  /** You in the house, with the tokens you hold; null if you've just left. */
  me: { userId: string; immunityTokens: number; swapTokens: number } | null;
  members: readonly (Person & { role: string; prefs?: MyPrefs })[];
  rules: HouseRules;
  /** Time away as read: today in the house and everyone's trips. */
  away: { today: string; periods: readonly AwayPeriod[] } | null;
  stake: Pick<StakeView, "month" | "stakeMinor" | "projection"> | null;
  /** Asks to swap still open that you made or were asked, as read. */
  offers?: readonly SwapOfferRow[];
  now?: Date;
}, words: Words): TodayPage {
  const { board, mine, userId, away, stake, rules } = input;
  const state = nextUpState({
    board,
    mine,
    userId,
    members: input.members,
    awayUntil: away ? awayTodayUntil(away.periods, userId, away.today) : null,
  });
  const shown = state.kind === "john" ? state.item : null;
  const cant = shown ? cantOptions(shown, board, input.me) : null;
  return {
    state,
    ...restOfWeek(mine, shown?.id ?? null),
    cant: { immunity: (cant?.immunity ?? 0) > 0, swap: (cant?.swapFor.length ?? 0) > 0 },
    room: shown ? forfeitRoom(stake, userId, monthOf(shown.dueAt, rules.timezone)) : null,
    away: away && state.kind !== "away" ? awayLine(away.periods, userId, away.today, words) : null,
    standing: board.week ? standingLine({ table: board.table, userId, stake, currency: rules.currency }, words) : null,
    ...swapsFor(input, words),
  };
}

/** Today's swaps, once everyone's preferences and the open asks are read. */
function swapsFor(input: Parameters<typeof todayPage>[0], words: Words): Pick<TodayPage, "swap" | "offers"> {
  const { offers, now } = input;
  if (!offers || !now) return { swap: null, offers: [] };
  const members = input.members.map((m) => ({ userId: m.userId, name: m.name, prefs: m.prefs ?? NO_PREFS }));
  const args = { items: input.board.items, viewerId: input.userId, members, offers, now };
  return { swap: swapAsk(args, words), offers: swapOffersToYou(args, words) };
}

/** How your share catches up after time away, by houses.away_makeup: in full, half of it, or none (it goes to whoever's home). */
export function awayShare(makeup: number): "full" | "half" | "none" {
  return makeup >= 100 ? "full" : makeup > 0 ? "half" : "none";
}
