import { Stack } from 'expo-router';

import { HouseWorkspace } from '@/components/house/workspace';
import { useKid } from '@/hooks/use-kid';
import { useTheme } from '@/theme';

// A page opened straight from a link (/house/wall, say) still has House
// under it, so its back button goes somewhere.
export const unstable_settings = { anchor: 'index' };

/**
 * House, as a stack inside its tab: the group page, and the pages it pushes
 * (the Wall, the Stake, a housemate, the setup pages), which keep the tabs
 * and the rail. Each page draws its own title bar, with back. On a laptop
 * the stack sits in the House workspace: its pages listed beside it, and a
 * panel down the right for a John's details.
 */
export default function HouseStack() {
  const { colors } = useTheme();
  const kid = useKid();
  return (
    <HouseWorkspace kid={kid}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </HouseWorkspace>
  );
}
