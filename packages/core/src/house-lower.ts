import type { AwayPeriod } from "./away";
import { weeklyEffort, type JohnDef } from "./board";
import type { Currency, HouseKind, HouseRules } from "./domain";
import { dateIn, dateRange, dayLabel, type StatusIcon } from "./format";
import { formatMoney } from "./money";
import type { Transfer } from "./stake";
import { type Words } from "./words-for";
import { monthFrom, named, upperFirst, wallSentence, type WallPerson, type WallScene } from "./wall-sentence";
import { REACTABLE, REACTIONS, type Part, type ReactionKind, type WallEvent, type WallIcon } from "./wall";
import { addDaysTo, localDate } from "./week";
import { nameList, perWeekLine, rowLabel, rulesLine } from "./word-keys";

// House's lower half, as both the House tab and the whole Wall show it: each
// event as a row's one sentence with first names and its meta line, the
// Wall by day with repeats folded, a payment's amount only for the two
// people in it, the setup rows' values, and what leaving costs. Pure: every
// function that needs the time takes `now`.

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
  /** Whether the subject is you: a language whose verb follows its subject says "you" its own way. */
  you: boolean;
}

/** A day as the Wall names it: "Today", "Yesterday", else "Sat 24 Oct", in the house's zone. */
function dayName(at: Date, zone: string, now: Date, words: Words): string {
  const date = localDate(at, zone);
  const today = localDate(now, zone);
  if (date === today) return words('wall.feed.today');
  if (date === addDaysTo(today, -1)) return words('wall.feed.yesterday');
  return dayLabel(at, zone, words);
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
  return dateIn(at, "dayMonth", zone, words);
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
  started_over: "undo",
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
  const { title, detail, bold, open, lead, mark, repeat, owner, who, john } = wallSentence(event, scene, words);

  const member = members.find((m) => m.userId === lead);
  const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
  const when = scene.clock
    ? dateIn(event.createdAt, "time", scene.zone, words)
    : wallAge(event.createdAt, scene.now, scene.zone, words);
  const stamp = words('wall.feed.stamp', { day: dayName(event.createdAt, scene.zone, scene.now, words), clock: dateIn(event.createdAt, "time", scene.zone, words) });
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
    you: who.you,
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
    ? words('wall.feed.missedMany', { who: first.who, you: first.you, n: rows.length })
    : words('wall.feed.tickedMany', { who: first.who, you: first.you, n: rows.length });
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
    const sub = dayLabel(dayRows[0].at, zone, words);
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
  const money = (minor: number) => formatMoney(minor, rules.currency, words);

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
      ? words('house.lower.awayValue', { who: next.who, range: dateRange(next.period.startsOn, next.period.endsOn, words) })
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
  const money = (minor: number) => formatMoney(minor, input.currency, words);
  const clauses: string[] = [];
  if (input.share > 0) {
    const month = monthFrom(input.month, words);
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
