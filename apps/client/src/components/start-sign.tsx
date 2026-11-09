import { APP_NAME } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { SignMark } from '@/components/wordmark';
import { useTheme } from '@/theme';

/** As wide as the phone apps' splash draws the sign (app.json's imageWidth). */
export const START_SIGN = 96;

/**
 * What the app shows while it starts (its fonts and your sign-in on their
 * way): the J sign in the middle of the page's ground, Day or Night, as the
 * phone apps' splash does. The web's page template (public/index.html)
 * draws the same sign in the same place before any script runs, so the
 * start never flashes white (docs/style/states.md, "Waiting").
 */
export function StartSign() {
  const { colors } = useTheme();
  return (
    <View
      testID="start-sign"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={APP_NAME}
      aria-busy
      style={[styles.ground, { backgroundColor: colors.background }]}
    >
      <SignMark size={START_SIGN} />
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
