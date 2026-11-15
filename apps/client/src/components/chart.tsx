import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Meta, RowTitle } from '@/components/text';
import { LEADING, MARK_GAP, SPACE, TABULAR, useTheme } from '@/theme';

/** How tall each bar's line is: its face and a little air. */
const LINE = LEADING + SPACE.sm;
/** How thick a bar is, and how round its far end. */
const BAR = MARK_GAP * 2;
const BAR_END = SPACE.xs;
/** How tall the line naming the halves is. */
const AXIS = SPACE.xl;

/** One line of a BarChart: who or what it is, its number, and that number in words. */
export interface ChartBar {
  key: string;
  /** Drawn before the name: an Avatar for a person. */
  leading?: ReactNode;
  name: string;
  value: number;
  /** The number as it reads beside the bar ("+4.5", "−2", "level"). */
  shown: string;
}

/**
 * Bars either side of a middle line (shadcn's Chart, its bar chart with
 * negative values): one line each, its name on the left, its bar going
 * left of the middle when below zero and right when above, as long as its
 * share of the largest, and its number in ink on the right. The halves are
 * named over them (`below`, `above`). One series, in ink, so there's no
 * key; the numbers are the table. A screen reader hears it as one picture
 * naming each line and its number, in order. Fair shares use it.
 */
export function BarChart({ bars, below, above, testID }: { bars: readonly ChartBar[]; below: string; above: string; testID?: string }) {
  const most = Math.max(0, ...bars.map((bar) => Math.abs(bar.value))) || 1;
  return (
    <View
      accessible
      role="img"
      aria-label={bars.map((bar) => `${bar.name}, ${bar.shown}`).join('; ')}
      style={styles.chart}
      testID={testID}
    >
      <View style={styles.names}>
        <View style={styles.axis} />
        {bars.map((bar) => (
          <View key={bar.key} style={styles.line}>
            {bar.leading}
            <RowTitle style={styles.name}>{bar.name}</RowTitle>
          </View>
        ))}
      </View>
      <View style={styles.bars}>
        <View style={styles.halves}>
          <Meta style={[styles.axis, styles.named]}>{below}</Meta>
          <Meta style={[styles.axis, styles.named]}>{above}</Meta>
        </View>
        {bars.map((bar) => (
          <Bar key={bar.key} part={Math.abs(bar.value) / most} below={bar.value < 0} above={bar.value > 0} testID={testID ? `${testID}-bar` : undefined} />
        ))}
      </View>
      <View style={styles.numbers}>
        <View style={styles.axis} />
        {bars.map((bar) => (
          <View key={bar.key} style={styles.line}>
            <Body style={TABULAR}>{bar.shown}</Body>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One bar on its line: the middle line through it, and its fill on the side its number is. */
function Bar({ part, below, above, testID }: { part: number; below: boolean; above: boolean; testID?: string }) {
  const { colors } = useTheme();
  const fill = { width: `${Math.round(part * 100)}%` as const, backgroundColor: colors.foreground };
  return (
    <View style={styles.halves} testID={testID}>
      <View style={[styles.half, styles.toMiddle]}>
        {below ? <View style={[styles.fill, styles.leftEnd, fill]} testID={testID ? `${testID}-below` : undefined} /> : null}
      </View>
      <View style={[styles.middle, { backgroundColor: colors.mutedForeground }]} />
      <View style={styles.half}>
        {above ? <View style={[styles.fill, styles.rightEnd, fill]} testID={testID ? `${testID}-above` : undefined} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', gap: SPACE.md },
  axis: { height: AXIS },
  named: { flex: 1, textAlign: 'center' },
  names: { maxWidth: '40%' },
  name: { flexShrink: 1 },
  line: { height: LINE, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  bars: { flex: 1 },
  halves: { flexDirection: 'row' },
  half: { flex: 1, height: LINE, justifyContent: 'center' },
  toMiddle: { alignItems: 'flex-end' },
  middle: { width: StyleSheet.hairlineWidth },
  fill: { height: BAR },
  leftEnd: { borderTopLeftRadius: BAR_END, borderBottomLeftRadius: BAR_END },
  rightEnd: { borderTopRightRadius: BAR_END, borderBottomRightRadius: BAR_END },
  numbers: { alignItems: 'flex-end' },
});
