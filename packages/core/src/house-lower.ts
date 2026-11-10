import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import type { AwayPeriod } from "./away";
import { weeklyEffort, type JohnDef } from "./board";
import type { Currency, HouseKind, HouseRules } from "./domain";
import { dateRange, dayLabel, firstName, STATUS_MARK, type StatusIcon } from "./format";
import { monthWord } from "./house-page";
import { undoneWhat } from "./history";
import { formatMoney } from "./money";
import type { LiveStatus } from "./outcome";
import { pocketMoney } from "./pocket";
import { resetWhat } from "./resets";
import type { Transfer } from "./stake";
import { wordsFor, type Words } from "./words-for";
import { REACTABLE, REACTIONS, type Part, type ReactionKind, type WallEvent, type WallIcon } from "./wall";
import { addDaysTo, localDate } from "./week";
import { nameList, perWeekLine, rowLabel, rulesLine } from "./word-keys";

// House's lower half, as both the House tab and the whole Wall show it: each
// event as a row's one sentence with first names and its meta line, the
// Wall by day with repeats folded, a payment's amount only for the two
// people in it, the setup rows' values, and what leaving costs. Pure: every
// function that needs the time takes `now`.

/** Someone in the house, as the Wall names them: first names in sentences, the full name for initials. */
export interface WallPerson {
  userId: string;
  name: string;
}

/** What a Wall row needs besides the event: who's looking, who lives here, and the house's clock. */
export interface WallScene {
  /** The viewer, who is "You" in the sentences. */
  me: string;
  members: readonly WallPerson[];
  currency: Currency;
  zone: string;
  now: Date;
  /** Where this week's Johns have got to, by assignment id (the board's), for a tick's meta line. */
  statusOf?: (assignmentId: string) => LiveStatus | undefined;
  /** When the house last struck out a tick on each John, by assignment id (`struckAt`), for older weeks. */
  struck?: ReadonlyMap<string, Date>;
  /** The time as a clock ("14:10"), for the Wall's days; otherwise how long ago ("3h"), for House. */
  clock?: boolean;
  /** The reader's words: a family's Wall says "joined the family" where housemates "moved in". Housemates' English when left out. */
  words?: Words;
}

/**
 * The five kinds of news on the Wall, each with one plate colour: done
 * (green), trouble (hazard: a miss, a dispute, a tick struck out), needs
 * doing (amber, only while a flag is open), perks (ink: immunity and swaps)
 * and notices (pavement: everything else, a settled flag too).
 */
export type WallFamily = "done" | "trouble" | "flag" | "perk" | "notice";

/** One event as a row: who leads it, one sentence, and one meta line. */
export interface WallFeedRow {
  id: string;
  kind: string;
  at: Date;
  /** Whose plate leads the row: null for the house's own news, or someone who has left (an icon leads instead). */
  actor: { userId: string; name: string; me: boolean } | null;
  icon: WallIcon;
  /** Which of the five kinds of news it is: its plate's colour. */
  family: WallFamily;
  title: string;
  /** The sentence in runs, names and Johns in bold. */
  parts: Part[];
  /** A flag still open: how long is left ("11h left"), or how late it is. Null once it's settled. */
  open: { left: string; late: boolean } | null;
  /** The meta line's words before the time (a dispute's reason in quotes): they truncate, the time never does. */
  detail: string | null;
  /**
   * The status mark before those words, from the one status map, for how a
   * John went wrong: late a clock, missed or struck out an X, disputed a
   * flag. Null for everything else.
   */
  mark: StatusIcon | null;
  when: string;
  /** Housemates can react to it: it's about how a John went. */
  reactable: boolean;
  /** A housemate's tick, which carries the one "Nice one" toggle. */
  nice: boolean;
  /** The reaction the house gave most, for where there's no toggle; null before anyone reacts. */
  top: { kind: ReactionKind; count: number } | null;
  /** Every reaction, counted, with yours marked. */
  reactions: WallEvent["reactions"];
  /**
   * This week's John it's about, while it's on the board: tapping the row
   * opens its John sheet, at the vote while its dispute waits on the viewer.
   */
  board: { assignmentId: string; vote: boolean } | null;
  /** The meta line's words in full, then the day and the time on a line of their own. */
  full: string;
  /** What a screen reader says for the row: the sentence, then the meta line. */
  label: string;
  /** The John it's about, if any (a photo's label). */
  john: string | null;
  photoPath: string | null;
  /** What makes several in a row one fold ("tick:sam"); null for news that never folds. */
  repeat: string | null;
  /** The sentence's subject ("Megan", "You"), for a fold's label. */
  who: string;
}

/** How a sentence names someone: as its subject, mid-sentence, and as an owner. */
interface Named {
  subject: string;
  object: string;
  possessive: string;
  you: boolean;
}

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function named(userId: string | null | undefined, me: string, members: readonly WallPerson[], words: Words): Named {
  if (userId && userId === me) {
    return { subject: words('wall.feed.you'), object: words('wall.feed.youObject'), possessive: words('wall.feed.your'), you: true };
  }
  const member = userId ? members.find((m) => m.userId === userId) : undefined;
  if (member) {
    const first = firstName(member.name);
    return { subject: first, object: first, possessive: `${first}’s`, you: false };
  }
  // Someone the event doesn't name, or who has since left the house.
  const nobody = userId ? words('common.shell.formerHousemate') : words('wall.feed.someone');
  return { subject: nobody, object: lowerFirst(nobody), possessive: `${lowerFirst(nobody)}’s`, you: false };
}

/** "September" from "2026-09"; null for anything that isn't a month. */
function monthName(month: string): string | null {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return format(new Date(Date.UTC(y, m - 1, 15)), "MMMM", { in: tz("UTC") });
}

/** A day as the Wall names it: "Today", "Yesterday", else "Sat 24 Oct", in the house's zone. */
function dayName(at: Date, zone: string, now: Date, words: Words): string {
  const date = localDate(at, zone);
  const today = localDate(now, zone);
  if (date === today) return words('wall.feed.today');
  if (date === addDaysTo(today, -1)) return words('wall.feed.yesterday');
  return dayLabel(at, zone);
}

/** How long ago, for a meta line: "just now", "5 min", "3h", "2 days", then the date ("12 Oct"). */
export function wallAge(at: Date, now: Date, zone: string, words: Words): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return words('wall.feed.justNow');
  if (minutes < 60) return words('wall.feed.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words('wall.feed.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return words('wall.feed.days', { n: days });
  return format(at, "d MMM", { in: tz(zone) });
}

/** A payment's amount is for the two people in it: who paid and who was paid. */
export function paymentShown(event: Pick<WallEvent, "userId" | "data">, viewer: string): boolean {
  return event.userId === viewer || event.data.to === viewer;
}

/** The reaction the house gave most (the first in REACTIONS on a tie), or null when nobody has reacted. */
export function topReaction(reactions: WallEvent["reactions"]): { kind: ReactionKind; count: number } | null {
  let top: { kind: ReactionKind; count: number } | null = null;
  for (const kind of REACTIONS) {
    const count = reactions[kind].count;
    if (count > 0 && (top === null || count > top.count)) top = { kind, count };
  }
  return top;
}

/**
 * When the house struck out a tick on each John, by assignment id: the
 * latest verdict against it among `events`. A tick from before then was the
 * one struck out.
 */
export function struckAt(events: readonly WallEvent[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const e of events) {
    if (e.kind !== "upheld" || !e.assignmentId) continue;
    const seen = out.get(e.assignmentId);
    if (!seen || e.createdAt > seen) out.set(e.assignmentId, e.createdAt);
  }
  return out;
}

/**
 * A tick's meta words, and the mark before them: from where its John has got
 * to on this week's board when it's there, else from whether the house
 * struck it out since.
 */
function tickDetail(event: WallEvent, scene: WallScene, words: Words): { detail: string; mark: StatusIcon | null } {
  const id = event.assignmentId;
  const status = id ? scene.statusOf?.(id) : undefined;
  const struck = id ? scene.struck?.get(id) : undefined;
  const struckOut = { detail: words('wall.feed.struck'), mark: STATUS_MARK.missed.icon };
  if (status === "disputed") return { detail: words('wall.feed.disputedTick'), mark: STATUS_MARK.disputed.icon };
  // Undoing a tick takes its event away, so a ticked John that's open again was struck out.
  if (status === "upcoming" || status === "due-soon" || status === "overdue" || status === "missed") return struckOut;
  if (!status && struck && event.createdAt < struck) return struckOut;
  if (event.kind === "late") return { detail: words('wall.feed.late'), mark: STATUS_MARK.late.icon };
  return { detail: status === "checking" ? words('wall.feed.checking') : words('wall.feed.onTime'), mark: null };
}

const ICON: Record<string, WallIcon> = {
  done: "check",
  late: "check",
  missed: "x",
  covered: "check",
  disputed: "gavel",
  flagged: "flag",
  upheld: "gavel",
  rejected: "gavel",
  immunity_earned: "shield",
  immunity_used: "shield",
  swap_earned: "repeat",
  swap_used: "repeat",
  away: "plane",
  joined: "user-plus",
  kind_changed: "home",
  moving_out: "truck",
  moved_out: "truck",
  month_closed: "calendar-check",
  paid: "banknote",
  undone: "undo",
  reset: "undo",
  jonz_message: "megaphone",
  okayed: "badge-check",
  not_yet: "undo",
  pocket_paid: "banknote",
};

const FAMILY: Record<string, WallFamily> = {
  done: "done",
  late: "done",
  covered: "done",
  rejected: "done",
  okayed: "done",
  missed: "trouble",
  not_yet: "trouble",
  disputed: "trouble",
  upheld: "trouble",
  immunity_earned: "perk",
  immunity_used: "perk",
  swap_earned: "perk",
  swap_used: "perk",
};

const OPEN: ReadonlySet<LiveStatus> = new Set(["upcoming", "due-soon", "overdue"]);

/** "11h left", "40 min late": from now to when a flag is due. */
function countdown(due: Date, now: Date, words: Words): { left: string; late: boolean } {
  const minutes = Math.round((due.getTime() - now.getTime()) / 60_000);
  const late = minutes < 0;
  const m = Math.abs(minutes);
  const id = late ? "wall.feed.lateBy" : "wall.feed.left";
  const [n, unit] = m >= 60 ? [Math.floor(m / 60), "h"] : [Math.max(m, 1), "min"];
  return { left: words(id, { n, unit }), late };
}

/** The sentence in runs: each of `bold` (names, Johns) set in bold wherever it appears. */
function boldRuns(title: string, bold: readonly string[]): Part[] {
  const words = [...new Set(bold.filter((w) => w.length > 0))].sort((a, b) => b.length - a.length);
  if (words.length === 0) return [{ text: title }];
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return title
    .split(pattern)
    .filter((text) => text.length > 0)
    .map((text) => (words.includes(text) ? { text, bold: true } : { text }));
}

/** The house's own news: nobody's plate leads it. */
const HOUSE_NEWS = new Set(["upheld", "rejected", "month_closed", "jonz_message"]);

/**
 * One event as a row, from where the viewer stands: one sentence with first
 * names ("Megan ticked Wipe down the kitchen", "You’re away 29 Oct–1 Nov"),
 * and the meta line's words ("Checking", the dispute's reason in quotes,
 * "Time away") before the time. A payment names its amount only to the two
 * people in it; everyone else reads that it was paid.
 */
export function wallFeedRow(event: WallEvent, scene: WallScene, words: Words): WallFeedRow {
  const { me, members } = scene;
  const say = scene.words ?? wordsFor("en", "housemates");
  const who = named(event.userId, me, members, words);
  const john = typeof event.data.name === "string" ? event.data.name : null;
  const johnName = john ?? words('wall.feed.aJohn');
  const text = (key: string) => (typeof event.data[key] === "string" ? (event.data[key] as string) : "");

  let title: string;
  let detail: string | null = null;
  // The names and Johns the sentence sets in bold.
  let bold: string[] = [who.subject, johnName];
  let open: WallFeedRow["open"] = null;
  // Who leads the row, when it isn't whoever the event is about.
  let lead = event.userId;
  let mark: StatusIcon | null = null;
  let repeat: string | null = null;
  // Whose John it is: the ticker, or the one a dispute or a verdict is against.
  let owner = event.userId;
  switch (event.kind) {
    case "done":
    case "late":
      title = words('wall.feed.ticked', { who: who.subject, john: johnName });
      ({ detail, mark } = tickDetail(event, scene, words));
      repeat = `tick:${event.userId}`;
      break;
    case "covered": {
      // The John was someone else's: theirs is the miss, the coverer's the tick.
      const whose = named(text("for") || null, me, members, words);
      title = words('wall.feed.covered', { who: who.subject, whose: whose.possessive, john: johnName });
      bold.push(whose.subject);
      ({ detail, mark } = tickDetail(event, scene, words));
      if (detail === words('wall.feed.onTime')) detail = words('wall.feed.coveredWord');
      repeat = `covered:${event.userId}`;
      break;
    }
    case "missed":
      title = words('wall.feed.missed', { who: who.subject, john: johnName });
      detail = words('wall.feed.missedWord');
      mark = STATUS_MARK.missed.icon;
      repeat = `missed:${event.userId}`;
      break;
    case "disputed": {
      owner = text("against") || null;
      const against = named(owner, me, members, words);
      title = words('wall.feed.disputed', { who: who.subject, whose: against.possessive, john: johnName });
      bold.push(against.subject);
      detail = text("reason") ? `“${text("reason")}”` : null;
      break;
    }
    case "upheld":
    case "rejected": {
      owner = text("against") || null;
      const whose = upperFirst(named(owner, me, members, words).possessive);
      bold = [johnName, named(owner, me, members, words).subject];
      title = event.kind === "upheld" ? words('wall.feed.struckOut', { whose, john: johnName }) : words('wall.feed.stands', { whose, john: johnName });
      detail = words('wall.feed.voted');
      break;
    }
    case "immunity_earned":
      title = words('wall.feed.earnedImmunity', { who: who.subject });
      detail = words('wall.feed.clean', { weeks: Number(event.data.streak ?? 0) });
      break;
    case "swap_earned":
      title = words('wall.feed.toppedWeek', { who: who.subject });
      detail = words('wall.feed.swapEarned');
      break;
    case "immunity_used":
      title = words('wall.feed.skipped', { who: who.subject, john: johnName });
      detail = words('wall.feed.immunityUsed');
      break;
    case "swap_used":
      title = words('wall.feed.swapped', { who: who.subject, gave: text("gave"), whose: named(text("with") || null, me, members, words).possessive, took: text("took") });
      bold = [who.subject, text("gave"), text("took"), named(text("with") || null, me, members, words).subject];
      detail = words('wall.feed.swap');
      break;
    case "away": {
      const range = dateRange(text("starts_on"), text("ends_on"));
      const moved = Number(event.data.moved ?? 0);
      title = who.you ? words('wall.feed.youAway', { range }) : words('wall.feed.away', { who: who.subject, range });
      detail = moved > 0 ? words('wall.feed.awayMoved', { due: words('wall.feed.dueBefore', { n: moved, you: who.you }) }) : words('wall.feed.timeAway');
      break;
    }
    case "flagged": {
      // The event is the holder's; `by` flagged it, null when the clock flagged it again after a miss.
      const by = text("by") || null;
      const flagger = named(by, me, members, words);
      if (!by) title = words('wall.feed.flaggedAgain', { john: johnName });
      else if (by === event.userId) title = words('wall.feed.flaggedOwn', { who: who.subject, john: johnName });
      else title = words('wall.feed.flagged', { by: flagger.subject, john: johnName, whom: who.object });
      bold = [johnName, who.subject, who.object, ...(by ? [flagger.subject] : [])];
      lead = by;
      const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
      const due = text("due_at") ? new Date(text("due_at")) : null;
      if (status && OPEN.has(status)) {
        const onCall = words('wall.feed.onCall', { who: who.subject, you: who.you });
        if (due && !Number.isNaN(due.getTime())) {
          const sameDay = localDate(due, scene.zone) === localDate(scene.now, scene.zone);
          const clock = format(due, sameDay ? "HH:mm" : "EEE HH:mm", { in: tz(scene.zone) });
          detail = words('wall.feed.dueBy', { onCall, when: clock });
          open = countdown(due, scene.now, words);
        } else {
          detail = onCall;
          open = { left: words('wall.feed.onCallWord'), late: status === "overdue" };
        }
        if (status === "overdue") open = { ...open, late: true };
      } else if (status === "done" || status === "late") {
        detail = words('wall.feed.flagDid', { who: who.subject });
      } else if (status === "checking" || status === "disputed") {
        detail = words('wall.feed.flagTicked', { who: who.subject });
      } else if (status === "missed") {
        detail = words('wall.feed.flagMissed', { who: who.subject });
        mark = STATUS_MARK.missed.icon;
      } else if (status === "covered") {
        detail = words('wall.feed.flagCovered');
      } else {
        detail = words('wall.feed.flagWas', { who: who.subject });
      }
      break;
    }
    case "undone": {
      // An admin took back someone else's move: the admin leads.
      const by = named(text("by") || null, me, members, words);
      title = words('wall.feed.undid', { by: by.subject, whose: who.possessive, what: undoneWhat(text("what"), john, words) });
      bold = [by.subject, who.subject, johnName];
      lead = text("by") || null;
      detail = say("wall.feed.adminFix");
      break;
    }
    case "reset": {
      const subject = named(text("subject") || null, me, members, words);
      title = words("wall.history.line.reset", { who: who.subject, what: resetWhat(event.data, subject.subject, words) });
      bold = [who.subject, subject.subject, johnName];
      detail = say("wall.feed.adminFix");
      break;
    }
    case "okayed":
    case "not_yet": {
      // A parent's answer to a kid's tick, in a family.
      owner = text("against") || null;
      const kid = named(owner, me, members, words);
      title = words(event.kind === "okayed" ? "wall.feed.okayed" : "wall.feed.notYet", { who: who.subject, whose: kid.possessive, john: johnName });
      bold.push(kid.subject);
      detail = event.kind === "okayed" ? null : words("wall.feed.openAgain");
      break;
    }
    case "pocket_paid": {
      const to = named(text("to") || null, me, members, words);
      title = words("wall.feed.pocketPaid", {
        who: who.subject,
        whom: to.object,
        amount: pocketMoney(Number(event.data.amount ?? 0), scene.currency),
        month: monthWord(text("month")),
      });
      bold = [who.subject, to.subject];
      detail = words("house.pocket.card");
      break;
    }
    case "joined":
      title = say("wall.feed.joined", { who: who.subject });
      detail = say("wall.feed.newMember");
      break;
    case "moving_out": {
      const on = text("on");
      title = on ? words("house.moving.movesOut", { who: who.subject, you: who.you, day: dateRange(on, on) }) : words("house.moving.stayingAfterAll", { who: who.subject, you: who.you });
      detail = words('house.moving.movingDetail');
      break;
    }
    case "moved_out": {
      // They've gone, so the house can't name them: the post kept their name.
      const was = text("who");
      const subject = event.userId === me || !was ? who.subject : firstName(was);
      title = words('house.moving.movedOut', { who: subject });
      bold = [subject];
      detail = words('house.moving.movingDetail');
      break;
    }
    case "jonz_message":
      // A message from Jonz itself: its subject, and its words to read in full.
      title = text("subject") || words('wall.feed.fromJonz');
      bold = [];
      detail = text("body") || null;
      lead = null;
      break;
    case "kind_changed": {
      // Rules' Who lives here: a family from the 1st, kept, housemates again, or a family now.
      const on = text("on");
      if (on) {
        title = words("house.kindSwitch.wall.later", { who: who.subject, on: dateRange(on, on) });
        detail = words("house.kindSwitch.wall.laterDetail");
      } else if (event.data.kept) {
        title = words("house.kindSwitch.wall.kept", { who: who.subject });
      } else if (event.data.kind !== "family") {
        title = words("house.kindSwitch.wall.housemates", { who: who.subject });
        detail = words("house.kindSwitch.wall.housematesDetail");
      } else {
        title = event.userId ? words("house.kindSwitch.wall.family", { who: who.subject }) : words("house.kindSwitch.wall.familyNow");
        bold = event.userId ? bold : [];
        detail = words("house.kindSwitch.wall.familyDetail");
      }
      break;
    }
    case "month_closed":
      {
        const month = monthName(text("month"));
        title = month ? words("wall.feed.monthClosed", { month }) : words("wall.feed.monthClosedAny");
      }
      detail = words('wall.feed.sharedOut');
      break;
    case "paid": {
      const to = named(text("to") || null, me, members, words);
      const amount = formatMoney(Number(event.data.amount ?? 0), scene.currency);
      title = !paymentShown(event, me)
        ? words('wall.feed.paid', { who: who.subject, whom: to.object })
        : who.you
          ? words('wall.feed.youPaid', { whom: to.object, amount })
          : words('wall.feed.paidYou', { who: who.subject, amount });
      detail = words('wall.feed.settled');
      break;
    }
    default:
      title = event.kind;
  }

  const member = members.find((m) => m.userId === lead);
  const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
  const when = scene.clock
    ? format(event.createdAt, "HH:mm", { in: tz(scene.zone) })
    : wallAge(event.createdAt, scene.now, scene.zone, words);
  const stamp = words('wall.feed.stamp', { day: dayName(event.createdAt, scene.zone, scene.now, words), clock: format(event.createdAt, "HH:mm", { in: tz(scene.zone) }) });
  return {
    id: event.id,
    kind: event.kind,
    at: event.createdAt,
    actor:
      HOUSE_NEWS.has(event.kind) || !lead || !member ? null : { userId: lead, name: member.name, me: lead === me },
    icon: ICON[event.kind] ?? "badge-check",
    family: open ? "flag" : (FAMILY[event.kind] ?? "notice"),
    title,
    parts: boldRuns(title, bold),
    open,
    detail,
    mark,
    when,
    reactable: REACTABLE.has(event.kind),
    nice: (event.kind === "done" || event.kind === "late" || event.kind === "covered") && event.userId !== me,
    top: topReaction(event.reactions),
    reactions: event.reactions,
    board:
      event.assignmentId && status
        ? { assignmentId: event.assignmentId, vote: status === "disputed" && owner !== me }
        : null,
    full: detail ? `${detail}\n${stamp}` : stamp,
    label: rowLabel(words, title, open ? `${detail ?? ""}, ${open.left}` : detail, when),
    john,
    photoPath: event.photoPath,
    repeat,
    who: who.subject,
  };
}

/** Several rows in a row by one person ("Megan ticked 3 Johns"), folded into one. */
export interface WallFold {
  id: string;
  label: string;
  /** Under the label, for a day's on-time ticks: who ticked ("Sam, Jo and you"). */
  detail?: string;
  rows: WallFeedRow[];
}

/** One day on the Wall: its label ("Today", "Yesterday", "Mon 26 Oct") and its rows, repeats folded. */
export interface WallDay {
  date: string;
  label: string;
  /** The date beside "Today" or "Yesterday" ("Thu 29 Oct"); null when the label is the date. */
  sub: string | null;
  items: ({ row: WallFeedRow } | { fold: WallFold })[];
}

function foldLabel(rows: readonly WallFeedRow[], words: Words): string {
  const first = rows[0];
  return first.kind === "missed"
    ? words('wall.feed.missedMany', { who: first.who, n: rows.length })
    : words('wall.feed.tickedMany', { who: first.who, n: rows.length });
}

/** A tick made on time with nothing open on it: the day's quiet news. */
function onTimeTick(row: WallFeedRow, words: Words): boolean {
  return row.kind === "done" && row.open === null && row.detail === words('wall.feed.onTime');
}

/** Who ticked, each once in the order read, "you" in lower case after the first: "Sam, Jo and you". */
function tickers(rows: readonly WallFeedRow[], words: Words): string {
  const names = [...new Set(rows.map((row) => row.who))].map((who, i) => (i > 0 && who === "You" ? "you" : who));
  return nameList(words, names);
}

/**
 * The Wall by day in the house's zone, latest first as read. A day with two
 * or more ticks made on time folds them into one row at its foot ("3 ticked
 * on time", then who), so what went wrong, perks and notices lead. Of the
 * rest, each run of two or more of the same news by the same person in a
 * row (late ticks, or misses) folds into one. Nothing folds across midnight.
 */
export function wallDays(rows: readonly WallFeedRow[], zone: string, now: Date, words: Words): WallDay[] {
  const byDate = new Map<string, WallFeedRow[]>();
  for (const row of rows) {
    const date = localDate(row.at, zone);
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }

  return [...byDate].map(([date, dayRows]) => {
    const items: WallDay["items"] = [];
    const quiet = dayRows.filter((row) => onTimeTick(row, words));
    const loud = quiet.length > 1 ? dayRows.filter((row) => !onTimeTick(row, words)) : dayRows;
    for (let i = 0; i < loud.length; ) {
      const row = loud[i];
      let end = i + 1;
      while (row.repeat !== null && end < loud.length && loud[end].repeat === row.repeat) end += 1;
      const run = loud.slice(i, end);
      items.push(run.length > 1 ? { fold: { id: `fold:${row.id}`, label: foldLabel(run, words), rows: run } } : { row });
      i = end;
    }
    if (quiet.length > 1) {
      items.push({
        fold: { id: `on-time:${date}`, label: words('wall.feed.onTimeMany', { n: quiet.length }), detail: tickers(quiet, words), rows: quiet },
      });
    }
    const label = dayName(dayRows[0].at, zone, now, words);
    const sub = dayLabel(dayRows[0].at, zone);
    return { date, label, sub: sub === label ? null : sub, items };
  });
}

/** The values House setup's rows show; null for one whose read hasn't landed. */
export interface HouseSetupValues {
  johns: string | null;
  rules: string;
  away: string | null;
  groups: string | null;
  /** Groups shows to admins, and to everyone once a group exists. */
  showGroups: boolean;
}

/**
 * House setup's rows, each with its current value: the Johns and their
 * effort in an average week ("13, about 23 pts a week"), the money rules
 * ("£20 stake, £1 late, £3 missed"), who is away next ("Megan, 29 Oct–1
 * Nov", or "You, …"), and how many groups. Time away lists only people who
 * still live here, earliest first.
 */
export function houseSetupValues(input: {
  rules: Pick<HouseRules, "currency" | "stakeMinor" | "lateForfeitMinor" | "missedForfeitMinor"> &
    Partial<Pick<HouseRules, "dealMode" | "dealBudget">>;
  /** A family has no stake, so its Rules row says how Johns are shared instead. */
  kind?: HouseKind;
  /** The John list, once read. */
  johns?: readonly Pick<JohnDef, "points" | "everyWeeks">[];
  /** How many groups, once read. */
  groups?: number;
  /** The house's time away, once read. */
  away?: readonly AwayPeriod[];
  /** Today in the house's zone, `yyyy-MM-dd`. */
  today: string;
  members: readonly WallPerson[];
  me: string;
  admin: boolean;
}, words: Words): HouseSetupValues {
  const { rules, johns, groups, away, today, members, me } = input;
  const money = (minor: number) => formatMoney(minor, rules.currency);

  let johnsValue: string | null = null;
  if (johns) {
    const perWeek = Math.round(weeklyEffort(johns));
    johnsValue = johns.length === 0 ? words('house.lower.noJohns') : words('house.lower.johnsValue', { count: johns.length, perWeek: perWeekLine(perWeek, words) });
  }

  let awayValue: string | null = null;
  if (away) {
    const next = away
      .filter((p) => p.endsOn >= today && members.some((m) => m.userId === p.userId))
      .map((p) => ({ period: p, who: named(p.userId, me, members, words).subject }))
      .sort(
        (a, b) =>
          a.period.startsOn.localeCompare(b.period.startsOn) ||
          a.period.endsOn.localeCompare(b.period.endsOn) ||
          a.who.localeCompare(b.who),
      )[0];
    awayValue = next
      ? words('house.lower.awayValue', { who: next.who, range: dateRange(next.period.startsOn, next.period.endsOn) })
      : words('house.lower.nobodyAway');
  }

  return {
    johns: johnsValue,
    rules:
      input.kind === "family"
        ? `${words(`week.steady.modeName.${rules.dealMode ?? "smart"}`)}, ${words('week.steady.budgetEach', { budget: rules.dealBudget ?? 4 })}`
        : rulesLine(
            rules.stakeMinor > 0 ? money(rules.stakeMinor) : null,
            money(rules.lateForfeitMinor),
            money(rules.missedForfeitMinor),
            words,
          ),
    away: awayValue,
    groups: groups === undefined ? null : groups === 0 ? words('house.lower.noGroups') : words('house.lower.groupsValue', { n: groups }),
    showGroups: input.admin || (groups ?? 0) > 0,
  };
}

/**
 * What stands in the way of leaving, or what it leaves behind, from who lives
 * here: the only admin of a house with others in it can't leave until
 * someone else is made an admin (the database refuses it, last_admin); the
 * last one out leaves the house with nobody in it. Null for anyone else.
 */
export function leaveBar(
  me: string,
  members: readonly { userId: string; role: "admin" | "member" }[],
): "last-admin" | "last-one" | null {
  const others = members.filter((m) => m.userId !== me);
  if (others.length === 0) return "last-one";
  const admin = members.some((m) => m.userId === me && m.role === "admin");
  return admin && !others.some((m) => m.role === "admin") ? "last-admin" : null;
}

/**
 * What leaving costs, in one sentence for its confirm, from the Stake: your
 * share so far of what the month's forfeits will share out (when there is
 * one), and every settle-up still open between you and a housemate. "You’ll
 * lose your £3.33 share of October’s stake so far, and Tom still owes you
 * £1.34."
 */
export function leaveCost(input: {
  me: string;
  /** The Stake's month, `yyyy-MM`. */
  month: string;
  /** Your share of this month's forfeits so far, in minor units (the Stake's projection). */
  share: number;
  transfers: readonly Transfer[];
  members: readonly WallPerson[];
  currency: Currency;
}, words: Words): string {
  const { me, members } = input;
  const money = (minor: number) => formatMoney(minor, input.currency);
  const clauses: string[] = [];
  if (input.share > 0) {
    const month = monthName(input.month);
    clauses.push(month ? words('house.lower.loseShareFrom', { amount: money(input.share), month }) : words('house.lower.loseShare', { amount: money(input.share) }));
  }
  for (const t of input.transfers) {
    if (t.to === me && t.from !== me) clauses.push(words('house.lower.owesYou', { who: named(t.from, me, members, words).subject, amount: money(t.amount) }));
  }
  for (const t of input.transfers) {
    if (t.from === me && t.to !== me) clauses.push(words('house.lower.youOwe', { whom: named(t.to, me, members, words).object, amount: money(t.amount) }));
  }
  if (clauses.length === 0) return words('house.lower.costsNothing');
  const list = clauses.length < 2 ? clauses.join("") : words('house.lower.listAnd', { rest: clauses.slice(0, -1).join(", "), last: clauses[clauses.length - 1] });
  return `${upperFirst(list)}.`;
}
