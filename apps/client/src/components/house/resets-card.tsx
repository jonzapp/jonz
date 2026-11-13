import { resetItemLine, toldLine, type ChatReset, type Currency } from '@app/core';
import { CheckIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { undoAction } from '@/api/history';
import { applyReset } from '@/api/resets';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { HazardTape } from '@/components/hazard-tape';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Meta } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { INSET, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Ask Jonz's Resets card: what Jonz offers to put right, each with the
 * server's numbers, under hazard tape. Every row starts ticked and can be
 * unticked; the hazard button resets what's ticked, and nothing changes
 * before it. Afterwards the card says what was done, and Undo takes the
 * resets back (an undo is already a putting back, so it has
 * no Undo of its own).
 */
export function ResetsCard({
  houseId,
  items,
  me,
  nameOf,
  currency,
  zone,
}: {
  houseId: string;
  items: readonly ChatReset[];
  me: string;
  /** Anyone's name by id; the viewer's is "You". */
  nameOf: (userId: string) => string;
  currency: Currency;
  zone: string;
}) {
  const words = useWords();
  const move = useMove(houseId);
  const [keep, setKeep] = useState<number[]>(() => items.map((_, at) => at));
  // The History rows of what this card reset, once it has; null before.
  const [done, setDone] = useState<{ count: number; actions: string[] } | null>(null);
  const [undone, setUndone] = useState(false);
  const said = { nameOf, viewerId: me, currency, zone };
  const lines = items.map((item) => resetItemLine(item, said, words));
  const told = keep.flatMap((at) => lines[at].told);

  async function apply() {
    const actions: string[] = [];
    const chosen = keep.map((at) => items[at]);
    const ok = await move.run(async () => {
      for (const item of chosen) {
        if (item.kind === 'undo') await undoAction(item.action);
        else actions.push(await applyReset({ houseId, ...item.ask }));
      }
    });
    // Part way through, what was reset is still reset: Undo takes back what got done.
    if (ok || actions.length > 0) setDone({ count: ok ? chosen.length : actions.length, actions });
  }

  async function undo() {
    if (!done) return;
    const ok = await move.run(async () => {
      for (const action of [...done.actions].reverse()) await undoAction(action);
    });
    if (ok) setUndone(true);
  }

  if (done) {
    return (
      <View style={styles.card} testID="resets-done">
        <Row
          title={undone ? words('house.resets.putBack') : words('house.resets.appliedN', { n: done.count })}
          leading={<RowIcon icon={undone ? Undo2Icon : CheckIcon} />}
          testID="resets-done-row"
        />
        {move.problem ? <Alert message={move.problem} /> : null}
        {!undone && done.actions.length > 0 ? (
          <ButtonRow>
            <Button variant="outline" icon={Undo2Icon} label={words('house.resets.undoAll')} onPress={() => void undo()} busy={move.pending} busyLabel={words('common.busy.undoing')} testID="resets-undo" />
          </ButtonRow>
        ) : null}
      </View>
    );
  }

  const toggle = (at: number) => setKeep((was) => (was.includes(at) ? was.filter((k) => k !== at) : [...was, at].sort((a, b) => a - b)));
  return (
    <View style={styles.card} testID="resets-card">
      <HazardTape tone="hazard" height={8} />
      <Section label={words('house.resets.card')} right={words('house.resets.cardMeta')}>
        {items.map((item, at) => (
          <ChoiceRow
            key={at}
            role="checkbox"
            label={lines[at].title}
            meta={lines[at].meta}
            checked={keep.includes(at)}
            onPress={() => toggle(at)}
            disabled={move.pending}
            metaLines={2}
            testID={`reset-item-${item.kind}`}
          />
        ))}
      </Section>
      <Meta style={styles.inset} testID="resets-told">
        {toldLine(told, nameOf, words)}
      </Meta>
      {move.problem ? <Alert message={move.problem} /> : null}
      <ButtonRow>
        <Button
          variant="hazard"
          icon={RotateCcwIcon}
          label={words('house.resets.applyN', { n: keep.length })}
          busyLabel={words('house.resets.applying')}
          onPress={() => void apply()}
          busy={move.pending}
          disabled={keep.length === 0}
          testID="resets-apply"
        />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
  inset: { paddingHorizontal: INSET },
});
