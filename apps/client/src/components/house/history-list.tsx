import { actionLine, historyDayLabel, historyDays, historyFor, historyMeta, historyTime, dayLabel, type Currency, type HouseKind, type HistoryItem } from '@app/core';
import { HistoryIcon, LockIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { undoAction } from '@/api/history';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { Group, GroupItem } from '@/components/group';
import { ListFoot, type ListMore } from '@/components/list-foot';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { TextButton } from '@/components/text-button';
import { useToastIfAny } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { INSET } from '@/theme';
import { useWords } from '@/hooks/use-words';

export interface HistoryScene {
  houseId: string;
  me: string;
  zone: string;
  currency: Currency;
  /** Housemates or a family: "made Sam an admin", or "a parent". */
  kind: HouseKind;
  now: Date;
  /** "You" for the viewer, as on the Wall. */
  nameOf: (userId: string | null) => string;
  /** Their own name, for an avatar's initials. */
  fullName: (userId: string | null) => string;
  /** Without the House Pass: only the last four weeks read, and the end of the list says older moves need it. */
  locked?: boolean;
}

/**
 * History's body: Everyone or Mine, then the moves a day at a time, newest
 * first, each in words with its time, and Undo on the ones the database
 * says still reach (yours while they're open; anyone's, to an admin, until
 * the month is shared out). A refusal stays under the row it came from.
 * Older moves load as you scroll (the screen's `nearEnd`), under the foot
 * every long list has. Without the House Pass the list stops at four weeks
 * back, and its last row goes to the Pass page.
 */
export function HistoryList({
  items,
  scene,
  more,
}: {
  items: readonly HistoryItem[];
  scene: HistoryScene;
  more: ListMore;
}) {
  const words = useWords();
  const [mine, setMine] = useState(false);
  const shown = historyFor(items, scene.me, mine);
  const days = historyDays(shown, scene.zone);

  return (
    <>
      <View style={styles.pick}>
        <Segmented
          options={[
            { value: 'everyone', label: words('wall.history.everyone') },
            { value: 'mine', label: words('wall.history.mine') },
          ]}
          value={mine ? 'mine' : 'everyone'}
          onChange={(v) => setMine(v === 'mine')}
          label={words('wall.history.title')}
          testID="history-whose"
        />
      </View>
      {days.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={words('wall.history.title')} body={words('wall.history.empty')} testID="history-empty" />
      ) : (
        days.map((day) => (
          <Section key={day.date} label={historyDayLabel(day, scene.now, scene.zone, words)} testID="history-day">
            {day.items.map((item) => (
              <HistoryRow key={item.id} item={item} scene={scene} />
            ))}
          </Section>
        ))
      )}
      {items.length > 0 || more.has ? (
        <ListFoot
          more={more}
          shown={items.length > 0 ? words('common.list.backTo', { day: dayLabel(items[items.length - 1].at, scene.zone, words) }) : null}
          testID="history-foot"
        />
      ) : null}
      {scene.locked && !more.has ? (
        <Group testID="history-locked">
          <Row
            leading={<RowIcon icon={LockIcon} />}
            title={words('house.pass.olderHistory')}
            titleLines={2}
            meta={words('house.pass.unlock')}
            href="/house/pass"
            chevron
          />
        </Group>
      ) : null}
    </>
  );
}

function HistoryRow({ item, scene }: { item: HistoryItem; scene: HistoryScene }) {
  const words = useWords(scene.kind);
  const undo = useMove(scene.houseId);
  const toast = useToastIfAny();
  const who = scene.nameOf(item.actor);
  const line = actionLine(item.kind, item.data, who, scene.nameOf(item.subject), scene.currency, words);
  const meta = historyMeta(item, historyTime(item.at, scene.zone, words), scene.nameOf, words);

  return (
    <>
      <Row
        leading={<Avatar name={scene.fullName(item.actor)} userId={item.actor} me={item.actor === scene.me} />}
        title={line}
        titleLines={2}
        meta={meta}
        trailing={
          item.reach && !item.undoneAt ? (
            <TextButton
              label={words('wall.history.undo')}
              accessibilityLabel={words('wall.history.undoLabel', { line })}
              disabled={undo.pending}
              onPress={() =>
                void undo.run(() => undoAction(item.id)).then((done) => {
                  if (done) toast?.show(words('wall.history.wasUndone'));
                })
              }
              testID="history-undo"
            />
          ) : undefined
        }
        testID="history-row"
      />
      {undo.problem ? (
        <GroupItem>
          <Alert message={undo.problem} />
        </GroupItem>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pick: { paddingHorizontal: INSET, alignItems: 'flex-start' },
});
