import { memberCan, RESULT_CHOICES, type BoardItem, type ResultChoice } from '@app/core';
import { RotateCcwIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem } from '@/components/group';
import { ResetPanel } from '@/components/reset-sheet';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';

import type { JohnSheetContext } from './body';
import { SheetLines, SheetSection } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * An admin's "Fix the result": one row under "Admin", whatever the John's
 * state, but not while a dispute decides it. The row opens the results it
 * could have instead (done, late, missed or let off) as rows in its place.
 * Picking one turns the sheet into the reset's numbers and its hazard button
 * (the reset sheet, in place), so nothing changes on one tap.
 */
export function ChangeResult({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const words = useWords();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<ResultChoice | null>(null);
  if (!memberCan(context.me, 'history:write') || item.dispute) return null;
  const now = item.outcome === 'covered' ? null : item.outcome;
  if (choice) {
    return (
      <SheetLines testID="change-result">
        <ResetPanel
          ask={{ houseId: context.houseId, kind: 'result', assignment: item.id, outcome: choice }}
          userId={context.userId}
          words={{ person: context.nameOf(item.userId), john: item.name, outcome: choice, was: item.outcome }}
          onClose={() => setChoice(null)}
        />
      </SheetLines>
    );
  }
  return (
    <SheetSection>
      <View testID="change-result">
        {picking ? (
          <Section label={words('house.resets.fixResult')}>
            {RESULT_CHOICES.filter((c) => c !== now).map((c) => (
              <Row key={c} title={words(`house.resets.choice.${c}` as const)} chevron onPress={() => setChoice(c)} testID={`result-${c}`} />
            ))}
            <GroupItem>
              <ButtonRow>
                <Button variant="outline" label={words('common.shell.cancel')} onPress={() => setPicking(false)} testID="fix-result-cancel" />
              </ButtonRow>
            </GroupItem>
          </Section>
        ) : (
          <Section label={words('house.resets.fixResultLabel')}>
            <Row
              leading={<RowIcon icon={RotateCcwIcon} />}
              title={words('house.resets.fixResult')}
              meta={words('house.resets.fixResultMeta')}
              chevron
              onPress={() => setPicking(true)}
              testID="fix-result"
            />
          </Section>
        )}
      </View>
    </SheetSection>
  );
}
