import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The thin line between things, in the border colour, a hair thick: across
 * the width it's given (the default), down beside its neighbours
 * (`vertical`), or, with `grow`, filling what's left of a row (the lines
 * either side of "or" on sign-in, or of a chat's summed-up line). Silent to a
 * screen reader. A group's rows draw theirs with `Hairline`, which starts at
 * the words.
 */
export function Separator({
  vertical = false,
  grow = false,
  style,
  testID,
}: {
  vertical?: boolean;
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      pointerEvents="none"
      testID={testID}
      style={[vertical ? styles.down : styles.across, grow && styles.grow, { backgroundColor: colors.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  across: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  down: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  grow: { flex: 1, alignSelf: 'auto' },
});
