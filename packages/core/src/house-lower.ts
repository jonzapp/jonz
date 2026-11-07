import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import type { AwayPeriod } from "./away";
import { weeklyEffort, type JohnDef } from "./board";
import { FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, KIND_SWITCH_COPY, MOVING_COPY, STEADY_COPY, WALL_FEED_COPY } from "./copy";
import type { Currency, HouseKind, HouseRules } from "./domain";
import { dateRange, dayLabel, firstName, STATUS_MARK, type StatusIcon } from "./format";
import { undoneWhat } from "./history";
import { formatMoney } from "./money";
import type { LiveStatus } from "./outcome";
import { resetWhat } from "./resets";
import type { Transfer } from "./stake";
import { REACTABLE, REACTIONS, type Part, type ReactionKind, type WallEvent, type WallIcon } from "./wall";
import { addDaysTo, localDate } from "./week";

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

function named(userId: string | null | undefined, me: string, members: readonly WallPerson[]): Named {
  if (userId && userId === me) {
    return { subject: WALL_FEED_COPY.you, object: WALL_FEED_COPY.youObject, possessive: WALL_FEED_COPY.your, you: true };
  }
  const member = userId ? members.find((m) => m.userId === userId) : undefined;
  if (member) {
    const first = firstName(member.name);
    return { subject: first, object: first, possessive: `${first}’s`, you: false };
  }
  // Someone the event doesn't name, or who has since left the house.
  const nobody = userId ? FOCUS_SHELL_COPY.formerHousemate : WALL_FEED_COPY.someone;
  return { subject: nobody, object: lowerFirst(nobody), possessive: `${lowerFirst(nobody)}’s`, you: false };
}

/** "September" from "2026-09"; null for anything that isn't a month. */
function monthName(month: string): string | null {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return format(new Date(Date.UTC(y, m - 1, 15)), "MMMM", { in: tz("UTC") });
}

/** A day as the Wall names it: "Today", "Yesterday", else "Sat 24 Oct", in the house's zone. */
function dayName(at: Date, zone: string, now: Date): string {
  const date = localDate(at, zone);
  const today = localDate(now, zone);
  if (date === today) return WALL_FEED_COPY.today;
  if (date === addDaysTo(today, -1)) return WALL_FEED_COPY.yesterday;
  return dayLabel(at, zone);
}

/** How long ago, for a meta line: "just now", "5 min", "3h", "2 days", then the date ("12 Oct"). */
export function wallAge(at: Date, now: Date, zone: string): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return WALL_FEED_COPY.justNow;
  if (minutes < 60) return WALL_FEED_COPY.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return WALL_FEED_COPY.hours(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return WALL_FEED_COPY.days(days);
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
function tickDetail(event: WallEvent, scene: WallScene): { detail: string; mark: StatusIcon | null } {
  const id = event.assignmentId;
  const status = id ? scene.statusOf?.(id) : undefined;
  const struck = id ? scene.struck?.get(id) : undefined;
  const struckOut = { detail: WALL_FEED_COPY.struck, mark: STATUS_MARK.missed.icon };
  if (status === "disputed") return { detail: WALL_FEED_COPY.disputedTick, mark: STATUS_MARK.disputed.icon };
  // Undoing a tick takes its event away, so a ticked John that's open again was struck out.
  if (status === "upcoming" || status === "due-soon" || status === "overdue" || status === "missed") return struckOut;
  if (!status && struck && event.createdAt < struck) return struckOut;
  if (event.kind === "late") return { detail: WALL_FEED_COPY.late, mark: STATUS_MARK.late.icon };
  return { detail: status === "checking" ? WALL_FEED_COPY.checking : WALL_FEED_COPY.onTime, mark: null };
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
};

const FAMILY: Record<string, WallFamily> = {
  done: "done",
  late: "done",
  covered: "done",
  rejected: "done",
  missed: "trouble",
  disputed: "trouble",
  upheld: "trouble",
  immunity_earned: "perk",
  immunity_used: "perk",
  swap_earned: "perk",
  swap_used: "perk",
};

const OPEN: ReadonlySet<LiveStatus> = new Set(["upcoming", "due-soon", "overdue"]);

/** "11h left", "40 min late": from now to when a flag is due. */
function countdown(due: Date, now: Date): { left: string; late: boolean } {
  const minutes = Math.round((due.getTime() - now.getTime()) / 60_000);
  const late = minutes < 0;
  const m = Math.abs(minutes);
  const say = late ? WALL_FEED_COPY.lateBy : WALL_FEED_COPY.left;
  return { left: m >= 60 ? say(Math.floor(m / 60), "h") : say(Math.max(m, 1), "min"), late };
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
export function wallFeedRow(event: WallEvent, scene: WallScene): WallFeedRow {
  const { me, members } = scene;
  const who = named(event.userId, me, members);
  const john = typeof event.data.name === "string" ? event.data.name : null;
  const johnName = john ?? WALL_FEED_COPY.aJohn;
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
      title = WALL_FEED_COPY.ticked(who.subject, johnName);
      ({ detail, mark } = tickDetail(event, scene));
      repeat = `tick:${event.userId}`;
      break;
    case "covered": {
      // The John was someone else's: theirs is the miss, the coverer's the tick.
      const whose = named(text("for") || null, me, members);
      title = WALL_FEED_COPY.covered(who.subject, whose.possessive, johnName);
      bold.push(whose.subject);
      ({ detail, mark } = tickDetail(event, scene));
      if (detail === WALL_FEED_COPY.onTime) detail = WALL_FEED_COPY.coveredWord;
      repeat = `covered:${event.userId}`;
      break;
    }
    case "missed":
      title = WALL_FEED_COPY.missed(who.subject, johnName);
      detail = WALL_FEED_COPY.missedWord;
      mark = STATUS_MARK.missed.icon;
      repeat = `missed:${event.userId}`;
      break;
    case "disputed": {
      owner = text("against") || null;
      const against = named(owner, me, members);
      title = WALL_FEED_COPY.disputed(who.subject, against.possessive, johnName);
      bold.push(against.subject);
      detail = text("reason") ? `“${text("reason")}”` : null;
      break;
    }
    case "upheld":
    case "rejected": {
      owner = text("against") || null;
      const whose = upperFirst(named(owner, me, members).possessive);
      bold = [johnName, named(owner, me, members).subject];
      title = event.kind === "upheld" ? WALL_FEED_COPY.struckOut(whose, johnName) : WALL_FEED_COPY.stands(whose, johnName);
      detail = WALL_FEED_COPY.voted;
      break;
    }
    case "immunity_earned":
      title = WALL_FEED_COPY.earnedImmunity(who.subject);
      detail = WALL_FEED_COPY.clean(Number(event.data.streak ?? 0));
      break;
    case "swap_earned":
      title = WALL_FEED_COPY.toppedWeek(who.subject);
      detail = WALL_FEED_COPY.swapEarned;
      break;
    case "immunity_used":
      title = WALL_FEED_COPY.skipped(who.subject, johnName);
      detail = WALL_FEED_COPY.immunityUsed;
      break;
    case "swap_used":
      title = WALL_FEED_COPY.swapped(who.subject, text("gave"), named(text("with") || null, me, members).possessive, text("took"));
      bold = [who.subject, text("gave"), text("took"), named(text("with") || null, me, members).subject];
      detail = WALL_FEED_COPY.swap;
      break;
    case "away": {
      const range = dateRange(text("starts_on"), text("ends_on"));
      const moved = Number(event.data.moved ?? 0);
      title = who.you ? WALL_FEED_COPY.youAway(range) : WALL_FEED_COPY.away(who.subject, range);
      detail = moved > 0 ? WALL_FEED_COPY.awayMoved(WALL_FEED_COPY.dueBefore(moved, who.you)) : WALL_FEED_COPY.timeAway;
      break;
    }
    case "flagged": {
      // The event is the holder's; `by` flagged it, null when the clock flagged it again after a miss.
      const by = text("by") || null;
      const flagger = named(by, me, members);
      if (!by) title = WALL_FEED_COPY.flaggedAgain(johnName);
      else if (by === event.userId) title = WALL_FEED_COPY.flaggedOwn(who.subject, johnName);
      else title = WALL_FEED_COPY.flagged(flagger.subject, johnName, who.object);
      bold = [johnName, who.subject, who.object, ...(by ? [flagger.subject] : [])];
      lead = by;
      const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
      const due = text("due_at") ? new Date(text("due_at")) : null;
      if (status && OPEN.has(status)) {
        const onCall = WALL_FEED_COPY.onCall(who.subject, who.you);
        if (due && !Number.isNaN(due.getTime())) {
          const sameDay = localDate(due, scene.zone) === localDate(scene.now, scene.zone);
          const clock = format(due, sameDay ? "HH:mm" : "EEE HH:mm", { in: tz(scene.zone) });
          detail = WALL_FEED_COPY.dueBy(onCall, clock);
          open = countdown(due, scene.now);
        } else {
          detail = onCall;
          open = { left: WALL_FEED_COPY.onCallWord, late: status === "overdue" };
        }
        if (status === "overdue") open = { ...open, late: true };
      } else if (status === "done" || status === "late") {
        detail = WALL_FEED_COPY.flagDid(who.subject);
      } else if (status === "checking" || status === "disputed") {
        detail = WALL_FEED_COPY.flagTicked(who.subject);
      } else if (status === "missed") {
        detail = WALL_FEED_COPY.flagMissed(who.subject);
        mark = STATUS_MARK.missed.icon;
      } else if (status === "covered") {
        detail = WALL_FEED_COPY.flagCovered;
      } else {
        detail = WALL_FEED_COPY.flagWas(who.subject);
      }
      break;
    }
    case "undone": {
      // An admin took back someone else's move: the admin leads.
      const by = named(text("by") || null, me, members);
      title = WALL_FEED_COPY.undid(by.subject, who.possessive, undoneWhat(text("what"), john));
      bold = [by.subject, who.subject, johnName];
      lead = text("by") || null;
      detail = WALL_FEED_COPY.adminFix;
      break;
    }
    case "reset": {
      const subject = named(text("subject") || null, me, members);
      title = `${who.subject} ${resetWhat(event.data, subject.subject)}`;
      bold = [who.subject, subject.subject, johnName];
      detail = WALL_FEED_COPY.adminFix;
      break;
    }
    case "joined":
      title = WALL_FEED_COPY.joined(who.subject);
      detail = WALL_FEED_COPY.newHousemate;
      break;
    case "moving_out": {
      const on = text("on");
      title = on ? MOVING_COPY.movesOut(who.subject, dateRange(on, on)) : MOVING_COPY.stayingAfterAll(who.subject);
      detail = MOVING_COPY.movingDetail;
      break;
    }
    case "moved_out": {
      // They've gone, so the house can't name them: the post kept their name.
      const was = text("who");
      const subject = event.userId === me || !was ? who.subject : firstName(was);
      title = MOVING_COPY.movedOut(subject);
      bold = [subject];
      detail = MOVING_COPY.movingDetail;
      break;
    }
    case "jonz_message":
      // A message from Jonz itself: its subject, and its words to read in full.
      title = text("subject") || WALL_FEED_COPY.fromJonz;
      bold = [];
      detail = text("body") || null;
      lead = null;
      break;
    case "kind_changed": {
      // Rules' Who lives here: a family from the 1st, kept, housemates again, or a family now.
      const on = text("on");
      const w = KIND_SWITCH_COPY.wall;
      if (on) {
        title = w.later(who.subject, dateRange(on, on));
        detail = w.laterDetail;
      } else if (event.data.kept) {
        title = w.kept(who.subject);
      } else if (event.data.kind !== "family") {
        title = w.housemates(who.subject);
        detail = w.housematesDetail;
      } else {
        title = event.userId ? w.family(who.subject) : w.familyNow;
        bold = event.userId ? bold : [];
        detail = w.familyDetail;
      }
      break;
    }
    case "month_closed":
      title = WALL_FEED_COPY.monthClosed(monthName(text("month")));
      detail = WALL_FEED_COPY.sharedOut;
      break;
    case "paid": {
      const to = named(text("to") || null, me, members);
      const amount = formatMoney(Number(event.data.amount ?? 0), scene.currency);
      title = !paymentShown(event, me)
        ? WALL_FEED_COPY.paid(who.subject, to.object)
        : who.you
          ? WALL_FEED_COPY.youPaid(to.object, amount)
          : WALL_FEED_COPY.paidYou(who.subject, amount);
      detail = WALL_FEED_COPY.settled;
      break;
    }
    default:
      title = event.kind;
  }

  const member = members.find((m) => m.userId === lead);
  const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
  const when = scene.clock
    ? format(event.createdAt, "HH:mm", { in: tz(scene.zone) })
    : wallAge(event.createdAt, scene.now, scene.zone);
  const stamp = WALL_FEED_COPY.stamp(
    dayName(event.createdAt, scene.zone, scene.now),
    format(event.createdAt, "HH:mm", { in: tz(scene.zone) }),
  );
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
    full: WALL_FEED_COPY.meta(detail, stamp),
    label: WALL_FEED_COPY.row(title, open ? `${detail ?? ""}, ${open.left}` : detail, when),
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

function foldLabel(rows: readonly WallFeedRow[]): string {
  const first = rows[0];
  return first.kind === "missed"
    ? WALL_FEED_COPY.missedMany(first.who, rows.length)
    : WALL_FEED_COPY.tickedMany(first.who, rows.length);
}

/**
 * The Wall by day in the house's zone, latest first as read, with each run
 * of two or more of the same news by the same person in a row (ticks, or
 * misses) folded into one. A run never crosses midnight.
 */
export function wallDays(rows: readonly WallFeedRow[], zone: string, now: Date): WallDay[] {
  const byDate = new Map<string, WallFeedRow[]>();
  for (const row of rows) {
    const date = localDate(row.at, zone);
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }

  return [...byDate].map(([date, dayRows]) => {
    const items: WallDay["items"] = [];
    for (let i = 0; i < dayRows.length; ) {
      const row = dayRows[i];
      let end = i + 1;
      while (row.repeat !== null && end < dayRows.length && dayRows[end].repeat === row.repeat) end += 1;
      const run = dayRows.slice(i, end);
      items.push(run.length > 1 ? { fold: { id: `fold:${row.id}`, label: foldLabel(run), rows: run } } : { row });
      i = end;
    }
    const label = dayName(dayRows[0].at, zone, now);
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
}): HouseSetupValues {
  const { rules, johns, groups, away, today, members, me } = input;
  const money = (minor: number) => formatMoney(minor, rules.currency);

  let johnsValue: string | null = null;
  if (johns) {
    const perWeek = Math.round(weeklyEffort(johns));
    johnsValue = johns.length === 0 ? HOUSE_LOWER_COPY.noJohns : HOUSE_LOWER_COPY.johnsValue(johns.length, HOUSE_LOWER_COPY.perWeek(perWeek));
  }

  let awayValue: string | null = null;
  if (away) {
    const next = away
      .filter((p) => p.endsOn >= today && members.some((m) => m.userId === p.userId))
      .map((p) => ({ period: p, who: named(p.userId, me, members).subject }))
      .sort(
        (a, b) =>
          a.period.startsOn.localeCompare(b.period.startsOn) ||
          a.period.endsOn.localeCompare(b.period.endsOn) ||
          a.who.localeCompare(b.who),
      )[0];
    awayValue = next
      ? HOUSE_LOWER_COPY.awayValue(next.who, dateRange(next.period.startsOn, next.period.endsOn))
      : HOUSE_LOWER_COPY.nobodyAway;
  }

  return {
    johns: johnsValue,
    rules:
      input.kind === "family"
        ? `${STEADY_COPY.modeName[rules.dealMode ?? "smart"]}, ${STEADY_COPY.budgetEach(rules.dealBudget ?? 4)}`
        : HOUSE_LOWER_COPY.rulesValue(
            rules.stakeMinor > 0 ? money(rules.stakeMinor) : null,
            money(rules.lateForfeitMinor),
            money(rules.missedForfeitMinor),
          ),
    away: awayValue,
    groups: groups === undefined ? null : groups === 0 ? HOUSE_LOWER_COPY.noGroups : HOUSE_LOWER_COPY.groupsValue(groups),
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
}): string {
  const { me, members } = input;
  const money = (minor: number) => formatMoney(minor, input.currency);
  const clauses: string[] = [];
  if (input.share > 0) clauses.push(HOUSE_LOWER_COPY.loseShare(money(input.share), monthName(input.month)));
  for (const t of input.transfers) {
    if (t.to === me && t.from !== me) clauses.push(HOUSE_LOWER_COPY.owesYou(named(t.from, me, members).subject, money(t.amount)));
  }
  for (const t of input.transfers) {
    if (t.from === me && t.to !== me) clauses.push(HOUSE_LOWER_COPY.youOwe(named(t.to, me, members).object, money(t.amount)));
  }
  if (clauses.length === 0) return HOUSE_LOWER_COPY.costsNothing;
  return `${upperFirst(HOUSE_LOWER_COPY.list(clauses))}.`;
}
