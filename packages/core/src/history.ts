import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import type { Currency } from "./domain";
import { dateRange, dayLabel } from "./format";
import { formatMoney } from "./money";
import { resetWhat } from "./resets";
import { addDaysTo, localDate } from "./week";

// History: everything people did in the house, newest first, in words, with
// Undo where the database says it still reaches (house_history's `reach`).
// The database decides who may undo what and until when; this only says it.

/** The moves History records, as house_actions.kind names them. */
export const ACTION_KINDS = [
  "tick",
  "cover",
  "flag",
  "swap",
  "immunity",
  "dispute",
  "vote",
  "payment",
  "away",
  "role",
  "remove",
  "reset",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Who can undo it now: whoever did it, an admin, or nobody. */
export type UndoReach = "own" | "admin" | null;

export const HISTORY_COPY = {
  title: "History",
  meta: "Undo anything this month",
  /** On a phone, the Wall's switch between what the house did and History: its name to a screen reader. */
  show: "Show",
  empty: "Ticks, flags, swaps and changes land here, with Undo while it still reaches.",
  everyone: "Everyone",
  mine: "Mine",
  undo: "Undo",
  undoLabel: (line: string) => `Undo: ${line}`,
  today: "Today",
  yesterday: "Yesterday",
  undone: "Undone",
  undoneBy: (name: string) => `Undone by ${name}`,
  locked: "Can’t be undone now",
  /** The toast after an undo. */
  wasUndone: "Undone.",
  /** The toasts that offer Undo after a move. */
  ticked: "Marked done.",
  covered: "Covered.",
  flagged: "Flagged. Whoever’s on call has been told.",
  /** After Mark done: Undo takes back the tick and its flag. */
  doneIt: "Marked done. Counted once.",
  immunity: "Skip used.",
  swapped: "Swapped.",
  disputed: "Dispute raised.",
  paid: "Marked received.",
  inSplitwise: "Marked as added to Splitwise.",
  away: "Time away booked.",
  madeAdmin: (name: string) => `${name} is an admin now.`,
  madeHousemate: (name: string) => `${name} is a housemate now.`,
  removed: (name: string) => `${name} has been removed.`,
  reading: "Reading the house’s history",
  unreadable: "History couldn’t be read.",
  /** A housemate who has since left. */
  someone: "Someone",
} as const;

/** A row of house_history, as read. */
export interface ActionRow {
  id: string;
  kind: string;
  done_by: string | null;
  subject_user_id: string | null;
  assignment_id: string | null;
  ref: string | null;
  data: unknown;
  created_at: string;
  undone_at: string | null;
  undone_by: string | null;
  reach: string | null;
}

export interface HistoryItem {
  id: string;
  kind: ActionKind;
  actor: string | null;
  subject: string | null;
  assignmentId: string | null;
  ref: string | null;
  data: Record<string, unknown>;
  at: Date;
  undoneAt: Date | null;
  undoneBy: string | null;
  reach: UndoReach;
}

/** Rows into items. A kind this app doesn't know yet is left out rather than drawn wrong. */
export function historyItems(rows: readonly ActionRow[]): HistoryItem[] {
  return rows.flatMap((r) => {
    if (!(ACTION_KINDS as readonly string[]).includes(r.kind)) return [];
    return [
      {
        id: r.id,
        kind: r.kind as ActionKind,
        actor: r.done_by,
        subject: r.subject_user_id,
        assignmentId: r.assignment_id,
        ref: r.ref,
        data: (r.data ?? {}) as Record<string, unknown>,
        at: new Date(r.created_at),
        undoneAt: r.undone_at ? new Date(r.undone_at) : null,
        undoneBy: r.undone_by,
        reach: r.reach === "own" || r.reach === "admin" ? r.reach : null,
      },
    ];
  });
}

/** Only what you did ("Mine"), or everyone's. */
export function historyFor(items: readonly HistoryItem[], userId: string, mine: boolean): HistoryItem[] {
  return mine ? items.filter((i) => i.actor === userId) : [...items];
}

/**
 * What a move was, in words, for History's row and the Wall's "undone"
 * line. `nameOf` gives "You" for the viewer, as the Wall's does.
 */
export function actionLine(
  kind: ActionKind,
  data: Record<string, unknown>,
  who: string,
  subject: string,
  currency: Currency,
): string {
  const john = String(data.name ?? "a John");
  // "You" starts a sentence; anywhere else it's "you", "your".
  const obj = (name: string) => (name === "You" ? "you" : name);
  const possessive = (name: string) => (name === "You" ? "your" : `${name}’s`);
  switch (kind) {
    case "tick":
      return `${who} ticked ${john}${data.late ? ", late" : ""}`;
    case "cover":
      return `${who} covered ${possessive(subject)} ${john}`;
    case "flag":
      return `${who} flagged ${john}`;
    case "swap":
      return `${who} swapped ${String(data.gave ?? "a John")} for ${possessive(subject)} ${john}`;
    case "immunity":
      return `${who} used a skip on ${john}`;
    case "dispute":
      return `${who} disputed ${possessive(subject)} ${john}`;
    case "vote":
      return `${who} voted to ${data.uphold ? "strike" : "keep"} ${possessive(subject)} ${john}`;
    case "payment":
      return `${who} got ${formatMoney(Number(data.amount ?? 0), currency)} from ${obj(subject)}`;
    case "away":
      return `${who} booked time away, ${dateRange(String(data.starts_on), String(data.ends_on))}`;
    case "role":
      return data.to === "admin" ? `${who} made ${obj(subject)} an admin` : `${who} made ${obj(subject)} a housemate`;
    case "remove":
      return `${who} removed ${obj(subject)} from the house`;
    case "reset":
      return `${who} ${resetWhat(data, subject)}`;
  }
}

/** What was undone, as the Wall says it to whoever's move it was: "your tick on Bins". */
export function undoneWhat(kind: string, name: string | null): string {
  const john = name ?? "a John";
  switch (kind) {
    case "tick":
      return `tick on ${john}`;
    case "cover":
      return `cover of ${john}`;
    case "flag":
      return `flag on ${john}`;
    case "swap":
      return `swap for ${john}`;
    case "immunity":
      return `a skip on ${john}`;
    case "dispute":
      return `dispute of ${john}`;
    case "vote":
      return `vote on ${john}`;
    case "payment":
      return "payment";
    case "away":
      return "time away";
    case "role":
      return "admin change";
    case "remove":
      return "removal";
    case "reset":
      return "reset";
    default:
      return "change";
  }
}

/** The line under a row: when, and whether it was undone or can't be now. */
export function historyMeta(item: HistoryItem, time: string, nameOf: (userId: string | null) => string): string {
  if (item.undoneAt) {
    const by = item.undoneBy && item.undoneBy !== item.actor ? HISTORY_COPY.undoneBy(nameOf(item.undoneBy)) : HISTORY_COPY.undone;
    return `${time}, ${by}`;
  }
  return item.reach ? time : `${time}, ${HISTORY_COPY.locked}`;
}

export interface HistoryDay {
  /** The local date, YYYY-MM-DD. */
  date: string;
  items: HistoryItem[];
}

/** Items into days in the house's zone, newest day first, keeping their order. */
export function historyDays(items: readonly HistoryItem[], zone: string): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const item of items) {
    const date = localDate(item.at, zone);
    const last = days[days.length - 1];
    if (last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }
  return days;
}

/** "Today", "Yesterday", or the day: "Tue 27 Oct". */
export function historyDayLabel(day: HistoryDay, now: Date, zone: string): string {
  const today = localDate(now, zone);
  if (day.date === today) return HISTORY_COPY.today;
  if (day.date === addDaysTo(today, -1)) return HISTORY_COPY.yesterday;
  return dayLabel(day.items[0].at, zone);
}

/** "21:04": when a move was, in the house's zone (its day is the section's label). */
export function historyTime(at: Date, zone: string): string {
  return format(at, "HH:mm", { in: tz(zone) });
}
