import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ON_STAGING } from '@/api/staging';
import { SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * A thin ink band across the top of every staging screen, so a screenshot
 * or a glance never mistakes staging for jonz.app. Nothing in production.
 */
export function StagingRibbon() {
  const words = useWords();
  const { colors, type } = useTheme();
  const { top } = useSafeAreaInsets();
  if (!ON_STAGING) return null;
  return (
    <View
      testID="staging-ribbon"
      accessibilityRole="text"
      style={[styles.ribbon, { backgroundColor: colors.foreground, paddingTop: top + SPACE.xs }]}
    >
      <Text style={[type.initials, { color: colors.background }]}>{words('common.staging.ribbon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: { alignItems: 'center', paddingBottom: SPACE.xs, paddingHorizontal: SPACE.lg },
});
