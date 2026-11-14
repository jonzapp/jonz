import { recordCounts, recordPct, type RecordMark, type RecordRow } from '@app/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Group, Hairline, useRowInset } from '@/components/group';
import { Meta, RowTitle } from '@/components/text';
import { KeyBar, MonthBars, STRIP_ROW, WeekStrip } from '@/components/week/week-strip';
import { useWords } from '@/hooks/use-words';
import { INSET, ROW_GAP, SPACE, useTheme } from '@/theme';

/** The fewest columns a grid has: a month of weeks. */
const MIN_COLUMNS = 5;

/**
 * The track record's grid: one row per person, their on-time share as the
 * figure, their bars under their name (on Year, a split bar a month), and
 * what they add up to under those. Every row's bars share one set of
 * columns, as many as the longest row holds (at least a month's worth, so
 * two weeks aren't two slabs; at most a quarter's), so they line up down
 * the page. A row opens that person's breakdown: on a phone as a page of its
 * own, on a laptop beside the grid, where `chosenId`'s row is on the tint
 * with an ink edge.
 */
export function RecordGrid({
  rows,
  viewerId,
  nameOf,
  onOpen,
  chosenId = null,
}: {
  rows: readonly RecordRow[];
  viewerId: string;
  /** Anyone's name by id. */
  nameOf: (userId: string) => string;
  onOpen: (userId: string) => void;
  /** Whose breakdown is open beside the grid, on a laptop. */
  chosenId?: string | null;
}) {
  const columns = Math.min(Math.max(MIN_COLUMNS, ...rows.map((r) => r.cells.length)), STRIP_ROW);
  return (
    <Group testID="record-grid">
      {rows.map((row, i) => (
        <RecordLine
          key={row.userId}
          row={row}
          columns={columns}
          first={i === 0}
          you={row.userId === viewerId}
          name={nameOf(row.userId)}
          onOpen={onOpen}
          chosen={row.userId === chosenId}
        />
      ))}
    </Group>
  );
}

function RecordLine({
  row,
  columns,
  first,
  you,
  name,
  onOpen,
  chosen,
}: {
  row: RecordRow;
  /** How many bars a line holds. */
  columns: number;
  /** The top row, which names the months on Year. */
  first: boolean;
  you: boolean;
  name: string;
  onOpen: (userId: string) => void;
  chosen: boolean;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const inset = useRowInset();
  const [pressed, setPressed] = useState(false);
  const title = you ? words('week.record.you', { name }) : name;
  const pct = recordPct(row.onTimePct, words);
  const counts = recordCounts(row.counts, words);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${pct} ${words('week.record.onTime').toLowerCase()}, ${counts}`}
      aria-current={chosen || undefined}
      onPress={() => onOpen(row.userId)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID="record-row"
      style={[styles.row, { paddingHorizontal: inset }, (pressed || chosen) && { backgroundColor: colors.secondary }]}
    >
      <Hairline />
      {chosen ? <View aria-hidden pointerEvents="none" style={[styles.chosen, { backgroundColor: colors.foreground }]} /> : null}
      <View style={styles.head}>
        <Avatar name={name} userId={row.userId} me={you} size={24} />
        <RowTitle numberOfLines={1} style={styles.name}>
          {title}
        </RowTitle>
        <Text style={[type.rowTitle, styles.pct]}>{pct}</Text>
      </View>
      {row.months ? <MonthBars months={row.months} labels={first} /> : <WeekStrip cells={row.cells} columns={columns} />}
      <Meta numberOfLines={2}>{counts}</Meta>
    </Pressable>
  );
}

/**
 * What the colours mean, the marks that show on the grid only. On Year
 * (`parts`) they name a month's parts: "Late" rather than "Something late".
 */
export function RecordKey({ marks, changed = false, parts = false }: { marks: readonly RecordMark[]; changed?: boolean; parts?: boolean }) {
  const words = useWords();
  const changedBy = words('week.record.changed');
  return (
    <View accessibilityRole="list" accessibilityLabel={words('week.record.key')} style={styles.key} testID="record-key">
      {marks.map((mark) => (
        <View key={mark} style={styles.keyItem}>
          <KeyBar mark={mark} />
          <Meta>{parts && mark !== 'open' && mark !== 'none' ? words(`week.record.parts.${mark}` as const) : words(`week.record.marks.${mark}` as const)}</Meta>
        </View>
      ))}
      {changed ? (
        <View style={styles.keyItem}>
          <KeyBar mark="none" changed />
          <Meta>{changedBy}</Meta>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACE.md, gap: SPACE.sm },
  // The open one's ink edge, as on a chosen row of an owner's table.
  chosen: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  name: { flex: 1, minWidth: 0 },
  pct: { flexShrink: 0 },
  key: { paddingHorizontal: INSET, flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.lg, rowGap: SPACE.xs },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
});
