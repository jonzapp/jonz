import { TriangleAlertIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { HAIR, SPACE, useTheme } from '@/theme';

/**
 * Something went wrong (a refusal, a read that failed, a field to fix): a
 * line in Meta's size, in ink, after a triangle, announced as it appears.
 * Never in hazard and never on a panel, so it reads on any surface.
 */
export function Alert({ message, testID }: { message: string; testID?: string }) {
  const { colors, type } = useTheme();
  return (
    <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID} style={styles.alert}>
      <TriangleAlertIcon size={16} color={colors.foreground} aria-hidden style={styles.icon} />
      <Text style={[type.meta, styles.words, { color: colors.foreground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  // The triangle sits on the first line's middle.
  icon: { marginTop: HAIR },
  words: { flexShrink: 1 },
});
