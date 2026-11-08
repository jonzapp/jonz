import { memberCan, RESET_COPY, RESULT_CHOICES, type BoardItem, type ResultChoice } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ResetPanel } from '@/components/reset-sheet';
import { Meta } from '@/components/text';
import { SPACE } from '@/theme';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';

/**
 * An admin's "Change result": done, late, missed or let off, whatever the
 * John's state, but not while a dispute decides it. Picking one turns the
 * sheet into the reset's numbers and its hazard button (the reset sheet,
 * in place), so nothing changes on one tap.
 */
export function ChangeResult({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const [choice, setChoice] = useState<ResultChoice | null>(null);
  if (!memberCan(context.me, 'history:write') || item.dispute) return null;
  const now = item.outcome === 'covered' ? null : item.outcome;
  return (
    <SheetLines testID="change-result">
      <Meta>{RESET_COPY.changeResult}</Meta>
      {choice ? (
        <ResetPanel
          ask={{ houseId: context.houseId, kind: 'result', assignment: item.id, outcome: choice }}
          userId={context.userId}
          words={{ person: context.nameOf(item.userId), john: item.name, outcome: choice, was: item.outcome }}
          onClose={() => setChoice(null)}
        />
      ) : (
        <View style={styles.choices}>
          {RESULT_CHOICES.filter((c) => c !== now).map((c) => (
            <Button
              key={c}
              variant="outline"
              label={RESET_COPY.choice[c]}
              onPress={() => setChoice(c)}
              testID={`result-${c}`}
            />
          ))}
        </View>
      )}
    </SheetLines>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
