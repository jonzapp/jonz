import { BEST_TIMES, withRather, type BestTime, type MyPrefs, type Words } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { saveMyPrefs } from '@/api/my-prefs';
import type { JohnList } from '@/api/settings';
import { Alert } from '@/components/alert';
import { DayChips } from '@/components/day-chips';
import { GroupItem } from '@/components/group';
import { PickMenu } from '@/components/pick-menu';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { INSET, LABEL_GAP, SECTION_GAP } from '@/theme';
import { useWords } from '@/hooks/use-words';

const timeOptions = (words: Words): readonly { value: BestTime | 'any'; label: string }[] => [
  { value: 'any', label: words('week.steady.anyTime') },
  ...BEST_TIMES.map((value) => ({ value, label: words(`week.steady.time.${value}` as const) })),
];
const ratherOptions = (words: Words) =>
  (['1', '0', '-1'] as const).map((value) => ({ value, label: words(`week.steady.rather.${value === '-1' ? 'minus1' : value}` as const) }));

/**
 * Your preferences in this house, on Days and time away: the days that suit
 * you, your best time (what Plan it offers first), and each John you'd
 * rather do or rather not. Each change saves as it's made; the deal reads
 * them each Monday, and everyone still does their fair share.
 */
export function PrefsForm({ houseId, saved, list }: { houseId: string; saved: MyPrefs; list: JohnList }) {
  const words = useWords();
  const { johns } = list;
  const move = useMove(houseId);
  // What you've picked, ahead of the save that follows each change.
  const [prefs, setPrefs] = useState(saved);

  function change(next: MyPrefs) {
    setPrefs(next);
    void move.run(() => saveMyPrefs(houseId, next));
  }

  return (
    <View style={styles.page}>
      {move.problem ? <Alert message={move.problem} /> : null}
      <Section label={words('week.steady.days')} right={prefs.days.length ? undefined : words('week.steady.anyDay')}>
        <GroupItem>
          <DayChips value={prefs.days} onChange={(days) => change({ ...prefs, days })} label={words('week.steady.days')} testID="prefs-days" />
          <Meta>{words('week.steady.daysHint')}</Meta>
        </GroupItem>
      </Section>
      <Section label={words('week.steady.bestTime')}>
        <GroupItem>
          <Segmented
            options={timeOptions(words)}
            value={prefs.bestTime ?? 'any'}
            onChange={(t) => change({ ...prefs, bestTime: t === 'any' ? null : t })}
            label={words('week.steady.bestTime')}
            equal
            testID="prefs-time"
          />
          <Meta>{words('week.steady.bestTimeHint')}</Meta>
        </GroupItem>
      </Section>
      {johns.length ? (
        <View style={styles.noted}>
          <Section label={words('week.steady.johns')} testID="prefs-johns">
            {johns.map((john) => (
              <Row
                key={john.id}
                title={john.name}
                trailing={
                  <PickMenu
                    options={ratherOptions(words)}
                    value={String(prefs.rather[john.id] ?? 0) as '1' | '0' | '-1'}
                    onChange={(v) => change(withRather(prefs, john.id, Number(v) as 1 | 0 | -1))}
                    label={john.name}
                    testID={`prefs-john-${john.id}`}
                  />
                }
                testID="prefs-john"
              />
            ))}
          </Section>
          <Meta style={styles.note}>{words('week.steady.prefsNote')}</Meta>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SECTION_GAP },
  noted: { gap: LABEL_GAP },
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
});
