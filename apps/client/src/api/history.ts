import { historyItems, type ActionKind, type HistoryItem } from '@app/core';

import { snakeKeys } from './base';
import { callV1 } from './v1';

// Undo. house_history says, for each move, who may undo it now;
// undo_action and undo_latest check that again and put it back. The rules
// live in the migration (20261101090000_undo_history.sql).

/**
 * How many of the latest moves are read to find what can still be undone:
 * the most house_history gives at once, about six weeks of a busy house,
 * further back than any undo reaches (an admin's, until the month is shared out).
 */
export const UNDO_READ = 200;

/** The latest moves, newest first, each saying who may undo it now. */
export async function loadHistory(houseId: string, limit = UNDO_READ): Promise<HistoryItem[]> {
  const rows = await callV1('house_history', { houseId, limit });
  return historyItems(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      done_by: r.doneBy,
      subject_user_id: r.subjectUserId,
      assignment_id: r.assignmentId,
      ref: r.ref,
      // A move's details read in their own names ("starts_on").
      data: snakeKeys(r.data),
      created_at: r.createdAt,
      undone_at: r.undoneAt,
      undone_by: r.undoneBy,
      reach: r.reach,
    })),
  );
}

/** Undo one move, from the sheet of its post or its John. */
export async function undoAction(actionId: string): Promise<void> {
  await callV1('undo_action', { actionId });
}

/**
 * A toast's Undo: take back your latest move of this kind about this (a
 * John, a dispute, a housemate; with nothing, your latest of the kind),
 * whatever its id.
 */
export async function undoLatest(kind: ActionKind, about?: string): Promise<void> {
  await callV1('undo_latest', { kind, aboutId: about });
}
