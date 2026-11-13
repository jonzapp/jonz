import { johnSheetMode, memberCan, undoableOn, type BoardItem, type HistoryItem } from '@app/core';

import { UndoMove } from '@/components/undo-move';
import { useUndoable } from '@/hooks/use-undoable';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';

/**
 * Undo for every move about this John that whoever's looking can still take
 * back (History's job, once a list of its own): a swap, a skip, a dispute,
 * a vote, an admin's fix, or, to an admin, a housemate's tick. Moves the
 * sheet already offers its own way are left to it: your tick or cover while
 * it's being checked (Undo, with its warning) and an open flag (Remove flag).
 * More than one says what each undoes.
 */
export function UndoPart({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const undoable = useUndoable(context.houseId);
  const moves = undoableOn(item.id, undoable.data ?? []).filter((move) => !offeredAlready(move, item, context));
  if (moves.length === 0) return null;
  const scene = { houseId: context.houseId, me: context.userId, currency: context.rules.currency, nameOf: context.nameOf };
  return (
    <SheetLines testID="john-undo">
      {moves.map((move) => (
        <UndoMove key={move.id} item={move} scene={scene} spell={moves.length > 1} />
      ))}
    </SheetLines>
  );
}

function offeredAlready(move: HistoryItem, item: BoardItem, context: JohnSheetContext): boolean {
  if ((move.kind === 'tick' || move.kind === 'cover') && move.actor === context.userId) {
    return johnSheetMode(item, context.userId) === 'yours-checking';
  }
  if (move.kind === 'flag') {
    const open = item.flaggedAt !== null && item.doneAt === null && item.outcome === null;
    return open && (item.flaggedBy === context.userId || memberCan(context.me, 'flags:write'));
  }
  return false;
}
