import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { GROUP_RADIUS, INSET, SPACE, TABULAR, useTheme } from '@/theme';

const HEIGHT = 160;
const LEFT = 36;
const RIGHT = 44;

/** A round top for the scale: 4, 40, 120, 1,200, so the gridlines fall on plain numbers. */
function top(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.2, 1.6, 2, 3, 4, 6, 8, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

/**
 * One line in ink over a few weeks, with the latest value labelled at its
 * end, gridlines at four plain numbers, and the first and last weeks named
 * under it. The figures are said in words as well, for a screen reader.
 */
export function WeekChart({
  values,
  first,
  last,
  label,
  testID,
}: {
  values: readonly number[];
  first: string;
  last: string;
  label: string;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const [width, setWidth] = useState(0);
  const max = top(Math.max(0, ...values));
  const plot = Math.max(0, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (values.length > 1 ? (i / (values.length - 1)) * plot : plot);
  const y = (v: number) => SPACE.sm + (1 - v / max) * (HEIGHT - 2 * SPACE.sm);
  const grid = [0, max / 3, (2 * max) / 3, max].map((v) => Math.round(v));
  const latest = values[values.length - 1] ?? 0;
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card }]}
      accessible
      accessibilityLabel={`${label}: ${values.join(', ')}`}
      testID={testID}
    >
      <View style={{ height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={HEIGHT} aria-hidden>
              {grid.map((v) => (
                <Line key={v} x1={LEFT} x2={LEFT + plot} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} />
              ))}
              <Polyline
                points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={colors.foreground}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Circle cx={x(values.length - 1)} cy={y(latest)} r={4} fill={colors.foreground} />
            </Svg>
            {grid.map((v) => (
              <Text key={v} style={[type.meta, TABULAR, styles.tick, { top: y(v) - 10 }]}>
                {v.toLocaleString('en-GB')}
              </Text>
            ))}
            <Text style={[type.rowTitle, TABULAR, styles.latest, { top: y(latest) - 12, left: x(values.length - 1) + SPACE.sm }]}>
              {latest.toLocaleString('en-GB')}
            </Text>
          </>
        ) : null}
      </View>
      <View style={[styles.axis, { marginLeft: LEFT, marginRight: RIGHT }]}>
        <Text style={type.meta}>{first}</Text>
        <Text style={type.meta}>{last}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: GROUP_RADIUS, padding: INSET, gap: SPACE.xs },
  tick: { position: 'absolute', left: 0, width: LEFT - SPACE.sm, textAlign: 'right' },
  latest: { position: 'absolute' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
