import { Platform, StyleSheet, Text, View } from 'react-native';

import { FONT, HAIR, useTheme } from '@/theme';

/** How round a key's corners are, a keycap's, tighter than a box's; and the room either side of its name. */
const KEY_CORNER = 4;
const KEY_SIDE = 6;

/**
 * A key on the keyboard, named in a small edged box (shadcn's Kbd): the
 * command box's Esc and its foot's ↑ ↓ Enter, and Ctrl K (⌘K on a Mac) on
 * the rail's Search. Meta's size in bold, in the quieter ink, on the page's
 * own colour. Only where there's a keyboard: on the web. Heard as part of
 * what it sits in, so a screen reader doesn't read it out again.
 */
export function Kbd({ children }: { children: string }) {
  const { colors, type } = useTheme();
  if (Platform.OS !== 'web') return null;
  return (
    <View aria-hidden style={[styles.key, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={[type.meta, styles.name, { color: colors.mutedForeground }]}>{children}</Text>
    </View>
  );
}

/** Whether the keyboard is a Mac's, so Ctrl K reads ⌘K. */
export function onMac(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

const styles = StyleSheet.create({
  key: { borderWidth: 1, borderRadius: KEY_CORNER, paddingHorizontal: KEY_SIDE, paddingVertical: HAIR },
  name: { fontFamily: FONT.bold },
});
