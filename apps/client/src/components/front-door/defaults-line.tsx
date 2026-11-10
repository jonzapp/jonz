import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Meta } from '@/components/text';
import { FONT, ROW_GAP, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * A new house's defaults in Meta, on two lines where a phone can't fit them
 * on one (so the time zone is always there to see), with "Change" as its one
 * trailing item (Body Bold, as a text button's words), level with the first
 * line. The whole line is one button a thumb tall that opens and closes what
 * it sums up (`aria-expanded`), saying "Done" while it's open; a screen
 * reader hears the whole line.
 */
export function DefaultsLine({ parts, open, onToggle }: { parts: readonly string[]; open: boolean; onToggle: () => void }) {
  const words = useWords();
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  const action = open ? words('door.welcome.done') : words('door.welcome.change');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${parts.join(', ')}`}
      accessibilityHint={words('door.welcome.changeSpoken')}
      aria-expanded={open}
      onPress={onToggle}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID="change-defaults"
      style={[styles.line, pressed && styles.pressed]}
    >
      {/* Each sits in the middle of a thumb-tall line, so a one-line summary and Change share a centre. */}
      <Meta numberOfLines={2} style={[styles.words, { paddingVertical: (TAP - (type.meta.lineHeight ?? 0)) / 2 }]} testID="house-defaults">
        {parts.join(', ')}
      </Meta>
      <Text style={[type.body, styles.action, { color: colors.foreground, paddingVertical: (TAP - (type.body.lineHeight ?? 0)) / 2 }]}>
        {action}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { minHeight: TAP, flexDirection: 'row', alignItems: 'flex-start', gap: ROW_GAP },
  words: { flex: 1 },
  action: { fontFamily: FONT.bold },
  pressed: { opacity: 0.6 },
});
