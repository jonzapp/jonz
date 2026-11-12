import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

// A page opened straight from a link (/you/reports, say) still has You
// under it, so its back button goes somewhere.
export const unstable_settings = { anchor: 'index' };

/**
 * You, the fourth tab, as a stack of its own: your settings, help and
 * leaving, and the pages it pushes (moving out, your reports), which keep
 * the tabs and the rail. Each page draws its own title bar, with back.
 */
export default function YouStack() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
