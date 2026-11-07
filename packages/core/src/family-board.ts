import type { BoardItem } from "./board";
import { localDate } from "./week";

/**
 * The board, a family's shared screen for the kitchen tablet
 * (docs/specs/family-houses.md, "The board"): a column for each kid, with
 * what's theirs today.
 */

export interface BoardColumn {
  userId: string;
  name: string;
  /** Still to do (due today or before, open), then waiting for an OK, then done today. */
  items: BoardItem[];
  /** How many are still to do. */
  toDo: number;
}

const OPEN = new Set(["upcoming", "due-soon", "overdue"]);

/**
 * Each kid's column, in the order given: their Johns still to do that are
 * due by the end of today, those waiting for a parent's OK, and those done
 * today. Earliest due first in each part.
 */
export function boardColumns(
  items: readonly BoardItem[],
  kids: readonly { userId: string; name: string }[],
  now: Date,
  zone: string,
): BoardColumn[] {
  const today = localDate(now, zone);
  const byDue = (a: BoardItem, b: BoardItem) => a.dueAt.getTime() - b.dueAt.getTime();
  return kids.map((kid) => {
    const mine = items.filter((i) => i.userId === kid.userId && !i.absentAt);
    const toDo = mine.filter((i) => OPEN.has(i.status) && localDate(i.dueAt, zone) <= today).sort(byDue);
    const waiting = mine.filter((i) => i.awaitsOk && i.doneAt).sort(byDue);
    const done = mine
      .filter((i) => !i.awaitsOk && i.doneAt && localDate(i.doneAt, zone) === today && !OPEN.has(i.status))
      .sort(byDue);
    return { userId: kid.userId, name: kid.name, items: [...toDo, ...waiting, ...done], toDo: toDo.length };
  });
}
