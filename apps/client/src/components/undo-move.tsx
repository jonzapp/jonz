import { actionLine, type Currency, type HistoryItem } from '@app/core';
import { Undo2Icon } from 'lucide-react-native';

import { undoAction } from '@/api/history';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { useToastIfAny } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';

/** Who's looking, and how to name people, for an Undo's words. */
export interface UndoScene {
  houseId: string;
  me: string;
  currency: Currency;
  /** Anyone's name by id ("A former housemate" for someone gone). */
  nameOf: (userId: string) => string;
}

/**
 * Undo for one move, inside the sheet that opens from its post or its
 * John (History's job, now there's no History): outline, full width, as
 * the John sheet's own Undo. `spell` says what it undoes ("Undo: Sam
 * ticked Bins"), for a sheet that may offer more than one; otherwise it
 * reads "Undo", and says the move to a screen reader. Done, the toast says
 * so; refused, the reason shows under it.
 */
export function UndoMove({ item, scene, spell = false }: { item: HistoryItem; scene: UndoScene; spell?: boolean }) {
  const words = useWords();
  const move = useMove(scene.houseId);
  const toast = useToastIfAny();
  const name = (id: string | null) => (id === scene.me ? words('wall.feed.you') : id ? scene.nameOf(id) : words('wall.history.someone'));
  const line = actionLine(item.kind, item.data, name(item.actor), name(item.subject), scene.currency, words);
  const label = words('wall.history.undoLabel', { line });
  return (
    <>
      <Button
        variant="outline"
        icon={Undo2Icon}
        label={spell ? label : words('wall.history.undo')}
        spoken={label}
        busy={move.pending}
        busyLabel={words('common.busy.undoing')}
        onPress={() =>
          void move.run(() => undoAction(item.id)).then((done) => {
            if (done) toast?.show(words('wall.history.wasUndone'));
          })
        }
        testID="undo-move"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
    </>
  );
}
