import { dateIn, dateRange, firstName, monthNameOf, STATUS_MARK, type StatusIcon } from "./format";
import type { Currency } from "./domain";
import { monthWord } from "./house-page";
import { undoneWhat } from "./history";
import { formatMoney } from "./money";
import type { LiveStatus } from "./outcome";
import { pocketMoney } from "./pocket";
import { resetWhat } from "./resets";
import { wordsFor, type Words } from "./words-for";
import type { WallEvent } from "./wall";
import { localDate } from "./week";

// A Wall event as one sentence, from where the viewer stands: who it names,
// what it sets in bold, its meta words, and whose John it is. One small
// function per kind of event, looked up by the event's kind.

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

/** How a sentence names someone: as its subject, mid-sentence, and as an owner. */
export interface WallNamed {
  subject: string;
  object: string;
  possessive: string;
  you: boolean;
}

export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function named(userId: string | null | undefined, me: string, members: readonly WallPerson[], words: Words): WallNamed {
  if (userId && userId === me) {
    return { subject: words('wall.feed.you'), object: words('wall.feed.youObject'), possessive: words('wall.feed.your'), you: true };
  }
  const member = userId ? members.find((m) => m.userId === userId) : undefined;
  if (member) {
    const first = firstName(member.name);
    return { subject: first, object: first, possessive: words('wall.feed.whose', { name: first }), you: false };
  }
  // Someone the event doesn't name, or who has since left the house.
  const nobody = userId ? words('common.shell.formerHousemate') : words('wall.feed.someone');
  return { subject: nobody, object: lowerFirst(nobody), possessive: words('wall.feed.whose', { name: lowerFirst(nobody) }), you: false };
}

/** "September" from "2026-09"; null for anything that isn't a month. */
export function monthFrom(month: string, words: Words): string | null {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return monthNameOf(m - 1, words);
}

/** A payment's amount is for the two people in it: who paid and who was paid. */
export function paymentShown(event: Pick<WallEvent, "userId" | "data">, viewer: string): boolean {
  return event.userId === viewer || event.data.to === viewer;
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

/** A flag still open: how long is left ("11h left"), or how late it is. */
export interface OpenFlag {
  left: string;
  late: boolean;
}

/** One event's sentence and what goes with it. */
export interface WallSentence {
  title: string;
  /** The meta line's words before the time. */
  detail: string | null;
  /** The names and Johns the sentence sets in bold. */
  bold: string[];
  open: OpenFlag | null;
  /** Who leads the row, when it isn't whoever the event is about. */
  lead: string | null;
  mark: StatusIcon | null;
  /** What makes several in a row one fold ("tick:sam"). */
  repeat: string | null;
  /** Whose John it is: the ticker, or the one a dispute or a verdict is against. */
  owner: string | null;
}

/** What each kind's sentence is made from. */
interface Telling {
  event: WallEvent;
  scene: WallScene;
  words: Words;
  /** The reader's words, where a family reads differently. */
  say: Words;
  who: WallNamed;
  john: string | null;
  johnName: string;
  /** A string from the event's data, "" when it has none. */
  text: (key: string) => string;
  name: (userId: string | null) => WallNamed;
}

type Told = Pick<WallSentence, "title"> & Partial<WallSentence>;
type Teller = (t: Telling) => Told;

const ticked: Teller = (t) => ({
  title: t.words('wall.feed.ticked', { who: t.who.subject, you: t.who.you, john: t.johnName }),
  ...tickDetail(t.event, t.scene, t.words),
  repeat: `tick:${t.event.userId}`,
});

/** The John was someone else's: theirs is the miss, the coverer's the tick. */
const covered: Teller = ({ event, scene, words, who, johnName, text, name }) => {
  const whose = name(text("for") || null);
  const { detail, mark } = tickDetail(event, scene, words);
  return {
    title: words('wall.feed.covered', { who: who.subject, you: who.you, whose: whose.possessive, john: johnName }),
    bold: [who.subject, johnName, whose.subject],
    detail: detail === words('wall.feed.onTime') ? words('wall.feed.coveredWord') : detail,
    mark,
    repeat: `covered:${event.userId}`,
  };
};

const disputed: Teller = ({ words, who, johnName, text, name }) => {
  const owner = text("against") || null;
  const against = name(owner);
  return {
    title: words('wall.feed.disputed', { who: who.subject, you: who.you, whose: against.possessive, john: johnName }),
    bold: [who.subject, johnName, against.subject],
    detail: text("reason") ? `“${text("reason")}”` : null,
    owner,
  };
};

const verdict: Teller = ({ event, words, johnName, text, name }) => {
  const owner = text("against") || null;
  const whose = upperFirst(name(owner).possessive);
  return {
    title: event.kind === "upheld" ? words('wall.feed.struckOut', { whose, john: johnName }) : words('wall.feed.stands', { whose, john: johnName }),
    bold: [johnName, name(owner).subject],
    detail: words('wall.feed.voted'),
    owner,
  };
};

const swapUsed: Teller = ({ words, who, text, name }) => {
  const other = name(text("with") || null);
  return {
    title: words('wall.feed.swapped', { who: who.subject, you: who.you, gave: text("gave"), whose: other.possessive, took: text("took") }),
    bold: [who.subject, text("gave"), text("took"), other.subject],
    detail: words('wall.feed.swap'),
  };
};

const away: Teller = ({ event, words, who, text }) => {
  const range = dateRange(text("starts_on"), text("ends_on"), words);
  const moved = Number(event.data.moved ?? 0);
  return {
    title: who.you ? words('wall.feed.youAway', { range }) : words('wall.feed.away', { who: who.subject, you: who.you, range }),
    detail: moved > 0 ? words('wall.feed.awayMoved', { due: words('wall.feed.dueBefore', { n: moved, you: who.you }) }) : words('wall.feed.timeAway'),
  };
};

/** A flag still open: who's on call and by when, with how long is left. */
function openFlag({ scene, words, who, text }: Telling, status: LiveStatus): Partial<WallSentence> {
  const onCall = words('wall.feed.onCall', { who: who.subject, you: who.you });
  const due = text("due_at") ? new Date(text("due_at")) : null;
  const late = status === "overdue";
  if (!due || Number.isNaN(due.getTime())) return { detail: onCall, open: { left: words('wall.feed.onCallWord'), late } };
  const sameDay = localDate(due, scene.zone) === localDate(scene.now, scene.zone);
  const time = dateIn(due, "time", scene.zone, words);
  const clock = sameDay ? time : words("common.date.weekdayTime", { day: dateIn(due, "weekday", scene.zone, words), time });
  const open = countdown(due, scene.now, words);
  return { detail: words('wall.feed.dueBy', { onCall, when: clock }), open: late ? { ...open, late: true } : open };
}

/** A flag's meta words once it's no longer open: from where its John got to. */
function settledFlag({ words, who }: Telling, status: LiveStatus | undefined): Partial<WallSentence> {
  const whom = { who: who.subject, you: who.you };
  if (status === "done" || status === "late") return { detail: words('wall.feed.flagDid', whom) };
  if (status === "checking" || status === "disputed") return { detail: words('wall.feed.flagTicked', whom) };
  if (status === "missed") return { detail: words('wall.feed.flagMissed', whom), mark: STATUS_MARK.missed.icon };
  if (status === "covered") return { detail: words('wall.feed.flagCovered') };
  return { detail: words('wall.feed.flagWas', whom) };
}

/** The event is the holder's; `by` flagged it, null when the clock flagged it again after a miss. */
const flagged: Teller = (t) => {
  const { event, scene, words, who, johnName, text, name } = t;
  const by = text("by") || null;
  const flagger = name(by);
  let title: string;
  if (!by) title = words('wall.feed.flaggedAgain', { john: johnName });
  else if (by === event.userId) title = words('wall.feed.flaggedOwn', { who: who.subject, you: who.you, john: johnName });
  else title = words('wall.feed.flagged', { by: flagger.subject, john: johnName, whom: who.object });
  const status = event.assignmentId ? scene.statusOf?.(event.assignmentId) : undefined;
  return {
    title,
    bold: [johnName, who.subject, who.object, ...(by ? [flagger.subject] : [])],
    lead: by,
    ...(status && OPEN.has(status) ? openFlag(t, status) : settledFlag(t, status)),
  };
};

/** An admin took back someone else's move: the admin leads. */
const undone: Teller = ({ words, say, who, john, johnName, text, name }) => {
  const by = name(text("by") || null);
  return {
    title: words('wall.feed.undid', { by: by.subject, whose: who.possessive, what: undoneWhat(text("what"), john, words) }),
    bold: [by.subject, who.subject, johnName],
    lead: text("by") || null,
    detail: say("wall.feed.adminFix"),
  };
};

const reset: Teller = ({ event, words, say, who, johnName, text, name }) => {
  const subject = name(text("subject") || null);
  return {
    title: words("wall.history.line.reset", { who: who.subject, you: who.you, what: resetWhat(event.data, subject.subject, words) }),
    bold: [who.subject, subject.subject, johnName],
    detail: say("wall.feed.adminFix"),
  };
};

/** A parent's answer to a kid's tick, in a family. */
const parentAnswer: Teller = ({ event, words, who, johnName, text, name }) => {
  const owner = text("against") || null;
  const kid = name(owner);
  const okayed = event.kind === "okayed";
  return {
    title: words(okayed ? "wall.feed.okayed" : "wall.feed.notYet", { who: who.subject, you: who.you, whose: kid.possessive, john: johnName }),
    bold: [who.subject, johnName, kid.subject],
    detail: okayed ? null : words("wall.feed.openAgain"),
    owner,
  };
};

const pocketPaid: Teller = ({ event, scene, words, who, text, name }) => {
  const to = name(text("to") || null);
  return {
    title: words("wall.feed.pocketPaid", {
      who: who.subject,
      you: who.you,
      whom: to.object,
      amount: pocketMoney(Number(event.data.amount ?? 0), scene.currency, words),
      month: monthWord(text("month"), words),
    }),
    bold: [who.subject, to.subject],
    detail: words("house.pocket.card"),
  };
};

const movingOut: Teller = ({ words, who, text }) => {
  const on = text("on");
  return {
    title: on ? words("house.moving.movesOut", { who: who.subject, you: who.you, day: dateRange(on, on, words) }) : words("house.moving.stayingAfterAll", { who: who.subject, you: who.you }),
    detail: words('house.moving.movingDetail'),
  };
};

/** They've gone, so the house can't name them: the post kept their name. */
const movedOut: Teller = ({ event, scene, words, who, text }) => {
  const was = text("who");
  const subject = event.userId === scene.me || !was ? who.subject : firstName(was);
  return { title: words('house.moving.movedOut', { who: subject }), bold: [subject], detail: words('house.moving.movingDetail') };
};

/** An admin reset the house; the owner's own reset names nobody. */
const startedOver: Teller = ({ event, words, who }) => {
  const everything = event.data.everything === true;
  return {
    title: event.userId ? words("house.reset.wall", { who: who.subject, you: who.you, everything }) : words("house.reset.wallNow", { everything }),
    ...(event.userId ? {} : { bold: [] }),
    detail: words("house.reset.wallDetail"),
  };
};

/** Rules' Who lives here: a family from the 1st, kept, housemates again, or a family now. */
const kindChanged: Teller = ({ event, words, who, text }) => {
  const whom = { who: who.subject, you: who.you };
  const on = text("on");
  if (on) {
    return { title: words("house.kindSwitch.wall.later", { ...whom, on: dateRange(on, on, words) }), detail: words("house.kindSwitch.wall.laterDetail") };
  }
  if (event.data.kept) return { title: words("house.kindSwitch.wall.kept", whom) };
  if (event.data.kind !== "family") {
    return { title: words("house.kindSwitch.wall.housemates", whom), detail: words("house.kindSwitch.wall.housematesDetail") };
  }
  return {
    title: event.userId ? words("house.kindSwitch.wall.family", whom) : words("house.kindSwitch.wall.familyNow"),
    ...(event.userId ? {} : { bold: [] }),
    detail: words("house.kindSwitch.wall.familyDetail"),
  };
};

const monthClosed: Teller = ({ words, text }) => {
  const month = monthFrom(text("month"), words);
  return { title: month ? words("wall.feed.monthClosed", { month }) : words("wall.feed.monthClosedAny"), detail: words('wall.feed.sharedOut') };
};

const paid: Teller = ({ event, scene, words, who, text, name }) => {
  const to = name(text("to") || null);
  const amount = formatMoney(Number(event.data.amount ?? 0), scene.currency, words);
  let title: string;
  if (!paymentShown(event, scene.me)) title = words('wall.feed.paid', { who: who.subject, you: who.you, whom: to.object });
  else if (who.you) title = words('wall.feed.youPaid', { whom: to.object, amount });
  else title = words('wall.feed.paidYou', { who: who.subject, you: who.you, amount });
  return { title, detail: words('wall.feed.settled') };
};

/** Each kind of event's sentence. */
const TELL: Record<string, Teller> = {
  done: ticked,
  late: ticked,
  covered,
  missed: ({ event, words, who, johnName }) => ({
    title: words('wall.feed.missed', { who: who.subject, you: who.you, john: johnName }),
    detail: words('wall.feed.missedWord'),
    mark: STATUS_MARK.missed.icon,
    repeat: `missed:${event.userId}`,
  }),
  disputed,
  upheld: verdict,
  rejected: verdict,
  immunity_earned: ({ event, words, who }) => ({
    title: words('wall.feed.earnedImmunity', { who: who.subject, you: who.you }),
    detail: words('wall.feed.clean', { weeks: Number(event.data.streak ?? 0) }),
  }),
  swap_earned: ({ words, who }) => ({
    title: words('wall.feed.toppedWeek', { who: who.subject, you: who.you }),
    detail: words('wall.feed.swapEarned'),
  }),
  immunity_used: ({ words, who, johnName }) => ({
    title: words('wall.feed.skipped', { who: who.subject, you: who.you, john: johnName }),
    detail: words('wall.feed.immunityUsed'),
  }),
  swap_used: swapUsed,
  away,
  flagged,
  undone,
  reset,
  okayed: parentAnswer,
  not_yet: parentAnswer,
  pocket_paid: pocketPaid,
  joined: ({ say, who }) => ({ title: say("wall.feed.joined", { who: who.subject, you: who.you }), detail: say("wall.feed.newMember") }),
  moving_out: movingOut,
  moved_out: movedOut,
  // A message from Jonz itself: its subject, and its words to read in full.
  jonz_message: ({ words, text }) => ({ title: text("subject") || words('wall.feed.fromJonz'), bold: [], detail: text("body") || null, lead: null }),
  started_over: startedOver,
  kind_changed: kindChanged,
  month_closed: monthClosed,
  paid,
};

/**
 * One event as a sentence, from where the viewer stands, with the subject
 * ("Megan", "You") and the John it's about. A kind this build doesn't know
 * reads as its own name.
 */
export function wallSentence(event: WallEvent, scene: WallScene, words: Words): WallSentence & { who: WallNamed; john: string | null } {
  const { me, members } = scene;
  const name = (userId: string | null) => named(userId, me, members, words);
  const who = name(event.userId);
  const john = typeof event.data.name === "string" ? event.data.name : null;
  const johnName = john ?? words('wall.feed.aJohn');
  const telling: Telling = {
    event,
    scene,
    words,
    say: scene.words ?? wordsFor("en", "housemates"),
    who,
    john,
    johnName,
    text: (key) => (typeof event.data[key] === "string" ? (event.data[key] as string) : ""),
    name,
  };
  const told = TELL[event.kind]?.(telling) ?? { title: event.kind };
  return { detail: null, bold: [who.subject, johnName], open: null, lead: event.userId, mark: null, repeat: null, owner: event.userId, ...told, who, john };
}
