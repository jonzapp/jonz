import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { planJohn } from '@/api/johns';
import { useToastIfAny } from '@/components/toast';
import { houseKey } from '@/hooks/keys';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';

/**
 * Plan when you'll do one of your Johns (or clear the plan), then say so in
 * a toast with Undo, which puts back the plan it had before. A refusal is
 * `problem`; one on Undo is the next toast.
 */
export function usePlan(houseId: string, assignmentId: string, before: Date | null) {
  const words = useWords();
  const move = useMove(houseId);
  const toast = useToastIfAny();
  const client = useQueryClient();
  const plan = useCallback(
    async (at: Date | null, message: string): Promise<boolean> => {
      const done = await move.run(() => planJohn(assignmentId, at));
      if (done) {
        toast?.show(message, {
          label: words('wall.history.undo'),
          onPress: () => {
            planJohn(assignmentId, before).then(
              () => {
                void client.invalidateQueries({ queryKey: houseKey(houseId) });
                toast.show(words('wall.history.wasUndone'));
              },
              (reason: unknown) => toast.show(reason instanceof Error ? reason.message : String(reason)),
            );
          },
        });
      }
      return done;
    },
    [move, toast, client, houseId, assignmentId, before],
  );
  return { pending: move.pending, problem: move.problem, plan };
}
