import { CHAT_MOVES_COPY, type ChatMove } from '@app/core';
import { CalendarCheckIcon, CalendarXIcon, CheckIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { cancelAway, setAway } from '@/api/away';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';

/**
 * Ask Jonz's card for moves that aren't changes to the John list (time
 * away): each row starts ticked and can be unticked, and nothing happens
 * before the button. It does them through the same calls the app's own pages
 * make, as the person, so they're checked the same way.
 */
export function MovesCard({ houseId, items }: { houseId: string; items: readonly ChatMove[] }) {
  const move = useMove(houseId);
  const [keep, setKeep] = useState<number[]>(() => items.map((_, at) => at));
  const [done, setDone] = useState<number | null>(null);

  async function apply() {
    let count = 0;
    await move.run(async () => {
      for (const at of keep) {
        const m = items[at];
        if (m.kind === 'away') await setAway({ from: m.from, to: m.to, note: m.note });
        else await cancelAway(m.awayId);
        count += 1;
      }
    });
    // Part way through, what got done is done; the card says so, and the problem stays shown.
    if (count > 0) setDone(count);
  }

  if (done !== null) {
    return (
      <View style={styles.card} testID="moves-done">
        <Row title={CHAT_MOVES_COPY.done(done)} leading={<RowIcon icon={CheckIcon} />} />
        {move.problem ? <Alert message={move.problem} /> : null}
      </View>
    );
  }

  const toggle = (at: number) => setKeep((was) => (was.includes(at) ? was.filter((k) => k !== at) : [...was, at].sort((a, b) => a - b)));
  return (
    <View style={styles.card} testID="moves-card">
      <Section label={CHAT_MOVES_COPY.card} right={CHAT_MOVES_COPY.cardMeta}>
        {items.map((item, at) => (
          <ChoiceRow
            key={at}
            role="checkbox"
            label={CHAT_MOVES_COPY.title(item)}
            meta={CHAT_MOVES_COPY.meta(item)}
            leading={<RowIcon icon={item.kind === 'away' ? CalendarCheckIcon : CalendarXIcon} />}
            checked={keep.includes(at)}
            onPress={() => toggle(at)}
            disabled={move.pending}
            metaLines={2}
            testID={`move-${item.kind}`}
          />
        ))}
      </Section>
      {move.problem ? <Alert message={move.problem} /> : null}
      <ButtonRow>
        <Button
          label={move.pending ? CHAT_MOVES_COPY.applying : CHAT_MOVES_COPY.apply(keep.length)}
          onPress={() => void apply()}
          disabled={move.pending || keep.length === 0}
          testID="moves-apply"
        />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
});
