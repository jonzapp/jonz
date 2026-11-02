import { withAlpha } from '@app/core';
import { Link, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFilled } from '@/components/screen';
import { FIGURE_MIN, GROUP_RADIUS, INSET, SPACE, TAP, useTheme } from '@/theme';

/** One of a row's figures: the figure over what it counts, a quieter line under them, and the page it opens. */
export interface Figure {
  key: string;
  /** "£4.01", "4"; null while it's still being read, which keeps its room. */
  value: string | null;
  label: string;
  note?: string | null;
  /** The figure in green: something good, said in colour as well as words. */
  good?: boolean;
  href: Href;
}

/**
 * A row of figures in one grey inset group, split by hairlines: each a
 * figure (the Lead) over what it counts, with a chevron, opening the page
 * it's from. On a page that fills the room on a laptop they share one line
 * while each has FIGURE_MIN; otherwise, and on a phone, two to a line.
 */
export function Figures({ figures, label, testID }: { figures: readonly Figure[]; label: string; testID?: string }) {
  const { colors } = useTheme();
  const filled = useFilled();
  const perLine = filled !== null && filled >= figures.length * FIGURE_MIN ? figures.length : 2;
  return (
    <View testID={testID} accessibilityLabel={label} style={[styles.group, { backgroundColor: colors.card }]}>
      {figures.map((figure, i) => (
        <Cell key={figure.key} figure={figure} first={i % perLine === 0} top={i < perLine} share={`${100 / perLine}%`} />
      ))}
    </View>
  );
}

function Cell({ figure, first, top, share }: { figure: Figure; first: boolean; top: boolean; share: `${number}%` }) {
  const { colors, type } = useTheme();
  return (
    <Link href={figure.href} asChild>
      <Pressable style={{ flexBasis: share }} accessibilityRole="link" testID={`figure-${figure.key}`}>
        {({ pressed }) => (
          <View
            style={[
              styles.cell,
              !first && {
                borderLeftWidth: StyleSheet.hairlineWidth,
                borderLeftColor: colors.border,
              },
              !top && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
              pressed && {
                backgroundColor: withAlpha(colors.foreground, 0.06),
              },
            ]}
          >
            <View style={styles.line}>
              {figure.value === null ? (
                <View aria-hidden style={{ height: type.lead.lineHeight }} />
              ) : (
                <Text numberOfLines={1} style={[type.lead, styles.shrink, figure.good && { color: colors.good }]}>
                  {figure.value}
                </Text>
              )}
              <ChevronRightIcon size={18} color={colors.mutedForeground} aria-hidden />
            </View>
            <Text numberOfLines={2} style={type.meta}>
              {figure.label}
            </Text>
            {figure.note ? (
              <Text numberOfLines={2} style={type.meta}>
                {figure.note}
              </Text>
            ) : null}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: GROUP_RADIUS,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexGrow: 1,
    minHeight: TAP + 2 * SPACE.lg,
    paddingHorizontal: INSET,
    paddingVertical: SPACE.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.xs,
  },
  shrink: { flexShrink: 1 },
});
