import { lidColour } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * A John's kind: a short bar of its lid colour, a bin lid seen side on,
 * placed only before the kind's name in a meta line (Row's `lid` puts it
 * there). `lid` is the kind's own colour (`#rrggbb`), made to read in this
 * scheme, or `other`'s grey for a John with no kind (a starting kind's name,
 * such as `kitchen`, wears its bin lid: the style page's samples).
 */
export function LidBar({ lid }: { lid: string }) {
  const { colors } = useTheme();
  return <View aria-hidden testID="lid-bar" style={[styles.bar, { backgroundColor: lidColour(colors, lid) }]} />;
}

/** How wide a lid bar is: words that line up past it start this far in, plus their gap. */
export const LID_BAR = 14;

/** The lid's corner: just off square. */
const BAR_CORNER = 1.5;

const styles = StyleSheet.create({
  bar: { width: LID_BAR, height: 5, borderRadius: BAR_CORNER },
});
