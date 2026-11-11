import { memberCan } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcwIcon } from 'lucide-react-native';
import { useState } from 'react';

import { resetHouseData } from '@/api/settings';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { DangerRow, DangerZone } from '@/components/danger-zone';
import { Field } from '@/components/field';
import { useToast } from '@/components/toast';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';

/** Whether what was typed is the house's name, as people write it (case and spaces aside). */
export const namesHouse = (typed: string, name: string) => typed.trim().toLowerCase() === name.trim().toLowerCase();

/**
 * House rules' Danger zone, for an admin (house_reset:write), with the two
 * resets (docs/specs/house-reset.md): Reset history takes the house back to
 * before its first deal and keeps the John list; Reset everything clears the
 * list, groups, time away and rules too. Each sheet says what goes and what
 * stays, and its move can be pressed only once the house's name is typed.
 * Then every screen reads the house again. Nobody else sees the zone.
 */
export function HouseDangerZone({ houseId, view }: { houseId: string; view: HouseView }) {
  const words = useWords();
  const toast = useToast();
  const client = useQueryClient();
  const move = useMove(houseId);
  const [asking, setAsking] = useState<null | 'history' | 'everything'>(null);
  const [typed, setTyped] = useState('');
  const { house } = view.snapshot;
  if (!memberCan(view.me, 'house_reset:write')) return null;

  const everything = asking === 'everything';
  function open(which: 'history' | 'everything') {
    setTyped('');
    setAsking(which);
  }

  return (
    <DangerZone testID="danger-zone">
      {(['history', 'everything'] as const).map((which) => (
        <DangerRow
          key={which}
          title={words('house.reset.title', { everything: which === 'everything' })}
          meta={words('house.reset.meta', { everything: which === 'everything' })}
          action={words('house.reset.button')}
          icon={RotateCcwIcon}
          onPress={() => open(which)}
          testID={`reset-${which}`}
        />
      ))}
      <ConfirmSheet
        visible={asking !== null}
        title={words('house.reset.sheetTitle', { everything, house: house.name })}
        body={words(everything ? 'house.reset.everythingBody' : 'house.reset.historyBody', { kind: house.kind })}
        confirmLabel={words('house.reset.go')}
        icon={RotateCcwIcon}
        ready={namesHouse(typed, house.name)}
        busy={move.pending}
        busyLabel={words('common.busy.resetting')}
        problem={move.problem}
        onConfirm={() =>
          void move.run(() => resetHouseData(houseId, everything)).then(async (ok) => {
            if (!ok) return;
            // Every week, the Wall, the Stake and History changed: read them all again.
            await client.invalidateQueries();
            setAsking(null);
            toast.show(words('house.reset.done', { everything, house: house.name }));
          })
        }
        onClose={() => setAsking(null)}
        testID="reset-sheet"
      >
        <Field
          label={words('house.reset.confirm')}
          value={typed}
          onChangeText={setTyped}
          placeholder={house.name}
          autoCapitalize="none"
          autoCorrect={false}
          testID="reset-name"
        />
      </ConfirmSheet>
    </DangerZone>
  );
}
