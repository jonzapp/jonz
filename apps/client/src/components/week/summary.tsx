import { withAlpha, type WeekPart, type WeekSummary } from '@app/core';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Meta, RowTitle } from '@/components/text';
import { INSET, RADIUS, SPACE, TAP, useTheme, type Theme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Each part's colour: done green, checking green at 40%, disputed ink,
 * overdue hazard, to go grey (muted ink at 40%, which reads on the pavement
 * in both looks, where the hairline colour vanishes at night). At night
 * checking is green at 60%, or it would be as dark as to go beside it.
 */
function partColour({ colors, scheme }: Theme, part: WeekPart): string {
  return {
    done: colors.good,
    checking: withAlpha(colors.good, scheme === 'dark' ? 0.6 : 0.4),
    disputed: colors.foreground,
    overdue: colors.hazard,
    toGo: withAlpha(colors.mutedForeground, 0.4),
  }[part];
}

/**
 * How the house's week is going, on the page rather than in a card: the
 * week's days and when it ends, an 8pt bar of parts that add up to the
 * week's Johns, and under it a legend whose parts filter the list (pressed
 * again, it shows everything). The part that's on says so as Button's
 * `chosen` does: `aria-pressed` on the web, `aria-selected` elsewhere. While
 * one is on, the bar's other parts fade; a part with nothing in it is muted
 * and can't be pressed. On a laptop, `tag` follows the range ("Swap ready")
 * and `note` says who's away, under the legend.
 */
export function WeekSummaryBar({
  range,
  summary,
  filter,
  onFilter,
  tag,
  note,
}: {
  /** "19–25 Oct, ends tonight", from core's weekRangeLine. */
  range: string;
  summary: WeekSummary;
  filter: WeekPart | null;
  /** Pressing a legend part. Without it the legend is one Meta line ("3 done, 5 to go"): Today's glance. */
  onFilter?: (part: WeekPart) => void;
  tag?: ReactNode;
  note?: string | null;
}) {
  const words = useWords();
  const theme = useTheme();
  const { colors, type } = theme;
  const shown = summary.parts.filter((p) => p.count > 0);
  return (
    // A region on the web, named for what it sums up.
    <View accessibilityRole="summary" accessibilityLabel={words('week.summary.soFar')} testID="week-summary" style={styles.summary}>
      <View style={styles.top}>
        <Meta numberOfLines={1} style={styles.range}>
          {range}
        </Meta>
        {tag}
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={summary.spoken} testID="week-bar" style={styles.bar}>
        {shown.length === 0 ? (
          <View style={[styles.segment, { backgroundColor: partColour(theme, 'toGo') }]} />
        ) : (
          shown.map((p) => (
            <View
              key={p.part}
              testID={`bar-${p.part}`}
              style={[
                styles.segment,
                { flexGrow: p.count, backgroundColor: partColour(theme, p.part) },
                filter !== null && filter !== p.part && styles.faded,
              ]}
            />
          ))
        )}
      </View>
      {onFilter == null ? (
        <Meta numberOfLines={1} style={styles.parts} testID="week-parts">
          {summary.parts
            .filter((p) => p.count > 0)
            .map((p) => `${p.count} ${p.label}`)
            .join(', ')}
        </Meta>
      ) : (
        <View style={styles.legend}>
          {summary.parts.map((p) => {
            const chosen = filter === p.part;
            const empty = p.count === 0;
            // A toggle's state: the web hears aria-pressed, which React Native lacks.
            const state = Platform.OS === 'web' ? ({ 'aria-pressed': chosen } as object) : { 'aria-selected': chosen };
            return (
              <Pressable
                key={p.part}
                accessibilityRole="button"
                accessibilityLabel={words('week.summary.part', { count: p.count, label: p.label })}
                accessibilityHint={words('week.summary.showOnly')}
                {...state}
                aria-disabled={empty}
                disabled={empty}
                onPress={() => onFilter(p.part)}
                testID={`legend-${p.part}`}
                style={styles.part}
              >
                {({ pressed }) => (
                  <>
                    {/* The tint reaches past the words, so they keep to the leading edge and their full width. */}
                    {chosen || pressed ? (
                      <View
                        pointerEvents="none"
                        style={[styles.tint, { backgroundColor: pressed ? withAlpha(colors.foreground, 0.06) : colors.secondary }]}
                      />
                    ) : null}
                    <View style={styles.figure}>
                      <View
                        aria-hidden
                        style={[styles.swatch, { backgroundColor: partColour(theme, p.part) }, empty && styles.faded]}
                      />
                      <RowTitle numberOfLines={1} style={empty ? { color: colors.mutedForeground } : undefined}>
                        {String(p.count)}
                      </RowTitle>
                    </View>
                    <Text numberOfLines={1} style={[type.meta, chosen && { color: colors.foreground }]}>
                      {p.label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      {note ? (
        <Meta style={styles.note} testID="week-away">
          {note}
        </Meta>
      ) : null}
    </View>
  );
}

/** How far a legend part's tint reaches past its words, either side. */
const PART_PAD = SPACE.xs;

const styles = StyleSheet.create({
  summary: { paddingHorizontal: INSET },
  top: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  range: { flexShrink: 1 },
  bar: { flexDirection: 'row', gap: 2, height: 8, marginTop: SPACE.sm, borderRadius: 4, overflow: 'hidden' },
  segment: { flexGrow: 1, flexBasis: 0 },
  faded: { opacity: 0.3 },
  legend: { flexDirection: 'row', marginTop: SPACE.xs, columnGap: SPACE.xs },
  // Each part as wide as its words, sharing what's left: "checking" and "disputed" stay whole on a small phone.
  part: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: TAP + SPACE.xs,
    justifyContent: 'center',
    paddingVertical: SPACE.xs,
  },
  tint: { position: 'absolute', top: 0, bottom: 0, left: -PART_PAD, right: -PART_PAD, borderRadius: RADIUS },
  figure: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  parts: { marginTop: SPACE.sm },
  note: { marginTop: SPACE.xs },
});
