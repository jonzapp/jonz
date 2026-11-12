import * as Clipboard from 'expo-clipboard';
import { CheckIcon, CopyIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Body } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import { useWords } from '@/hooks/use-words';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';

/** How long Copy says Copied after a tap. */
const DONE_MS = 2000;

/**
 * Words to copy exactly, like an address to paste into another app: set in
 * bold on the sunk tint, with a Copy button beside them that says Copied for
 * a moment (and shows the house's toast, where there is one). `spoken` is what a screen reader hears for the
 * button, when "Copy" and the whole value would be too long to hear.
 */
export function CopyLine({ value, spoken, testID }: { value: string; spoken?: string; testID?: string }) {
  const { colors } = useTheme();
  const words = useWords();
  const toast = useToastIfAny();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);
  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setDone(true);
    toast?.show(words('house.page.copied', { plain: value }));
  };
  return (
    <View style={styles.line} testID={testID}>
      <View style={[styles.value, { backgroundColor: colors.secondary }]}>
        <Body style={styles.words} testID={testID ? `${testID}-value` : undefined}>
          {value}
        </Body>
      </View>
      {/* eslint-disable-next-line jonz/button-in-row -- beside the words it copies, not a lone action */}
      <Button
        variant="outline"
        icon={done ? CheckIcon : CopyIcon}
        label={words(done ? 'common.copy.done' : 'common.copy.label')}
        spoken={spoken ?? words('common.copy.spoken', { plain: value })}
        onPress={() => void copy()}
        testID={testID ? `${testID}-copy` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  value: { flex: 1, minWidth: 0, borderRadius: RADIUS, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  words: { fontFamily: FONT.bold },
});
