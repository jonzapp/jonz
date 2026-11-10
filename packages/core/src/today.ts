import { tz } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";

import { currentOrNext, type AwayPeriod } from "./away";
import { byDoneLatest, isOpen, TODAY_ORDER, type BoardItem, type DisputeView, type WeekBoard } from "./board";
import { FOCUS_SHELL_COPY, PARENT_OK_COPY, POCKET_COPY } from "./copy";
import { andNames } from "./crew";
import type { Currency, HouseRules } from "./domain";
import { dateRange, dueInLine, firstName, pointsLabel, relative, sinceLabel, STATUS_LABEL, STATUS_MARK } from "./format";
import { johnKind } from "./john-row";
import { formatMoney } from "./money";
import { canCover, coverOpensAt, type LiveStatus } from "./outcome";
import { can, type HouseRole } from "./permissions";
import { pocketMoney } from "./pocket";
import type { TableRow } from "./points";
import { oftenWords } from "./repeat";
import type { StakeView } from "./stake";
import { NO_PREFS, type MyPrefs } from "./steady-prefs";
import { swapAsk, swapOffersToYou, type SwapAsk, type SwapOfferRow, type SwapOfferToYou } from "./steady-swap";
import { addDaysTo, monthOf } from "./week";
import type { Words } from "./words-for";

// Today as Focus shows it, and the John sheet: which John is Next up and
// what the rest of your week holds, the words in their meta lines (what
// lateness costs, from the house's rules and what's left of your stake),
// the standing line, time away, the setup checklist, and what the sheet
// offers for a John and whoever is looking. Pure: every function that
// reads the clock takes `now`, and times are in the house's zone
// (`rules.timezone`).

/** Someone in the house, as far as these words need them. */
interface Person {
  userId: string;
  name: string;
}

/** A first name to start a sentence with: "Priya", or "A former housemate" for someone who has left. */
function firstNameIn(people: readonly Person[], userId: string | null): string {
  const person = people.find((p) => p.userId === userId);
  return person ? firstName(person.name) : FOCUS_SHELL_COPY.formerHousemate;
}

/** A first name mid-sentence: "Priya", or "a former housemate". */
function called(people: readonly Person[], userId: string | null, words: Words): string {
  const person = people.find((p) => p.userId === userId);
  return person ? firstName(person.name) : words('today.nextUp.someoneGone');
}

/** Settled one way or another: nothing more to do or check. A cover is, once its outcome is stamped (johnSheetMode). */
const SETTLED: ReadonlySet<LiveStatus> = new Set<LiveStatus>(["done", "late", "excused", "missed", "covered"]);

/** Whose tick it is: the housemate who covered it, whoever ticked its roll call, or else whoever it was dealt to. */
export function tickerOf(item: Pick<BoardItem, "userId"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>): string {
  return item.coveredBy ?? item.crew?.tickedBy ?? item.userId;
}

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
  if (until) return words('today.nextUp.away', { day: dateRange(until, until) });
  const next = currentOrNext(periods, userId, today);
  if (!next || next.startsOn > addDaysTo(today, AWAY_NOTICE_DAYS)) return null;
  return words('today.nextUp.awaySoon', { range: dateRange(next.startsOn, next.endsOn) });
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
  return words('today.nextUp.clear', { day: format(until, days >= 6 || days % 7 === 0 ? "EEE d MMM" : "EEE", { in: inZone }) });
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

/** The late and missed forfeits as they'd land on you, each capped at `room` when it's known; null when free. */
function forfeits(rules: HouseRules, room: number | null): { late: string | null; missed: string | null } {
  const money = (amount: number) => {
    const capped = Math.max(0, room === null ? amount : Math.min(amount, room));
    return capped > 0 ? formatMoney(capped, rules.currency) : null;
  };
  return { late: money(rules.lateForfeitMinor), missed: money(rules.missedForfeitMinor) };
}

/** What an overdue John costs: "£1 now, £3 if missed", or less when a forfeit is zero. */
function overdueCost(rules: HouseRules, room: number | null, words: Words): string | null {
  const { late, missed } = forfeits(rules, room);
  if (late && missed) return words('today.nextUp.nowOrMissed', { late, missed });
  if (late) return words('today.nextUp.now', { late });
  if (missed) return words('today.nextUp.ifMissed', { amount: missed });
  return null;
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
export function nextUpMeta(item: BoardItem, rules: HouseRules, now: Date, words: Words, room: number | null = null): NextUpMeta {
  const zone = rules.timezone;
  const kind = johnKind(item.category);
  if (item.status === "overdue") {
    return {
      kind,
      due: null,
      overdue: { since: words('today.nextUp.overdueSince', { when: sinceLabel(item.dueAt, now, zone) }), cost: overdueCost(rules, room, words) },
    };
  }
  const due = words('today.nextUp.due', { when: dueInLine(item.dueAt, now, zone) }) + (item.movedFrom ? `, ${words('today.nextUp.beforeYouGo')}` : "");
  const { late, missed } = forfeits(rules, room);
  const cost = late ? words('today.nextUp.ifLate', { amount: late }) : missed ? words('today.nextUp.ifMissed', { amount: missed }) : null;
  // A kid's John in a family says what it earns instead (there's nothing to lose).
  const earns = item.payMinor ? POCKET_COPY.earns(pocketMoney(item.payMinor, rules.currency)) : null;
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
function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(Date.UTC(y, m - 1, 15)), "MMMM", { in: tz("UTC") });
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
  const month = stake ? monthName(stake.month) : null;
  const money =
    net === null || month === null
      ? null
      : net > 0
        ? words('today.nextUp.up', { amount: formatMoney(net, currency), month })
        : net < 0
          ? words('today.nextUp.down', { amount: formatMoney(-net, currency), month })
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

/** "closes in 17h", or "closing now" once its time has come and the clock hasn't closed it yet. */
export function voteCloses(closesAt: Date, now: Date, words: Words): string {
  return closesAt.getTime() > now.getTime() ? words('today.nextUp.closes', { when: relative(closesAt, now) }) : words('today.nextUp.closingNow');
}

/** Needs you's title for a dispute: "Vote on Priya’s Clean the bathroom" ("Vote on Clean the bathroom" once she's left). */
export function voteTitle(item: Pick<BoardItem, "userId" | "name">, people: readonly Person[], words: Words): string {
  const owner = people.find((p) => p.userId === item.userId);
  return owner ? words('today.nextUp.voteOn', { owner: firstName(owner.name), john: item.name }) : words('today.nextUp.voteOnGone', { john: item.name });
}

/** Needs you's meta line for a dispute: "Megan says it's not done, closes in 17h". */
export function voteMeta(dispute: DisputeView, people: readonly Person[], now: Date, words: Words): string {
  return `${words('today.nextUp.saysNotDone', { name: firstNameIn(people, dispute.raisedBy) })}, ${voteCloses(dispute.closesAt, now, words)}`;
}

/** The tally, in the vote buttons' order: "1 fine, 1 not done, closes in 17h". */
export function voteTally(dispute: DisputeView, now: Date, words: Words): string {
  return words('john.sheet.tally', { done: dispute.reject, notDone: dispute.uphold, closes: voteCloses(dispute.closesAt, now, words) });
}

/** Needs your OK's title for a kid's tick: "Leo did Feed the fish". */
export function okTitle(item: Pick<BoardItem, "userId" | "name"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>, people: readonly Person[], words: Words): string {
  return PARENT_OK_COPY.rowTitle(called(people, tickerOf(item), words), item.name);
}

/** Its meta line: "Ticked 2h ago". */
export function okMeta(item: Pick<BoardItem, "doneAt">, now: Date): string {
  return PARENT_OK_COPY.rowMeta(relative(item.doneAt ?? now, now));
}

/**
 * Above a parent's OK and Not yet: "Sam or Alex can OK it. Not yet sends it
 * back to Leo." `parentIds` are the house's parents, the viewer first as
 * "You" when they are one.
 */
export function okWho(
  item: Pick<BoardItem, "userId"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>,
  people: readonly Person[],
  parentIds: readonly string[],
  viewerId: string, words: Words,
): string {
  const names = [...parentIds]
    .sort((a, b) => (a === viewerId ? -1 : b === viewerId ? 1 : 0))
    .map((id) => (id === viewerId ? words('john.sheet.you') : called(people, id, words)));
  const parents = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return PARENT_OK_COPY.who(parents, called(people, tickerOf(item), words));
}

/** What the John sheet offers, from whose John it is and where it has got to. */
export type JohnSheetMode =
  | "yours-open"
  | "yours-checking"
  | "yours-disputed"
  | "theirs-open"
  | "theirs-checking"
  | "theirs-disputed"
  | "settled";

/**
 * The sheet's mode for a John and whoever is looking at it. A cover being
 * checked or disputed is the coverer's tick: "yours" to them, and to
 * everyone else, the John's owner included, a housemate's.
 */
export function johnSheetMode(
  item: Pick<BoardItem, "userId" | "status"> & Partial<Pick<BoardItem, "coveredBy" | "outcome" | "crew" | "absentAt">>,
  viewerId: string,
): JohnSheetMode {
  const ticks = tickerOf(item) === viewerId;
  if (item.status === "covered" && !item.outcome) return ticks ? "yours-checking" : "theirs-checking";
  // Left off a roll call: a miss once it stands, and until then it can be disputed.
  if (item.status === "missed" && item.absentAt && !item.outcome) return ticks ? "yours-checking" : "theirs-checking";
  if (SETTLED.has(item.status)) return "settled";
  const yours = item.userId === viewerId;
  // Ticked by someone else's roll call: theirs to take back, yours to dispute.
  if (item.status === "checking") return ticks ? "yours-checking" : "theirs-checking";
  if (item.status === "disputed") return ticks ? "yours-disputed" : "theirs-disputed";
  return yours ? "yours-open" : "theirs-open";
}

/**
 * The sheet's first line: "Bathroom, Upstairs bathroom, 1 pt, every
 * week" (the group when it has one; how often while its John is still on
 * the list).
 */
export function sheetKind(
  item: Pick<BoardItem, "category" | "groupName" | "points" | "everyWeeks"> & Partial<Pick<BoardItem, "flaggedAt" | "everyMonths" | "together">>, words: Words,
): string {
  // A flag comes round when it's flagged, not every N weeks.
  const often = item.flaggedAt
    ? words('john.sheet.onCall')
    : item.everyMonths
      ? oftenWords({ everyWeeks: 1, everyMonths: item.everyMonths }).toLocaleLowerCase()
      : item.everyWeeks
        ? words('john.sheet.every', { weeks: item.everyWeeks })
        : null;
  const points = (item.together?.length ?? 1) > 1 ? words('john.crew.each', { points: pointsLabel(item.points) }) : pointsLabel(item.points);
  return [johnKind(item.category), item.groupName, points, often]
    .filter(Boolean)
    .join(", ");
}

/** What lateness costs, for the sheet: "late costs £1, missed £3". Null when both are free. */
function lateCosts(rules: HouseRules, room: number | null, words: Words): string | null {
  const { late, missed } = forfeits(rules, room);
  if (late && missed) return words('john.sheet.costs', { late, missed });
  if (late) return words('john.sheet.lateCosts', { late });
  if (missed) return words('john.sheet.missedCosts', { missed });
  return null;
}

/**
 * The sheet's when line. While it's to do, when it's due and what lateness
 * costs: "Due today 21:00, late costs £1, missed £3"; once overdue, "Overdue
 * since Tue, £1 now, £3 if missed". While the house checks a tick, just
 * when it was due; while it votes, "Disputed by Megan". Once settled, what
 * happened (settledLine) in place of any cost. Overdue, disputed, late and
 * missed are said in ink after a hazard sign (`sign`, the status they
 * are), since the sheet is pavement. `room` caps the costs at what's left
 * of the owner's stake (forfeitRoom).
 */
export function sheetWhen(
  item: BoardItem,
  people: readonly Person[],
  viewerId: string,
  rules: HouseRules,
  now: Date,
  words: Words,
  room: number | null = null,
): { sign: "overdue" | "disputed" | "late" | "missed" | "covered" | null; text: string } {
  const zone = rules.timezone;
  if (item.status === "covered" && !item.outcome) {
    return { sign: "covered", text: words('john.sheet.coveredWasDue', { when: sinceLabel(item.dueAt, now, zone) }) };
  }
  if (item.status === "covered") return { sign: "covered", text: settledLine(item, people, viewerId, rules, now, words) };
  if (SETTLED.has(item.status)) {
    const sign = item.status === "late" || item.status === "missed" ? item.status : null;
    return { sign, text: settledLine(item, people, viewerId, rules, now, words) };
  }
  if (item.status === "overdue") {
    const text = [words('today.nextUp.overdueSince', { when: sinceLabel(item.dueAt, now, zone) }), overdueCost(rules, room, words)].filter(Boolean).join(", ");
    return { sign: "overdue", text };
  }
  if (item.status === "disputed" && item.dispute) {
    const raiser = item.dispute.raisedBy === viewerId ? words('john.sheet.byYou') : called(people, item.dispute.raisedBy, words);
    return { sign: "disputed", text: words('john.sheet.disputedBy', { name: raiser }) };
  }
  const due = words('john.sheet.due', { when: dueInLine(item.dueAt, now, zone) });
  if (!isOpen(item.status)) return { sign: null, text: due };
  return {
    sign: null,
    text: [item.movedFrom ? `${due}, ${words('today.nextUp.beforeYouGo')}` : due, lateCosts(rules, room, words)].filter(Boolean).join(", "),
  };
}

/** "at 14:10" today, "yesterday at 14:10", "on Sun at 14:10" this week, "on Sun 18 Oct at 14:10" before that. */
function tickedAt(at: Date, now: Date, zone: string, words: Words): string {
  const inZone = tz(zone);
  const days = differenceInCalendarDays(now, at, { in: inZone });
  const time = format(at, "HH:mm", { in: inZone });
  if (days <= 0) return words('john.sheet.at', { time });
  if (days === 1) return words('john.sheet.yesterdayAt', { time });
  return words('john.sheet.onAt', { day: format(at, days < 7 ? "EEE" : "EEE d MMM", { in: inZone }), time });
}

/**
 * A tick being checked: "Megan ticked this at 14:10, stands in 21h" ("You
 * ticked…" for yours); a cover, "Glyn covered this at 23:04, …".
 */
export function tickedLine(item: BoardItem, people: readonly Person[], viewerId: string, rules: HouseRules, now: Date, words: Words): string {
  const ticker = tickerOf(item);
  const who = ticker === viewerId ? words('john.sheet.you') : firstNameIn(people, ticker);
  const whom = item.userId === viewerId ? words('john.sheet.byYou') : firstNameIn(people, item.userId);
  const ticked = item.doneAt
    ? words(item.coveredBy ? 'john.sheet.covered' : 'john.sheet.ticked', { who, when: tickedAt(item.doneAt, now, rules.timezone, words) })
    : item.absentAt
      ? words('john.crew.without', { who, when: tickedAt(item.absentAt, now, rules.timezone, words), whom })
      : null;
  const stands = item.awaitsOk
    ? PARENT_OK_COPY.waiting
    : item.standsAt === null
      ? null
      : item.standsAt.getTime() > now.getTime()
        ? words('john.sheet.standsIn', { when: relative(item.standsAt, now) })
        : words('john.sheet.standsSoon');
  return [ticked, stands].filter(Boolean).join(", ");
}

/**
 * What happened to a settled John, in a sentence: who did it and when. What
 * lateness costs is said only while it's to do; the Stake has what it cost.
 */
export function settledLine(item: BoardItem, people: readonly Person[], viewerId: string, rules: HouseRules, now: Date, words: Words): string {
  const who = item.userId === viewerId ? words('john.sheet.you') : firstNameIn(people, item.userId);
  const ticked = item.doneAt ? tickedAt(item.doneAt, now, rules.timezone, words) : null;
  switch (item.status) {
    case "done":
      return ticked ? words('john.sheet.doneOnTimeWhen', { who, when: ticked }) : words('john.sheet.doneOnTime', { who });
    case "late":
      return ticked ? words('john.sheet.doneLateWhen', { who, when: ticked }) : words('john.sheet.doneLate', { who });
    case "excused":
      return words('john.sheet.excused', { who });
    case "missed":
      return item.absentAt ? words('john.crew.missedAbsent') : words('john.sheet.missed');
    case "covered": {
      const coverer = item.coveredBy === viewerId ? words('john.sheet.you') : firstNameIn(people, item.coveredBy);
      const yours = item.userId === viewerId;
      const owner = yours ? words('john.sheet.byYou') : called(people, item.userId, words);
      const whose = yours ? words('john.sheet.your') : `${owner}’s`;
      return ticked
        ? words('john.sheet.coveredSettledWhen', { who: coverer, owner, whose, when: ticked })
        : words('john.sheet.coveredSettled', { who: coverer, owner, whose });
    }
    default:
      return "";
  }
}

/** What the John sheet says and offers on a housemate's John you might cover. */
export interface CoverOffer {
  /** "cover": the button is live; "soon": overdue but still theirs (the grace); null: nothing to say. */
  kind: "cover" | "soon" | null;
  text: string | null;
}

/**
 * On a housemate's open John: once the grace is up, what covering it means
 * ("Sam hasn’t done it. If you do, it counts as Sam’s miss, and you get 3
 * pts and £3."); overdue inside the grace, when it opens to you; nothing
 * before it's due. The money is the missed forfeit, before any cap.
 */
export function coverOffer(item: BoardItem, people: readonly Person[], viewerId: string, rules: HouseRules, now: Date, words: Words): CoverOffer {
  const owner = called(people, item.userId, words);
  const holders = item.together ?? [item.userId];
  // On a Together John you have a place in, you tick it with the roll call.
  if (holders.includes(viewerId)) return { kind: null, text: null };
  if (canCover(item, viewerId, now, rules.coverGraceHours)) {
    const each = rules.missedForfeitMinor * holders.length;
    const money = each > 0 ? formatMoney(each, rules.currency) : null;
    if (holders.length > 1) {
      const owners = andNames(holders.map((id) => called(people, id, words)));
      const values = { owners: upperFirst(owners), points: pointsLabel(item.points * holders.length), money };
      return { kind: "cover", text: money ? words('john.crew.coverBodyMoney', values) : words('john.crew.coverBody', values) };
    }
    const values = { owner: upperFirst(owner), points: pointsLabel(item.points), money };
    return { kind: "cover", text: money ? words('john.sheet.coverBodyMoney', values) : words('john.sheet.coverBody', values) };
  }
  if (item.userId !== viewerId && item.status === "overdue") {
    const opens = coverOpensAt(item.dueAt, rules.coverGraceHours, item.closesAt);
    if (item.heldUntil && item.heldUntil > now && item.heldUntil >= opens) {
      return { kind: "soon", text: words('john.sheet.coverHeld', { owner: upperFirst(owner), when: dueInLine(item.heldUntil, now, rules.timezone) }) };
    }
    return { kind: "soon", text: words('john.sheet.coverSoon', { owner: upperFirst(owner), when: dueInLine(opens, now, rules.timezone) }) };
  }
  return { kind: null, text: null };
}

/** Needs you's title for a John you could cover: "Cover Sam’s Bins". */
export function coverTitle(item: Pick<BoardItem, "userId" | "name">, people: readonly Person[], words: Words): string {
  const owner = people.find((p) => p.userId === item.userId);
  return owner ? words('today.nextUp.coverOn', { owner: firstName(owner.name), john: item.name }) : words('today.nextUp.coverOnGone', { john: item.name });
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What "If you can't" offers on one of your open Johns: the immunity you hold, and housemates' open Johns to swap for. */
export interface CantOptions {
  /** Immunity tokens held; 0 offers no skip. */
  immunity: number;
  /** Housemates' open Johns this week, soonest first, while you hold a swap token. */
  swapFor: BoardItem[];
}

/** "If you can't" for a John: null when it isn't yours and open, or you hold nothing to spend on it. */
export function cantOptions(
  item: BoardItem,
  board: WeekBoard,
  me: { userId: string; immunityTokens: number; swapTokens: number } | null,
): CantOptions | null {
  if (!me || item.userId !== me.userId || !isOpen(item.status)) return null;
  // A flag stays with whoever was on call: only Johns due on a day trade,
  // and only ones not yet due, on both sides (use_swap, 20261129090000).
  const swapFor =
    me.swapTokens > 0 && item.flaggedAt === null && item.status !== "overdue"
      ? board.items
          .filter((i) => i.userId !== me.userId && isOpen(i.status) && i.status !== "overdue" && i.flaggedAt === null)
          // Nobody ends up with two places in one Together John.
          .filter((i) => !(item.together ?? []).includes(i.userId) && !(i.together ?? []).includes(me.userId))
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      : [];
  if (me.immunityTokens <= 0 && swapFor.length === 0) return null;
  return { immunity: Math.max(0, me.immunityTokens), swapFor };
}

/**
 * Whether a swap token can be spent this week, the "Swap ready" tag: you
 * hold one, and the swap has something to trade (cantOptions' rule: one of
 * your Johns still open, and a housemate's).
 */
export function canSwap(board: WeekBoard, me: { userId: string; swapTokens: number } | null): boolean {
  if (!me || me.swapTokens <= 0) return false;
  const swapOnly = { userId: me.userId, swapTokens: me.swapTokens, immunityTokens: 0 };
  return board.items.some((item) => (cantOptions(item, board, swapOnly)?.swapFor.length ?? 0) > 0);
}

/** A housemate's open John as the swap lists it: "Tom, today 21:00, 3 pts", or "Tom, was due Sun, 1 pt" overdue. */
export function swapMeta(item: BoardItem, people: readonly Person[], rules: HouseRules, now: Date, words: Words): string {
  const due =
    item.status === "overdue"
      ? words('today.nextUp.wasDue', { when: sinceLabel(item.dueAt, now, rules.timezone) })
      : dueInLine(item.dueAt, now, rules.timezone);
  return [firstNameIn(people, item.userId), due, pointsLabel(item.points)].join(", ");
}

/**
 * One of the swap's choices: its meta line, and what a screen reader hears.
 * Its status's word (overdue, due soon) is always said, and leads the meta
 * once it's picked, when the tick takes its mark's place.
 */
export function swapChoice(
  item: BoardItem,
  people: readonly Person[],
  rules: HouseRules,
  now: Date,
  chosen: boolean, words: Words,
): { meta: string; label: string } {
  const meta = swapMeta(item, people, rules, now, words);
  const word = STATUS_MARK[item.status].tone === "none" ? null : STATUS_LABEL[item.status];
  return {
    meta: chosen && word ? `${word}, ${meta}` : meta,
    label: [item.name, word, meta].filter(Boolean).join(", "),
  };
}

/**
 * What undoing a tick of yours costs, before it's undone: nothing before
 * the John's due time, or when the tick was late already. After it, the
 * John is overdue at once and ticking it again counts as late, so this says
 * so, and what late costs (capped at `room`, what's left of your stake).
 * Null when an undo costs nothing.
 */
export function undoWarning(
  item: Pick<BoardItem, "dueAt" | "doneAt"> & { coveredBy?: string | null },
  rules: HouseRules,
  now: Date,
  words: Words,
  room: number | null = null,
): string | null {
  // Taking back a cover only hands the John back to its owner: nothing of yours turns late.
  if (item.coveredBy) return null;
  if (now.getTime() <= item.dueAt.getTime()) return null;
  if (item.doneAt && item.doneAt.getTime() > item.dueAt.getTime()) return null;
  const late = forfeits(rules, room).late;
  return late ? words('john.sheet.undoLateCost', { late }) : words('john.sheet.undoLate');
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
    ...swapsFor(input),
  };
}

/** Today's swaps, once everyone's preferences and the open asks are read. */
function swapsFor(input: Parameters<typeof todayPage>[0]): Pick<TodayPage, "swap" | "offers"> {
  const { offers, now } = input;
  if (!offers || !now) return { swap: null, offers: [] };
  const members = input.members.map((m) => ({ userId: m.userId, name: m.name, prefs: m.prefs ?? NO_PREFS }));
  const args = { items: input.board.items, viewerId: input.userId, members, offers, now };
  return { swap: swapAsk(args), offers: swapOffersToYou(args) };
}

/** How your share catches up after time away, by houses.away_makeup: in full, half of it, or none (it goes to whoever's home). */
export function awayShare(makeup: number): "full" | "half" | "none" {
  return makeup >= 100 ? "full" : makeup > 0 ? "half" : "none";
}
