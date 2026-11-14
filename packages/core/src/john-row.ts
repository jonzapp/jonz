import { isOpen } from "./board-views";
import { type BoardItem } from "./board";
import { andNames } from "./crew";
import { CATEGORY_SHORT } from "./domain";
import { dueInLine, firstName, relative, sinceLabel, statusLabel } from "./format";
import type { LiveStatus } from "./outcome";
import { pointsEarned } from "./points";
import type { Words } from "./words-for";

// A John as a row, the same wherever it's drawn: Today's rest of your week,
// Week's groups and its laptop table. The tick box and what it says, the meta
// line, and the one trailing item, from the kit's row map, for anyone's
// John and whoever is looking; and the fold the finished ones go into.
// Pure: `now` comes in, and times are in the house's zone.

/**
 * A John's kind, as every line about it says it (its rows, Next up, the
 * John sheet): the name the house gave it, or for a read that doesn't say,
 * its starting kind's short word. Anything unknown is "Other". A John with
 * no kind ('' from the read) says none: the lines leave it out.
 */
export function johnKind(category: string, kindName?: string | null): string {
  if (kindName != null) return kindName;
  return (CATEGORY_SHORT as Partial<Record<string, string>>)[category] ?? CATEGORY_SHORT.other;
}

/** What a John's row shows and does. */
export interface JohnRowPlan {
  /** The leading tick box (excused shows a shield instead). */
  tick: "open" | "checking" | "done" | "disputed" | "excused";
  /** What the tick box says: the move when it ticks ("Mark Bins out done"), otherwise where the John has got to. */
  tickLabel: string;
  /** The tick box ticks it: yours, and still to do (overdue too; a missed one never). */
  ticks: boolean;
  /** The meta line: the kind, then where it has got to; a dispute says who raised it instead. */
  meta: string;
  /** Whether the lid dot leads the meta line (not before a dispute's "Disputed by"). */
  lid: boolean;
  /**
   * The one trailing item. The points while it's upcoming (it has no mark),
   * once it's done (the green box says done) and while it's disputed
   * (the flag says that); its mark when due soon, being checked by the
   * house, late, overdue or missed; Undo on your own tick being checked;
   * Vote on a dispute waiting for yours; nothing once immunity excused it.
   */
  trailing: "points" | "status" | "undo" | "vote" | null;
  /** Its points: what it's worth while still in play, what it earned once settled. */
  points: number;
  /** What the John sheet opens on: a housemate's fresh tick to dispute, a dispute's vote. */
  focus: "dispute" | "vote" | null;
  /** The 4pt hazard edge of an overdue or missed John. */
  hazardEdge: boolean;
}

/** Whose tick it is: the housemate who covered it, whoever ticked its roll call, or whoever it was dealt to. */
function tickerOf(item: Pick<BoardItem, "userId"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>): string {
  return item.coveredBy ?? item.crew?.tickedBy ?? item.userId;
}

/** A dispute on someone else's tick that you haven't voted on yet. */
function waitsForYourVote(
  item: Pick<BoardItem, "userId" | "status" | "dispute"> & Partial<Pick<BoardItem, "coveredBy" | "crew">>,
  viewerId: string,
): boolean {
  return tickerOf(item) !== viewerId && item.status === "disputed" && item.dispute !== null && item.dispute.myVote === null;
}

/** What a tick box that doesn't tick says: where the John has got to, or just that it isn't done. */
function tickSays(status: LiveStatus, words: Words): string {
  switch (status) {
    case "checking":
    case "done":
    case "late":
    case "disputed":
    case "missed":
    case "excused":
    case "covered":
      return words(`today.nextUp.stateLabel.${status}` as const);
    default:
      return words('today.nextUp.stateLabel.open');
  }
}

/** Someone by first name mid-sentence, or "a former housemate" once they've left (no name). */
function called(name: string | null, words: Words): string {
  return name ? firstName(name) : words('today.nextUp.someoneGone');
}

/** Who is looking at a row and when: the viewer, the time in the house's zone, anyone's full name (null for someone who has left), and the words. */
type RowViewing = { viewerId: string; now: Date; zone: string; nameOf: (userId: string) => string | null; words: Words };

/** Someone mid-sentence: "you" for the viewer, their first name, or "a former housemate". */
function byName(userId: string | null, { viewerId, nameOf, words }: RowViewing): string {
  if (userId === viewerId) return words('week.summary.byYou');
  return called(userId === null ? null : nameOf(userId), words);
}

/** What the tick box shows for a status. */
function tickOf(status: LiveStatus): JohnRowPlan["tick"] {
  if (status === "checking" || status === "disputed" || status === "excused") return status;
  return status === "done" || status === "late" ? "done" : "open";
}

type RowItem = Pick<
  BoardItem,
  "userId" | "name" | "category" | "points" | "needsPhoto" | "status" | "dueAt" | "movedFrom" | "doneAt" | "standsAt" | "dispute"
> &
  Partial<Pick<BoardItem, "kindName" | "flaggedAt" | "flaggedBy" | "coveredBy" | "outcome" | "together" | "crew" | "absentAt" | "dealt" | "awaitsOk">>;

/** What sits at the row's trailing edge, and what its sheet opens on. */
function rowEnds(item: RowItem, viewerId: string): Pick<JohnRowPlan, "trailing" | "focus"> {
  const { status } = item;
  const mine = item.userId === viewerId;
  // A cover still being checked: the coverer can take it back, anyone else can dispute it.
  const coverChecking = status === "covered" && !item.outcome;
  const myTick = tickerOf(item) === viewerId;
  const checking = status === "checking" || coverChecking;
  // Everyone but the ticker votes, so your own dispute opens on nothing in particular.
  const focus = myTick ? null : status === "disputed" ? "vote" : checking ? "dispute" : null;
  if (checking) return { trailing: (coverChecking || item.crew ? myTick : mine) ? "undo" : "status", focus };
  if (status === "disputed") return { trailing: waitsForYourVote(item, viewerId) ? "vote" : "points", focus };
  if (status === "excused") return { trailing: null, focus };
  return { trailing: status === "upcoming" || status === "done" ? "points" : "status", focus };
}

/**
 * One John's row, for whoever is looking (`viewerId`). Its meta line never
 * repeats what the tick box or the trailing item already says: "Kitchen,
 * today 21:00", "Kitchen, was due Tue", "Bins, stands in 21h", "Floors,
 * done Wed 21:00", "Disputed by Megan, 17h left".
 */
export function johnRow(item: RowItem, viewing: RowViewing): JohnRowPlan {
  const { viewerId, words } = viewing;
  const { status } = item;
  const toDo = status === "upcoming" || status === "due-soon" || status === "overdue";
  // A John done together is ticked with its roll call, in its sheet.
  const ticks = item.userId === viewerId && toDo && (item.together?.length ?? 1) <= 1;
  // Ticked by roll call, a place earns its holder's share of the job.
  const share = item.crew?.people.some((c) => c.userId === item.userId)
    ? pointsEarned(status, item.crew.total) / item.crew.people.length
    : null;
  return {
    tick: tickOf(status),
    tickLabel: ticks
      ? item.needsPhoto
        ? words('today.nextUp.tickWithPhoto', { john: item.name })
        : words('today.nextUp.tick', { john: item.name })
      : tickSays(status, words),
    ticks,
    ...metaLine(item, viewing),
    ...rowEnds(item, viewerId),
    points: isOpen(status) ? item.points : (share ?? pointsEarned(status, item.points)),
    hazardEdge: status === "overdue" || status === "missed",
  };
}

type MetaItem = Pick<BoardItem, "userId" | "category" | "status" | "dueAt" | "movedFrom" | "doneAt" | "standsAt" | "dispute"> &
  Partial<Pick<BoardItem, "kindName" | "flaggedAt" | "flaggedBy" | "together" | "crew" | "dealt" | "awaitsOk">> & {
    coveredBy?: string | null;
  };

/** An open flag says who flagged it ("flagged by Sam"), or that it's open again after a miss; null on anything else. */
function flaggedPart(item: MetaItem, viewing: RowViewing): string | null {
  if (!item.flaggedAt || !isOpen(item.status)) return null;
  const { words } = viewing;
  return item.flaggedBy ? words('today.onCall.flaggedByInline', { name: byName(item.flaggedBy, viewing) }) : words('today.onCall.flaggedAgainInline');
}

/** Done together: who with ("with Sam and Ada"), or once ticked, who did it; null on a John done by one. */
function togetherPart(item: MetaItem, viewing: RowViewing): string | null {
  const { words } = viewing;
  const others = (item.crew ? item.crew.people.map((c) => c.userId) : (item.together ?? [])).filter((id) => id !== item.userId);
  if (!others.length) return null;
  return words('john.crew.with', { names: andNames(others.map((id) => byName(id, viewing)), words) });
}

/** A disputed John's line: who questioned it and how long is left. */
function disputedMeta(item: MetaItem, viewing: RowViewing): string {
  const { now, words } = viewing;
  const dispute = item.dispute;
  if (!dispute) return statusLabel("disputed", words);
  const by = dispute.raisedBy === null ? words('today.nextUp.someoneGone') : byName(dispute.raisedBy, viewing);
  const left =
    dispute.closesAt > now ? words('today.nextUp.left', { time: relative(dispute.closesAt, now, words).replace(/^in /, "") }) : words('today.nextUp.closingNow');
  return `${words('john.sheet.disputedBy', { name: by })}, ${left}`;
}

/** What a John still to do says after its kind: when it's due, and why then or why them. */
function openParts(item: MetaItem, viewing: RowViewing): string[] {
  const { viewerId, now, zone, words } = viewing;
  const due = dueInLine(item.dueAt, now, zone, words);
  // Pulled forward by someone's time away: say so.
  if (item.movedFrom) {
    const before = item.userId === viewerId ? words('today.nextUp.beforeYouGo') : words('week.summary.beforeTheyGo', { name: called(viewing.nameOf(item.userId), words) });
    return [`${due}, ${before}`];
  }
  // Smart: who had it last time, when that was someone else ("after Ada").
  if (item.dealt?.mode === "smart" && !item.together?.length) {
    const before = item.dealt.weighed.find((w) => w.last && w.userId !== item.userId);
    if (before) return [due, words('week.steady.after', { who: byName(before.userId, viewing) })];
  }
  return [due];
}

/** What the row says after its kind, by where the John has got to. */
function statusParts(item: MetaItem, viewing: RowViewing): string[] {
  const { now, zone, words } = viewing;
  switch (item.status) {
    case "checking":
      // In a family a kid's tick has no closing time: it waits for a parent.
      if (item.awaitsOk) return [words('today.parentOk.waiting')];
      if (!item.standsAt) return [];
      return [item.standsAt > now ? words('john.sheet.standsIn', { when: relative(item.standsAt, now, words) }) : words('john.sheet.standsSoon')];
    case "overdue":
    case "missed":
      return [words('today.nextUp.wasDue', { when: sinceLabel(item.dueAt, now, zone, words) })];
    case "done":
    case "late":
      return [item.doneAt ? words('today.nextUp.done', { when: dueInLine(item.doneAt, now, zone, words) }) : dueInLine(item.dueAt, now, zone, words)];
    case "excused":
      return [words('today.nextUp.excused')];
    case "covered":
      return [words('today.nextUp.coveredBy', { name: byName(item.coveredBy ?? null, viewing) })];
    default:
      return openParts(item, viewing);
  }
}

/** The row's meta line, and whether its lid dot leads it. */
function metaLine(item: MetaItem, viewing: RowViewing): { meta: string; lid: boolean } {
  if (item.status === "disputed") return { meta: disputedMeta(item, viewing), lid: false };
  const flagged = flaggedPart(item, viewing);
  const together = togetherPart(item, viewing);
  const parts = [johnKind(item.category, item.kindName), ...(flagged ? [flagged] : []), ...statusParts(item, viewing), ...(together ? [together] : [])];
  // A John with no kind leaves it out.
  return { meta: parts.filter(Boolean).join(", "), lid: true };
}

/**
 * The fold finished Johns go into, on Today and Week alike: "Done (2)", and
 * how many of those were late ("1 late", hazard words after it), or null
 * for none.
 */
export function doneFold(folded: readonly { status: LiveStatus }[], words: Words): { label: string; late: string | null } {
  const late = folded.filter((i) => i.status === "late").length;
  return { label: words('common.shell.done', { count: folded.length }), late: late > 0 ? words('week.summary.late', { count: late }) : null };
}
