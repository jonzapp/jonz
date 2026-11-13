import { lidColour } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * A John's kind: a short bar of its lid colour, a bin lid seen side on,
 * placed only before the kind's name in a meta line (Row's `lid` puts it
 * there).
 */
export function LidBar({ category }: { category: string }) {
  const { colors } = useTheme();
  return <View aria-hidden testID="lid-bar" style={[styles.bar, { backgroundColor: lidColour(colors, category) }]} />;
}

/** How wide a lid bar is: words that line up past it start this far in, plus their gap. */
export const LID_BAR = 14;

const styles = StyleSheet.create({
  bar: { width: LID_BAR, height: 5, borderRadius: 1.5 },
});
