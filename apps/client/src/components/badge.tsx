import { StyleSheet, Text, View } from 'react-native';

import { SPACE, useTheme } from '@/theme';

/**
 * A count on an ink pill: on the Today tab (what waits for your vote) or
 * after a section's label. Decoration: whatever it sits on says the count in
 * words. Nothing at zero.
 */
export function CountBadge({ count, ring = false }: { count: number; ring?: boolean }) {
  const { colors, type } = useTheme();
  if (count <= 0) return null;
  return (
    <View
      aria-hidden
      testID="count-badge"
      style={[
        styles.badge,
        { backgroundColor: colors.foreground },
        // On the tab bar it sits over the icon, so a ring of the ground keeps them apart.
        ring && { borderWidth: 2, borderColor: colors.background },
      ]}
    >
      <Text style={[type.initials, { color: colors.background }]}>{count}</Text>
    </View>
  );
}

/** The badge's height: its ends are half of it, so one figure sits in a circle. */
const SIZE = 20;

const styles = StyleSheet.create({
  badge: { minWidth: SIZE, height: SIZE, paddingHorizontal: SPACE.xs + 1, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
});
