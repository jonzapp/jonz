import { monthAbbr, SPLIT_MARKS, withAlpha, type RecordMark, type RecordMonth } from '@app/core';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWords } from '@/hooks/use-words';
import { HAIR, MARK_RADIUS, type Theme, useTheme } from '@/theme';

/** A week's bar: as tall as a Meta line's dot row, rounded like a lid. */
const BAR = 12;
/** A month's split bar, on Year: tall enough to read its parts. */
const MONTH_BAR = 28;
/** The bars' corners. */
const BAR_RADIUS = MARK_RADIUS + 1;
/** The gap between bars. */
const BAR_GAP = HAIR + 2;
/** The most weeks on one line: a quarter of a year. */
export const STRIP_ROW = 13;
/** Under this width a month's label is its first letter. */
const LABEL_ROOM = 30;

/**
 * Each mark's colour, as Week's summary colours its parts: on time green,
 * late hi-vis, missed hazard, covering for someone in ink, skipped and away
 * grey (muted ink at 40%), not done yet an outline, nothing dealt the
 * hairline colour.
 */
function markColour({ colors }: Theme, mark: RecordMark): { fill: string; edge?: string } {
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

export interface StripCell {
  mark: RecordMark;
  /** An admin changed something in it: a small amber dot on its corner. */
  changed?: boolean;
}

/** One bar, flexed to its share of the line (or a key's fixed width). */
function Bar({ cell, keyed = false }: { cell: StripCell | null; keyed?: boolean }) {
  const theme = useTheme();
  if (cell === null) return <View style={styles.bar} />;
  const { fill, edge } = markColour(theme, cell.mark);
  return (
    <View
      aria-hidden
      testID={`bar-${cell.mark}`}
      style={[keyed ? styles.keyBar : styles.bar, { backgroundColor: fill }, edge ? { borderWidth: 1.5, borderColor: edge } : null]}
    >
      {cell.changed ? (
        <View testID="bar-changed" style={[styles.dot, { backgroundColor: theme.colors.hivis, borderColor: theme.colors.background }]} />
      ) : null}
    </View>
  );
}

/**
 * Weeks as bars that share the width they're given, one per week (on the
 * Track record's Week, one per John), oldest first. Today's Your weeks card
 * and the Track record draw the same strip. `columns` fixes how many bars a
 * line holds, so rows line up and a short run keeps its bars the same size;
 * longer runs wrap onto lines of `columns`. With `toCome`, the slots past the
 * last week are grey, the weeks still to come (Today); without, empty.
 */
export function WeekStrip({
  cells,
  columns,
  toCome = false,
  testID = 'week-strip',
}: {
  cells: readonly StripCell[];
  columns?: number;
  toCome?: boolean;
  testID?: string;
}) {
  const per = Math.max(1, columns ?? Math.min(cells.length, STRIP_ROW));
  const lines: (StripCell | null)[][] = [];
  for (let i = 0; i < Math.max(cells.length, 1); i += per) {
    lines.push(Array.from({ length: per }, (_, j) => cells[i + j] ?? (toCome ? { mark: 'none' as const } : null)));
  }
  return (
    <View style={styles.strip} aria-hidden testID={testID}>
      {lines.map((line, i) => (
        <View key={i} style={styles.line}>
          {line.map((cell, j) => (
            <Bar key={j} cell={cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * The Year view's months: 12 taller bars, each split by how that month's
 * Johns went, on time at the bottom, then covering for someone, late,
 * missed, skipped and away. A month with nothing in it is the hairline
 * colour. With `labels`, the months' names over them (the first row only).
 */
export function MonthBars({ months, labels = false }: { months: readonly RecordMonth[]; labels?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.strip} aria-hidden testID="month-bars">
      {labels ? <MonthLabels months={months} /> : null}
      <View style={styles.line}>
        {months.map(({ month, parts }) => {
          const total = SPLIT_MARKS.reduce((n, m) => n + (parts[m] ?? 0), 0);
          return (
            <View
              key={month}
              testID="month-bar"
              style={[styles.month, total === 0 ? { backgroundColor: theme.colors.secondary } : null]}
            >
              {SPLIT_MARKS.map((m) =>
                parts[m] ? (
                  <View key={m} testID={`part-${m}`} style={{ flex: parts[m]! / total, backgroundColor: markColour(theme, m).fill }} />
                ) : null,
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The months' short names over their bars ("Nov" … "Oct"), or first letters where the bars are narrow. */
function MonthLabels({ months }: { months: readonly RecordMonth[] }) {
  const words = useWords();
  const { type } = useTheme();
  const [width, setWidth] = useState(0);
  const each = months.length > 0 ? (width - BAR_GAP * (months.length - 1)) / months.length : 0;
  return (
    <View style={styles.line} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {months.map(({ month }) => {
        const name = monthAbbr(month, words);
        return (
          <Text key={month} numberOfLines={1} style={[type.caps, styles.label]}>
            {each > 0 && each < LABEL_ROOM ? name.slice(0, 1) : name}
          </Text>
        );
      })}
    </View>
  );
}

/** One bar on its own, for a colour key. */
export function KeyBar({ mark, changed = false }: { mark: RecordMark; changed?: boolean }) {
  return <Bar cell={{ mark, changed }} keyed />;
}

const styles = StyleSheet.create({
  strip: { gap: BAR_GAP },
  line: { flexDirection: 'row', gap: BAR_GAP },
  bar: { flex: 1, height: BAR, borderRadius: BAR_RADIUS },
  keyBar: { width: BAR * 2, height: BAR, borderRadius: BAR_RADIUS },
  // Parts stack from the bottom: on time first.
  month: { flex: 1, height: MONTH_BAR, borderRadius: BAR_RADIUS, overflow: 'hidden', flexDirection: 'column-reverse' },
  label: { flex: 1, textAlign: 'center' },
  // The amber dot of a changed result, edged in the page colour so it reads on any mark.
  dot: { position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: MARK_RADIUS * 2, borderWidth: 1 },
});
