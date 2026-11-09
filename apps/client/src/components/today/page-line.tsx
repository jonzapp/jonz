import { Link, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OutlineBar } from '@/components/outline';
import { Body } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { INSET, OUTLINE, TAP, useTheme } from '@/theme';

/**
 * One tappable line on the page, onward to where it's about: where you
 * stand ("Joint 2nd this week, up £4.01 in October ›", to House), or your
 * time away ("You're away 28–31 Oct ›", to change the dates). Body, not
 * bold: it's a sentence, not a button.
 */
export function PageLine({
  text,
  href,
  accessibilityLabel,
  testID,
}: {
  text: string;
  href: Href;
  /** What a screen reader says, when the words alone don't say where it goes: it starts with them. */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        testID={testID}
        // One flat object: Link's asChild spreads the style, dropping an array.
        style={StyleSheet.flatten([styles.line, { opacity: pressed ? 0.6 : 1 }])}
      >
        {/* Two lines at most: on a narrow phone the month wraps rather than being cut. */}
        <Body numberOfLines={2} style={styles.words}>
          {text}
        </Body>
        <ChevronRightIcon size={16} color={colors.foreground} aria-hidden />
      </Pressable>
    </Link>
  );
}

/**
 * A page line still being read (where you stand, your time away): a bar in
 * outline where its words will be, after WAIT_DELAY, so the line doesn't
 * pop in from nothing.
 */
export function PendingLine({ label }: { label: string }) {
  return (
    <Waiting ready={false} label={label} outline={<View style={styles.line}><OutlineBar width={240} height={OUTLINE.line} onCard={false} /></View>} />
  );
}

/** The page's quiet lines, together under the week: no section gap between them. */
export function PageLines({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}

const styles = StyleSheet.create({
  // On the page's leading edge, with the gutter and the inset: where the card's words start.
  line: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: INSET,
  },
  words: { flexShrink: 1 },
});
