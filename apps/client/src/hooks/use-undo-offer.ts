import { type ActionKind } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { undoAction, undoLatest } from '@/api/history';
import { useToastIfAny } from '@/components/toast';
import { houseKey } from '@/hooks/keys';
import { useWords } from '@/hooks/use-words';

/**
 * After a move: say it was done, with Undo for the toast's ten seconds.
 * Undo takes back your latest move of that kind about `about` (the John,
 * the dispute, the housemate) and reads the house again; a refusal is the
 * next toast. Older moves are undone from History. A reset, which isn't
 * one of your own moves on a John, passes its action instead.
 */
export function useUndoOffer(houseId: string) {
  const words = useWords();
  const toast = useToastIfAny();
  const client = useQueryClient();
  return useCallback(
    (message: string, kind: ActionKind | { action: string }, about?: string) => {
      toast?.show(message, {
        label: words('wall.history.undo'),
        onPress: () => {
          (typeof kind === 'string' ? undoLatest(kind, about) : undoAction(kind.action)).then(
            () => {
              void client.invalidateQueries({ queryKey: houseKey(houseId) });
              toast.show(words('wall.history.wasUndone'));
            },
            (reason: unknown) => toast.show(reason instanceof Error ? reason.message : String(reason)),
          );
        },
      });
    },
    [toast, client, houseId],
  );
}
