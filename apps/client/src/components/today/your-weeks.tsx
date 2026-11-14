import { recordPct, yourWeeks, YOUR_WEEKS, type YourWeeks as Weeks } from '@app/core';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OutlineRows } from '@/components/outline';
import { Section } from '@/components/section';
import { Meta, RowTitle } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { WeekStrip } from '@/components/week/week-strip';
import type { HouseView } from '@/hooks/use-house';
import { useRecord } from '@/hooks/use-record';
import { useWords } from '@/hooks/use-words';
import { INSET, ROW_GAP, SPACE, useTheme } from '@/theme';

/** Your weeks, for Today: still reading, nothing to show (nothing dealt to you yet, or the read failed), or them. */
export type YourWeeksRead = { reading: true } | { reading: false; weeks: Weeks | null };

/** How someone's recent weeks went (record.ts yourWeeks), from the track record's rows. */
export function useYourWeeks(view: HouseView, userId: string): YourWeeksRead {
  const words = useWords();
  const rows = useRecord(view.snapshot.house.id);
  if (rows.isLoading) return { reading: true };
  const member = view.snapshot.members.find((m) => m.userId === userId);
  if (!rows.data || !member) return { reading: false, weeks: null };
  const input = { ...rows.data, memberIds: view.snapshot.members.map((m) => m.userId), now: view.now, zone: view.snapshot.rules.timezone };
  return { reading: false, weeks: yourWeeks(input, member, words) };
}

/**
 * Today's Your weeks: how your last few weeks went, a light game to keep you
 * going. Laid out as your row on the Track record is: a kind line and your
 * on-time figure, a bar a week (always YOUR_WEEKS across, the weeks still to
 * come in grey, this week an outline), then what your streak earns next.
 * Good weeks are cheered; a slip gets a fresh start, never a telling off.
 * The whole of it opens the Track record.
 */
export function YourWeeks({ read }: { read: YourWeeksRead }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  if (!read.reading && !read.weeks) return null;
  const label = words('today.weeks.title');
  const more = <TextButton label={words('week.record.open')} href="/week/record" chevron align="end" testID="your-weeks-record" />;
  if (read.reading) {
    return (
      <Section label={label} right={more} testID="your-weeks-reading">
        <OutlineRows count={1} lead="none" />
      </Section>
    );
  }
  const weeks = read.weeks!;
  const pct = weeks.onTimePct === null ? null : recordPct(weeks.onTimePct, words);
  // Said as sentences: the cheer ends with its own full stop.
  const spoken = [weeks.cheer, pct ? `${pct} ${words('week.record.onTime').toLowerCase()}.` : null, weeks.meta].filter(Boolean).join(' ');
  return (
    <Section label={label} right={more} testID="your-weeks">
      <Link href="/week/record" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={spoken}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          // One flat object: Link's asChild spreads the style, dropping an array.
          style={StyleSheet.flatten([styles.row, pressed && { backgroundColor: colors.secondary }])}
          testID="your-weeks-row"
        >
          <View style={styles.head}>
            <RowTitle numberOfLines={2} style={styles.cheer}>
              {weeks.cheer}
            </RowTitle>
            {pct ? <Text style={[type.rowTitle, styles.pct]}>{pct}</Text> : null}
          </View>
          <WeekStrip cells={weeks.marks.map((mark) => ({ mark }))} columns={YOUR_WEEKS} toCome />
          <Meta>{weeks.meta}</Meta>
        </Pressable>
      </Link>
    </Section>
  );
}

const styles = StyleSheet.create({
  // As a Track record row: words and figure, the bars, then Meta.
  row: { paddingHorizontal: INSET, paddingVertical: SPACE.md, gap: SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  cheer: { flex: 1, minWidth: 0 },
  pct: { flexShrink: 0 },
});
