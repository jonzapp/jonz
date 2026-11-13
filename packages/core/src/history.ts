import type { Currency } from "./domain";
import { dateRange } from "./format";
import { formatMoney } from "./money";
import { resetWhat } from "./resets";
import { whomOf, whoseOf } from "./word-keys";
import type { Words } from "./words-for";

// Undo: the moves people made in the house (house_history), each saying
// who may still undo it (`reach`), found for the sheet of its Wall post or
// its John. The database decides who may undo what and until when; this only says it.

/** The moves that can be undone, as house_actions.kind names them. */
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

/** The moves that can still be undone by whoever reads them: not undone yet, and within reach. */
export function undoable(items: readonly HistoryItem[]): HistoryItem[] {
  return items.filter((i) => i.reach !== null && i.undoneAt === null);
}

/** What a Wall post needs to find its move: as the Wall reads an event. */
export interface PostOfMove {
  id: string;
  kind: string;
  userId: string | null;
  assignmentId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

/**
 * The move a Wall post records, if it can still be undone: what its sheet
 * offers Undo for, now History is gone. Most moves name their post
 * (`data.event`); a flag is found by its John, time away by the booking,
 * and someone removed by their "moved out" post at the same moment.
 */
export function undoForPost(post: PostOfMove, items: readonly HistoryItem[]): HistoryItem | null {
  const open = undoable(items);
  const named = open.find((i) => i.data.event === post.id);
  if (named) return named;
  switch (post.kind) {
    case "flagged":
      return open.find((i) => i.kind === "flag" && post.assignmentId !== null && i.assignmentId === post.assignmentId) ?? null;
    case "away":
      return open.find((i) => i.kind === "away" && post.data.away != null && i.ref === post.data.away) ?? null;
    case "moved_out":
      return open.find((i) => i.kind === "remove" && i.subject === post.userId && Math.abs(i.at.getTime() - post.createdAt.getTime()) <= 60_000) ?? null;
    default:
      return null;
  }
}

/**
 * The moves about one John that can still be undone, newest first: its
 * tick or cover, a flag, a swap either way, a skip, a dispute, a vote, or
 * an admin's fix of its result. The John sheet offers Undo for each.
 */
export function undoableOn(assignmentId: string, items: readonly HistoryItem[]): HistoryItem[] {
  return undoable(items).filter((i) => i.assignmentId === assignmentId || (i.kind === "swap" && i.ref === assignmentId));
}

/**
 * What a move was, in words, for its Undo and the Wall's "undone"
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
      return words("wall.history.line.payment", { who, amount: formatMoney(Number(data.amount ?? 0), currency, words), whom });
    case "away":
      return words("wall.history.line.away", { who, range: dateRange(String(data.starts_on), String(data.ends_on), words) });
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
