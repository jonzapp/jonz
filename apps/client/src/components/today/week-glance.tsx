import { weekAwayLine, weekAwayNote, weekPeople, weekRangeLine, weekSummary } from '@app/core';
import { StyleSheet, View } from 'react-native';

import type { AwayView } from '@/api/away';
import { Section } from '@/components/section';
import { TextButton } from '@/components/text-button';
import { WeekSummaryBar } from '@/components/week/summary';
import type { HouseView } from '@/hooks/use-house';
import { INSET } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * On a laptop, the house's week beside yours on Today: Week's summary bar
 * with its parts in one line and who's away, and the way to Week. Nothing
 * before the first deal.
 */
export function WeekGlance({ view, away }: { view: HouseView; away: AwayView | null }) {
  const words = useWords();
  const { board, snapshot, me, now } = view;
  const week = board.week;
  if (!week || board.items.length === 0) return null;
  const userId = me?.userId ?? '';
  const nameOf = (id: string) => snapshot.members.find((m) => m.userId === id)?.name ?? null;
  const note = away
    ? weekAwayLine(
        weekPeople(
          board.items,
          snapshot.members.map((m) => m.userId),
          userId,
        ).map((p) => ({
          userId: p.userId,
          away: weekAwayNote(away.periods, p.userId, week.startsOn, away.today, words),
        })),
        userId,
        nameOf,
       words)
    : null;
  return (
    <Section
      label={words('today.page.thisWeek')}
      right={<TextButton label={words('today.page.seeWeek')} href="/week" chevron align="end" testID="see-week" />}
      testID="week-glance"
    >
      <View style={styles.inner}>
        <WeekSummaryBar
          range={weekRangeLine(week.startsAt, week.endsAt, now, snapshot.rules.timezone, words)}
          summary={weekSummary(board.items, words)}
          filter={null}
          note={note}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  inner: { paddingVertical: INSET },
});
