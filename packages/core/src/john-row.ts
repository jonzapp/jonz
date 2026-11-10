import { isOpen, type BoardItem } from "./board";
import { FOCUS_SHELL_COPY } from "./copy";
import { andNames } from "./crew";
import { CATEGORY_SHORT } from "./domain";
import { dueInLine, firstName, relative, sinceLabel, STATUS_LABEL } from "./format";
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
 * John sheet): the short word, so the line keeps room for when. Anything
 * unknown is "Other".
 */
export function johnKind(category: string): string {
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

/**
 * One John's row, for whoever is looking (`viewerId`). Its meta line never
 * repeats what the tick box or the trailing item already says: "Kitchen,
 * today 21:00", "Kitchen, was due Tue", "Bins, stands in 21h", "Floors,
 * done Wed 21:00", "Disputed by Megan, 17h left".
 */
export function johnRow(
  item: Pick<
    BoardItem,
    "userId" | "name" | "category" | "points" | "needsPhoto" | "status" | "dueAt" | "movedFrom" | "doneAt" | "standsAt" | "dispute"
  > &
    Partial<Pick<BoardItem, "flaggedAt" | "flaggedBy" | "coveredBy" | "outcome" | "together" | "crew" | "absentAt" | "dealt" | "awaitsOk">>,
  viewerId: string,
  now: Date,
  zone: string,
  /** Anyone's full name, or null for someone who has left. */
  nameOf: (userId: string) => string | null, words: Words,
): JohnRowPlan {
  const { status } = item;
  const mine = item.userId === viewerId;
  const toDo = status === "upcoming" || status === "due-soon" || status === "overdue";
  const waitingForMe = waitsForYourVote(item, viewerId);
  // A cover still being checked: the coverer can take it back, anyone else can dispute it.
  const coverChecking = status === "covered" && !item.outcome;
  const myTick = tickerOf(item) === viewerId;
  const tick: JohnRowPlan["tick"] =
    status === "checking" || status === "disputed"
      ? status
      : status === "done" || status === "late"
        ? "done"
        : status === "excused"
          ? "excused"
          : "open";
  // A John done together is ticked with its roll call, in its sheet.
  const ticks = mine && toDo && (item.together?.length ?? 1) <= 1;
  const { meta, lid } = metaLine(item, viewerId, now, zone, nameOf, words);
  // Ticked by roll call, a place earns its holder's share of the job.
  const share = item.crew?.people.some((c) => c.userId === item.userId)
    ? pointsEarned(status, item.crew.total) / item.crew.people.length
    : null;
  return {
    tick,
    tickLabel: ticks
      ? item.needsPhoto
        ? words('today.nextUp.tickWithPhoto', { john: item.name })
        : words('today.nextUp.tick', { john: item.name })
      : tickSays(status, words),
    ticks,
    meta,
    lid,
    trailing:
      status === "checking" || coverChecking
        ? (coverChecking || item.crew ? myTick : mine)
          ? "undo"
          : "status"
        : status === "disputed"
          ? waitingForMe
            ? "vote"
            : "points"
          : status === "excused"
            ? null
            : status === "upcoming" || status === "done"
              ? "points"
              : "status",
    points: isOpen(status) ? item.points : (share ?? pointsEarned(status, item.points)),
    // Everyone but the ticker votes, so your own dispute opens on nothing in particular.
    focus:
      status === "disputed" && !myTick
        ? "vote"
        : (status === "checking" && !myTick) || (coverChecking && !myTick)
          ? "dispute"
          : null,
    hazardEdge: status === "overdue" || status === "missed",
  };
}

/** The row's meta line, and whether its lid dot leads it. */
function metaLine(
  item: Pick<BoardItem, "userId" | "category" | "status" | "dueAt" | "movedFrom" | "doneAt" | "standsAt" | "dispute"> &
    Partial<Pick<BoardItem, "flaggedAt" | "flaggedBy" | "together" | "crew" | "dealt" | "awaitsOk">> & {
    coveredBy?: string | null;
  },
  viewerId: string,
  now: Date,
  zone: string,
  nameOf: (userId: string) => string | null, words: Words,
): { meta: string; lid: boolean } {
  const mine = item.userId === viewerId;
  // An open flag says who flagged it ("flagged by Sam"), or that it's open again after a miss.
  const flagged =
    item.flaggedAt && isOpen(item.status)
      ? item.flaggedBy
        ? words('today.onCall.flaggedByInline', { name: item.flaggedBy === viewerId ? words('week.summary.byYou') : called(nameOf(item.flaggedBy), words) })
        : words('today.onCall.flaggedAgainInline')
      : null;
  // Done together: who with ("with Sam and Ada"), or once ticked, who did it.
  const others = (item.crew ? item.crew.people.map((c) => c.userId) : (item.together ?? [])).filter((id) => id !== item.userId);
  const together = others.length
    ? words('john.crew.with', { names: andNames(others.map((id) => (id === viewerId ? words('week.summary.byYou') : called(nameOf(id), words)))) })
    : null;
  const line = (...parts: string[]) => ({
    meta: [johnKind(item.category), ...(flagged ? [flagged] : []), ...parts, ...(together ? [together] : [])].join(", "),
    lid: true,
  });
  const due = dueInLine(item.dueAt, now, zone);

  switch (item.status) {
    case "disputed": {
      const dispute = item.dispute;
      if (!dispute) return { meta: STATUS_LABEL.disputed, lid: false };
      const by =
        dispute.raisedBy === null
          ? words('today.nextUp.someoneGone')
          : dispute.raisedBy === viewerId
            ? words('week.summary.byYou')
            : called(nameOf(dispute.raisedBy), words);
      const left =
        dispute.closesAt > now ? words('today.nextUp.left', { time: relative(dispute.closesAt, now).replace(/^in /, "") }) : words('today.nextUp.closingNow');
      return { meta: `${words('john.sheet.disputedBy', { name: by })}, ${left}`, lid: false };
    }
    case "checking":
      // In a family a kid's tick has no closing time: it waits for a parent.
      if (item.awaitsOk) return line(words('today.parentOk.waiting'));
      if (!item.standsAt) return line();
      return line(item.standsAt > now ? words('john.sheet.standsIn', { when: relative(item.standsAt, now) }) : words('john.sheet.standsSoon'));
    case "overdue":
    case "missed":
      return line(words('today.nextUp.wasDue', { when: sinceLabel(item.dueAt, now, zone) }));
    case "done":
    case "late":
      return line(item.doneAt ? words('today.nextUp.done', { when: dueInLine(item.doneAt, now, zone) }) : due);
    case "excused":
      return line(words('today.nextUp.excused'));
    case "covered": {
      const coverer = item.coveredBy ?? null;
      const by = coverer === viewerId ? words('week.summary.byYou') : called(coverer === null ? null : nameOf(coverer), words);
      return line(words('today.nextUp.coveredBy', { name: by }));
    }
    default:
      // Pulled forward by someone's time away: say so.
      if (item.movedFrom) {
        const before = mine ? words('today.nextUp.beforeYouGo') : words('week.summary.beforeTheyGo', { name: called(nameOf(item.userId), words) });
        return line(`${due}, ${before}`);
      }
      // Smart: who had it last time, when that was someone else ("after Ada").
      if (item.dealt?.mode === "smart" && !item.together?.length) {
        const before = item.dealt.weighed.find((w) => w.last && w.userId !== item.userId);
        if (before) return line(due, words('week.steady.after', { who: before.userId === viewerId ? words('week.summary.byYou') : called(nameOf(before.userId), words) }));
      }
      return line(due);
  }
}

/**
 * The fold finished Johns go into, on Today and Week alike: "Done (2)", and
 * how many of those were late ("1 late", hazard words after it), or null
 * for none.
 */
export function doneFold(folded: readonly { status: LiveStatus }[], words: Words): { label: string; late: string | null } {
  const late = folded.filter((i) => i.status === "late").length;
  return { label: FOCUS_SHELL_COPY.done(folded.length), late: late > 0 ? words('week.summary.late', { count: late }) : null };
}
