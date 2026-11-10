import { tz } from "@date-fns/tz";
import { format } from "date-fns";

import type { Currency } from "./domain";
import { dateRange, dayLabel } from "./format";
import { formatMoney } from "./money";
import { resetWhat } from "./resets";
import { addDaysTo, localDate } from "./week";
import { whomOf, whoseOf } from "./word-keys";
import type { Words } from "./words-for";

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
  words: Words,
): string {
  const john = String(data.name ?? words("wall.feed.aJohn"));
  // "You" starts a sentence; anywhere else it's "you", "your".
  const whose = whoseOf(subject, words);
  const whom = whomOf(subject, words);
  switch (kind) {
    case "tick":
      return words("wall.history.line.tick", { who, john, late: Boolean(data.late) });
    case "cover":
    case "dispute":
      return words(`wall.history.line.${kind}`, { who, whose, john });
    case "flag":
    case "immunity":
      return words(`wall.history.line.${kind}`, { who, john });
    case "swap":
      return words("wall.history.line.swap", { who, gave: String(data.gave ?? words("wall.feed.aJohn")), whose, john });
    case "vote":
      return words("wall.history.line.vote", { who, uphold: Boolean(data.uphold), whose, john });
    case "payment":
      return words("wall.history.line.payment", { who, amount: formatMoney(Number(data.amount ?? 0), currency), whom });
    case "away":
      return words("wall.history.line.away", { who, range: dateRange(String(data.starts_on), String(data.ends_on)) });
    case "role":
      return words("wall.history.line.role", { who, whom, to: data.to === "admin" ? "admin" : "member" });
    case "remove":
      return words("wall.history.line.remove", { who, whom });
    case "reset":
      return words("wall.history.line.reset", { who, what: resetWhat(data, subject, words) });
  }
}

/** What was undone, as the Wall says it to whoever's move it was: "your tick on Bins". */
export function undoneWhat(kind: string, name: string | null, words: Words): string {
  const john = name ?? words("wall.feed.aJohn");
  return (UNDONE_KINDS as readonly string[]).includes(kind) ? words(`wall.history.undoneWhat.${kind as (typeof UNDONE_KINDS)[number]}`, { john }) : words("wall.history.undoneWhat.other");
}

const UNDONE_KINDS = ["tick", "cover", "flag", "swap", "immunity", "dispute", "vote", "payment", "away", "role", "remove", "reset"] as const;

/** The line under a row: when, and whether it was undone or can't be now. */
export function historyMeta(item: HistoryItem, time: string, nameOf: (userId: string | null) => string, words: Words): string {
  if (item.undoneAt) {
    const by = item.undoneBy && item.undoneBy !== item.actor ? words('wall.history.undoneBy', { name: nameOf(item.undoneBy) }) : words('wall.history.undone');
    return `${time}, ${by}`;
  }
  return item.reach ? time : `${time}, ${words('wall.history.locked')}`;
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
export function historyDayLabel(day: HistoryDay, now: Date, zone: string, words: Words): string {
  const today = localDate(now, zone);
  if (day.date === today) return words('wall.history.today');
  if (day.date === addDaysTo(today, -1)) return words('wall.history.yesterday');
  return dayLabel(day.items[0].at, zone);
}

/** "21:04": when a move was, in the house's zone (its day is the section's label). */
export function historyTime(at: Date, zone: string): string {
  return format(at, "HH:mm", { in: tz(zone) });
}
