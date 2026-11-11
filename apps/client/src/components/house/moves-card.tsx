import { moveIsDangerous, moveMeta, moveTitle, type ChatMove } from '@app/core';
import { CalendarCheckIcon, CalendarXIcon, CheckIcon, TriangleAlertIcon, ZapIcon, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { cancelAway, setAway } from '@/api/away';
import { runCardOperation } from '@/api/operations';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { anyDangerous, MoveList } from '@/components/move-list';
import { Row, RowIcon } from '@/components/row';
import { ChoiceRow } from '@/components/setup/choice-row';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

const ICON: Record<ChatMove['kind'], LucideIcon> = { away: CalendarCheckIcon, cancel_away: CalendarXIcon, operation: ZapIcon };

/**
 * Ask Jonz's card for moves that aren't changes to the John list (time
 * away, and any of the house's writes: core ask-operations.ts): each row
 * starts ticked and can be unticked, and nothing happens before the button.
 * It does them through the same calls the app's own pages make, as the
 * person, so they're checked the same way. Moves that can't be taken back
 * sit in a Danger zone (MoveList), and while one is ticked the button is a
 * hazard button.
 */
export function MovesCard({ houseId, me, items }: { houseId: string; me: string; items: readonly ChatMove[] }) {
  const move = useMove(houseId);
  const words = useWords();
  const [keep, setKeep] = useState<number[]>(() => items.map((_, at) => at));
  const [done, setDone] = useState<number | null>(null);

  async function apply() {
    let count = 0;
    await move.run(async () => {
      for (const at of keep) {
        const m = items[at];
        if (m.kind === 'away') await setAway({ from: m.from, to: m.to, note: m.note });
        else if (m.kind === 'cancel_away') await cancelAway(m.awayId);
        else await runCardOperation(m.operation, m.input, { userId: me, words });
        count += 1;
      }
    });
    // Part way through, what got done is done; the card says so, and the problem stays shown.
    if (count > 0) setDone(count);
  }

  if (done !== null) {
    return (
      <View style={styles.card} testID="moves-done">
        <Row title={words('ask.moves.done', { n: done })} leading={<RowIcon icon={CheckIcon} />} />
        {move.problem ? <Alert message={move.problem} /> : null}
      </View>
    );
  }

  const toggle = (at: number) => setKeep((was) => (was.includes(at) ? was.filter((k) => k !== at) : [...was, at].sort((a, b) => a - b)));
  const danger = anyDangerous(items, keep, moveIsDangerous);
  return (
    <View style={styles.card} testID="moves-card">
      <MoveList
        label={words('ask.moves.card')}
        meta={words('ask.moves.cardMeta')}
        items={items}
        dangerous={moveIsDangerous}
        row={(item, at) => (
          <ChoiceRow
            key={at}
            role="checkbox"
            label={moveTitle(item, words)}
            meta={moveMeta(item, words)}
            leading={<RowIcon icon={ICON[item.kind]} />}
            checked={keep.includes(at)}
            onPress={() => toggle(at)}
            disabled={move.pending}
            metaLines={2}
            testID={item.kind === 'operation' ? `move-${item.operation}` : `move-${item.kind}`}
          />
        )}
        testID="moves-list"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
      <ButtonRow>
        <Button
          {...(danger ? { variant: 'hazard' as const, icon: TriangleAlertIcon } : {})}
          label={words('ask.moves.apply', { n: keep.length })}
          busyLabel={words('ask.moves.applying')}
          onPress={() => void apply()}
          busy={move.pending}
          disabled={keep.length === 0}
          testID="moves-apply"
        />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
});
