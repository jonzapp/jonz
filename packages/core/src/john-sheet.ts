import { tz } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";
import { isOpen } from "./board-views";
import { type BoardItem, type DisputeView, type WeekBoard } from "./board";
import { andNames } from "./crew";
import type { HouseRules } from "./domain";
import { dateIn, dueInLine, firstName, pointsLabel, relative, sinceLabel, statusLabel, STATUS_MARK } from "./format";
import { johnKind } from "./john-row";
import { formatMoney } from "./money";
import { canCover, coverOpensAt } from "./outcome";
import { oftenWords } from "./repeat";
import { called, firstNameIn, forfeits, overdueCost, SETTLED, tickerOf, type Person } from "./today-parts";
import type { Viewing } from "./viewing";
import type { Words } from "./words-for";
import { localDate } from "./week";
import { clocksDiffer } from "./zones";

// The John sheet and the cards beside it: a vote, a parent's OK, a
// settled John's lines, covering, swapping and undoing. Words only; the
// database decides what's allowed.

/** "closes in 17h", or "closing now" once its time has come and the clock hasn't closed it yet. */
export function voteCloses(closesAt: Date, now: Date, words: Words): string {
  return closesAt.getTime() > now.getTime() ? words('today.nextUp.closes', { when: relative(closesAt, now, words) }) : words('today.nextUp.closingNow');
}

/** Needs you's title for a dispute: "Vote on Priya’s Clean the bathroom" ("Vote on Clean the bathroom" once she's left). */
export function voteTitle(item: Pick<BoardItem, "userId" | "name">, people: readonly Person[], words: Words): string {
  const owner = people.find((p) => p.userId === item.userId);
  return owner ? words('today.nextUp.voteOn', { owner: firstName(owner.name), john: item.name }) : words('today.nextUp.voteOnGone', { john: item.name });
}

/** Needs you's meta line for a dispute: "Megan says it's not done, closes in 17h". */
export function voteMeta(dispute: DisputeView, people: readonly Person[], now: Date, words: Words): string {
  return `${words('today.nextUp.saysNotDone', { name: firstNameIn(people, dispute.raisedBy, words) })}, ${voteCloses(dispute.closesAt, now, words)}`;
}

/** The tally, in the vote buttons' order: "1 fine, 1 not done, closes in 17h". */
export function voteTally(dispute: DisputeView, now: Date, words: Words): string {
  return words('john.sheet.tally', { done: dispute.reject, notDone: dispute.uphold, closes: voteCloses(dispute.closesAt, now, words) });
}

/** Needs your OK's title for a kid's tick: "Leo did Feed the fish". */
export function okTitle(item: Pick<BoardItem, "userId" | "name"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>, people: readonly Person[], words: Words): string {
  return words('today.parentOk.rowTitle', { kid: called(people, tickerOf(item), words), john: item.name });
}

/** Its meta line: "Ticked 2h ago". */
export function okMeta(item: Pick<BoardItem, "doneAt">, now: Date, words: Words): string {
  return words('today.parentOk.rowMeta', { ago: relative(item.doneAt ?? now, now, words) });
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
  return words('today.parentOk.who', { parents, kid: called(people, tickerOf(item), words) });
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
  item: Pick<BoardItem, "category" | "groupName" | "points" | "everyWeeks"> & Partial<Pick<BoardItem, "kindName" | "flaggedAt" | "everyMonths" | "together">>, words: Words,
): string {
  // A flag comes round when it's flagged, not every N weeks.
  const often = item.flaggedAt
    ? words('john.sheet.onCall')
    : item.everyMonths
      ? oftenWords({ everyWeeks: 1, everyMonths: item.everyMonths }, words).toLocaleLowerCase()
      : item.everyWeeks
        ? words('john.sheet.every', { weeks: item.everyWeeks })
        : null;
  const points = (item.together?.length ?? 1) > 1 ? words('john.crew.each', { points: pointsLabel(item.points, words) }) : pointsLabel(item.points, words);
  return [johnKind(item.category, item.kindName), item.groupName, points, often]
    .filter(Boolean)
    .join(", ");
}

/** What lateness costs, for the sheet: "late costs £1, missed £3". Null when both are free. */
function lateCosts(rules: HouseRules, room: number | null, words: Words): string | null {
  const { late, missed } = forfeits(rules, room, words);
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
  viewing: Viewing,
  room: number | null = null,
): { sign: "overdue" | "disputed" | "late" | "missed" | "covered" | null; text: string } {
  const { people, viewerId, rules, now, zone, words } = viewing;
  if (item.status === "covered" && !item.outcome) {
    return { sign: "covered", text: words('john.sheet.coveredWasDue', { when: sinceLabel(item.dueAt, now, zone, words) }) };
  }
  if (item.status === "covered") return { sign: "covered", text: settledLine(item, viewing) };
  if (SETTLED.has(item.status)) {
    const sign = item.status === "late" || item.status === "missed" ? item.status : null;
    return { sign, text: settledLine(item, viewing) };
  }
  if (item.status === "overdue") {
    const text = [words('today.nextUp.overdueSince', { when: sinceLabel(item.dueAt, now, zone, words) }), overdueCost(rules, room, words)].filter(Boolean).join(", ");
    return { sign: "overdue", text };
  }
  if (item.status === "disputed" && item.dispute) {
    const raiser = item.dispute.raisedBy === viewerId ? words('john.sheet.byYou') : called(people, item.dispute.raisedBy, words);
    return { sign: "disputed", text: words('john.sheet.disputedBy', { name: raiser }) };
  }
  const due = words('john.sheet.due', { when: withHouseTime(item.dueAt, viewing) });
  if (!isOpen(item.status)) return { sign: null, text: due };
  return {
    sign: null,
    text: [item.movedFrom ? `${due}, ${words('today.nextUp.beforeYouGo')}` : due, lateCosts(rules, room, words)].filter(Boolean).join(", "),
  };
}

/**
 * When a John is due, as its sheet says it: "today 21:00", and when the
 * reader's clock isn't the house's, the house's time after it, "tomorrow
 * 15:00 (21:00 house time)", with its day when that's another day there.
 */
function withHouseTime(dueAt: Date, { rules, now, zone, words }: Viewing): string {
  const due = dueInLine(dueAt, now, zone, words);
  if (!clocksDiffer(zone, rules.timezone, dueAt)) return due;
  const house = rules.timezone;
  const sameDay = localDate(dueAt, house) === localDate(dueAt, zone);
  const time = dateIn(dueAt, "time", house, words);
  const there = sameDay ? time : words("common.date.weekdayTime", { day: dateIn(dueAt, "weekday", house, words), time });
  return `${due} (${words("common.zone.houseTime", { time: there })})`;
}

/** "at 14:10" today, "yesterday at 14:10", "on Sun at 14:10" this week, "on Sun 18 Oct at 14:10" before that. */
function tickedAt(at: Date, now: Date, zone: string, words: Words): string {
  const inZone = tz(zone);
  const days = differenceInCalendarDays(now, at, { in: inZone });
  const time = dateIn(at, "time", zone, words);
  if (days <= 0) return words('john.sheet.at', { time });
  if (days === 1) return words('john.sheet.yesterdayAt', { time });
  return words('john.sheet.onAt', { day: dateIn(at, days < 7 ? "weekday" : "weekdayDayMonth", zone, words), time });
}

/**
 * A tick being checked: "Megan ticked this at 14:10, stands in 21h" ("You
 * ticked…" for yours); a cover, "Glyn covered this at 23:04, …".
 */
export function tickedLine(item: BoardItem, { people, viewerId, now, zone, words }: Viewing): string {
  const ticker = tickerOf(item);
  const who = ticker === viewerId ? words('john.sheet.you') : firstNameIn(people, ticker, words);
  const whom = item.userId === viewerId ? words('john.sheet.byYou') : firstNameIn(people, item.userId, words);
  const ticked = item.doneAt
    ? words(item.coveredBy ? 'john.sheet.covered' : 'john.sheet.ticked', { who, when: tickedAt(item.doneAt, now, zone, words) })
    : item.absentAt
      ? words('john.crew.without', { who, when: tickedAt(item.absentAt, now, zone, words), whom })
      : null;
  const stands = item.awaitsOk
    ? words('today.parentOk.waiting')
    : item.standsAt === null
      ? null
      : item.standsAt.getTime() > now.getTime()
        ? words('john.sheet.standsIn', { when: relative(item.standsAt, now, words) })
        : words('john.sheet.standsSoon');
  return [ticked, stands].filter(Boolean).join(", ");
}

/**
 * What happened to a settled John, in a sentence: who did it and when. What
 * lateness costs is said only while it's to do; the Stake has what it cost.
 */
export function settledLine(item: BoardItem, { people, viewerId, now, zone, words }: Viewing): string {
  const who = item.userId === viewerId ? words('john.sheet.you') : firstNameIn(people, item.userId, words);
  const ticked = item.doneAt ? tickedAt(item.doneAt, now, zone, words) : null;
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
      const coverer = item.coveredBy === viewerId ? words('john.sheet.you') : firstNameIn(people, item.coveredBy, words);
      const yours = item.userId === viewerId;
      const owner = yours ? words('john.sheet.byYou') : called(people, item.userId, words);
      const whose = yours ? words('john.sheet.your') : words('wall.feed.whose', { name: owner });
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
export function coverOffer(item: BoardItem, { people, viewerId, rules, now, zone, words }: Viewing): CoverOffer {
  const owner = called(people, item.userId, words);
  const holders = item.together ?? [item.userId];
  // On a Together John you have a place in, you tick it with the roll call.
  if (holders.includes(viewerId)) return { kind: null, text: null };
  if (canCover(item, viewerId, now, rules.coverGraceHours)) {
    const each = rules.missedForfeitMinor * holders.length;
    const money = each > 0 ? formatMoney(each, rules.currency, words) : null;
    if (holders.length > 1) {
      const owners = andNames(holders.map((id) => called(people, id, words)), words);
      const values = { owners: upperFirst(owners), points: pointsLabel(item.points * holders.length, words), money };
      return { kind: "cover", text: money ? words('john.crew.coverBodyMoney', values) : words('john.crew.coverBody', values) };
    }
    const values = { owner: upperFirst(owner), points: pointsLabel(item.points, words), money };
    return { kind: "cover", text: money ? words('john.sheet.coverBodyMoney', values) : words('john.sheet.coverBody', values) };
  }
  if (item.userId !== viewerId && item.status === "overdue") {
    const opens = coverOpensAt(item.dueAt, rules.coverGraceHours, item.closesAt);
    if (item.heldUntil && item.heldUntil > now && item.heldUntil >= opens) {
      return { kind: "soon", text: words('john.sheet.coverHeld', { owner: upperFirst(owner), when: dueInLine(item.heldUntil, now, zone, words) }) };
    }
    return { kind: "soon", text: words('john.sheet.coverSoon', { owner: upperFirst(owner), when: dueInLine(opens, now, zone, words) }) };
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
export function swapMeta(item: BoardItem, { people, now, zone, words }: Viewing): string {
  const due =
    item.status === "overdue"
      ? words('today.nextUp.wasDue', { when: sinceLabel(item.dueAt, now, zone, words) })
      : dueInLine(item.dueAt, now, zone, words);
  return [firstNameIn(people, item.userId, words), due, pointsLabel(item.points, words)].join(", ");
}

/**
 * One of the swap's choices: its meta line, and what a screen reader hears.
 * Its status's word (overdue, due soon) is always said, and leads the meta
 * once it's picked, when the tick takes its mark's place.
 */
export function swapChoice(item: BoardItem, viewing: Viewing, chosen: boolean): { meta: string; label: string } {
  const { words } = viewing;
  const meta = swapMeta(item, viewing);
  const word = STATUS_MARK[item.status].tone === "none" ? null : statusLabel(item.status, words);
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
  const late = forfeits(rules, room, words).late;
  return late ? words('john.sheet.undoLateCost', { late }) : words('john.sheet.undoLate');
}
