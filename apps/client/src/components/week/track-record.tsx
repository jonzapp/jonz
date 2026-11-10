import { RECORD_COPY, withAlpha, type RecordMark, type RecordRow } from '@app/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Group, Hairline, useRowInset } from '@/components/group';
import { Meta, RowTitle } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { INSET, ROW_GAP, SPACE, useTheme, type Theme } from '@/theme';

/** A square's side. */
const CELL = 14;

/**
 * Each mark's colour, as Week's summary colours its parts: on time green,
 * late hi-vis, missed hazard, covering for someone in ink, skipped and away
 * grey (muted ink at 40%), not done yet an outline, nothing dealt the
 * hairline colour.
 */
export function markColour({ colors }: Theme, mark: RecordMark): { fill: string; edge?: string } {
  switch (mark) {
    case 'clean':
      return { fill: colors.good };
    case 'late':
      return { fill: colors.hivis };
    case 'missed':
      return { fill: colors.hazard };
    case 'covered':
      return { fill: colors.foreground };
    case 'skipped':
    case 'away':
      return { fill: withAlpha(colors.mutedForeground, 0.4) };
    case 'open':
      return { fill: 'transparent', edge: colors.mutedForeground };
    case 'none':
      return { fill: colors.secondary };
  }
}

/** A square: its mark's colour, and a small amber dot in its corner when an admin changed something in it. */
export function Square({ mark, changed = false }: { mark: RecordMark; changed?: boolean }) {
  const theme = useTheme();
  const { fill, edge } = markColour(theme, mark);
  return (
    <View
      aria-hidden
      testID={`square-${mark}`}
      style={[styles.cell, { backgroundColor: fill }, edge ? { borderWidth: 1.5, borderColor: edge } : null]}
    >
      {changed ? (
        <View testID="square-changed" style={[styles.dot, { backgroundColor: theme.colors.hivis, borderColor: theme.colors.background }]} />
      ) : null}
    </View>
  );
}

/**
 * The track record's grid: one row per person, their on-time share as the
 * figure, their squares under their name, and what they add up to under
 * those. A row opens that person's breakdown: on a phone as a page of its
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
  return (
    <Group testID="record-grid">
      {rows.map((row) => (
        <RecordLine
          key={row.userId}
          row={row}
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
  you,
  name,
  onOpen,
  chosen,
}: {
  row: RecordRow;
  you: boolean;
  name: string;
  onOpen: (userId: string) => void;
  chosen: boolean;
}) {
  const { colors, type } = useTheme();
  const inset = useRowInset();
  const [pressed, setPressed] = useState(false);
  const title = you ? RECORD_COPY.you(name) : name;
  const pct = RECORD_COPY.pct(row.onTimePct);
  const counts = RECORD_COPY.counts(row.counts);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${pct} ${RECORD_COPY.onTime.toLowerCase()}, ${counts}`}
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
      <View style={styles.cells}>
        {row.cells.map((cell) => (
          <Square key={cell.key} mark={cell.mark} changed={cell.changed} />
        ))}
      </View>
      <Meta numberOfLines={2}>{counts}</Meta>
    </Pressable>
  );
}

/** What the colours mean, the marks that show on the grid only. */
export function RecordKey({ marks, changed = false }: { marks: readonly RecordMark[]; changed?: boolean }) {
  const changedBy = useWords()('week.record.changed');
  return (
    <View accessibilityRole="list" accessibilityLabel={RECORD_COPY.key} style={styles.key} testID="record-key">
      {marks.map((mark) => (
        <View key={mark} style={styles.keyItem}>
          <Square mark={mark} />
          <Meta>{RECORD_COPY.marks[mark]}</Meta>
        </View>
      ))}
      {changed ? (
        <View style={styles.keyItem}>
          <Square mark="none" changed />
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
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: CELL, height: CELL, borderRadius: 2 },
  // The amber dot of a changed result, edged in the page colour so it reads on any mark.
  dot: { position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 4, borderWidth: 1 },
  key: { paddingHorizontal: INSET, flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.lg, rowGap: SPACE.xs },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
});
