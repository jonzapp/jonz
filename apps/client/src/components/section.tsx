import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CountBadge } from '@/components/badge';
import { Group } from '@/components/group';
import { Meta, SectionLabel } from '@/components/text';
import { HAIR, INSET, LABEL_GAP, ROW_GAP, SPACE, TAP } from '@/theme';

/** The label's line. */
const LINE = 24;
/** How far a thumb-tall control in the label's line hangs above and below it, so the line stays 24 tall. */
const OVERHANG = (TAP - LINE) / 2;

/**
 * A section of a page: its header, then LABEL_GAP, then one Group of its
 * rows. The header is the label, with a count badge after it when there's a
 * count, and an optional right-hand item: Meta words, or a control (a
 * TextButton, a Segmented). Week's person header adds `leading` (a 24pt
 * Avatar) before the label and `tag` (a quiet Chip, "Swap ready") after it.
 *
 * The label keeps its width: Meta on the right gives way first, moving under
 * the label when the line can't hold both, and only then truncating. A
 * control hangs over the label's line, above and below it, so the group
 * starts LABEL_GAP below the label under every header alike. Its last few
 * points rest on the group's top edge, as the kit's do, so the header is
 * drawn over the group: the control is seen whole and keeps its whole
 * target. Sections don't space themselves: the Screen, or a flush Sheet,
 * holding them puts SECTION_GAP between its children.
 */
export function Section({
  label,
  count,
  leading,
  tag,
  right,
  bare = false,
  children,
  testID,
}: {
  label: string;
  /** What waits, as a badge after the label ("Needs you", 1). Nothing at zero. */
  count?: number;
  /** Before the label: an Avatar of size 24 (Week's person header). */
  leading?: ReactNode;
  /** After the label (and its badge): a quiet Chip, such as "Swap ready". */
  tag?: ReactNode;
  /**
   * A string is set as Meta; a few strings are a Meta line each, the second
   * under the first ("1 of 3 done, 6 pts", then "away 28–31 Oct"). Anything
   * else is a control.
   */
  right?: ReactNode | readonly string[];
  /** The children sit on the page, not in a card: they bring their own (a busy list, a notice as people see it). */
  bare?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const lines = metaLines(right);
  const control = right != null && lines === null;
  return (
    <View testID={testID}>
      <View style={[styles.header, control ? styles.withControl : styles.wraps]}>
        <View style={styles.label}>
          {leading}
          <SectionLabel
            numberOfLines={1}
            // The badge is silent: the heading says the count.
            accessibilityLabel={count ? `${label}, ${count}` : undefined}
            style={styles.words}
          >
            {label}
          </SectionLabel>
          {count ? <CountBadge count={count} /> : null}
          {tag}
        </View>
        {lines ? (
          <View style={styles.meta}>
            {lines.map((line, i) => (
              <Meta key={i} numberOfLines={1} style={styles.end}>
                {line}
              </Meta>
            ))}
          </View>
        ) : control ? (
          <View style={styles.control}>{right as ReactNode}</View>
        ) : null}
      </View>
      {bare ? <View style={styles.bare}>{children}</View> : <Group>{children}</Group>}
    </View>
  );
}

/** The right-hand item as Meta lines, when it's words. */
function metaLines(right: ReactNode | readonly string[]): readonly string[] | null {
  if (typeof right === 'string') return [right];
  if (Array.isArray(right) && right.length > 0 && right.every((line) => typeof line === 'string')) return right;
  return null;
}

const styles = StyleSheet.create({
  header: {
    minHeight: LINE,
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: ROW_GAP,
    rowGap: SPACE.xs,
    paddingHorizontal: INSET,
  },
  // Words on the right move under the label rather than cutting it short.
  wraps: { flexWrap: 'wrap', marginBottom: LABEL_GAP },
  // A control stays in the label's line, hanging over it (as the kit's does),
  // so the group sits LABEL_GAP below the label whatever is on the right. Its
  // foot reaches into the group, so the header is drawn over the group and
  // takes the taps there.
  withControl: { marginBottom: LABEL_GAP, zIndex: 1 },
  bare: { gap: SPACE.sm },
  // Shrinks only when it can't fit a line on its own.
  label: { minHeight: LINE, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  // Overpass's caps sit high in their line, so the label comes down a little.
  words: { flexShrink: 1, paddingTop: HAIR },
  // Pushed to the right, on the label's line or the one under it: a 20pt line centred on the 24pt one.
  meta: { flexShrink: 1, marginLeft: 'auto', alignItems: 'flex-end', paddingTop: HAIR },
  end: { textAlign: 'right' },
  // A day's name sits on the label's 24pt line, a little smaller than a row's title.
  control: { flexShrink: 0, marginLeft: 'auto', marginVertical: -OVERHANG },
});
