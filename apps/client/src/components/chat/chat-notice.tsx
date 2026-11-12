import { Link, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type ButtonIcon } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ComposerBar } from '@/components/chat/chat';
import { Body, Meta, RowTitle } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { CONTENT_MAX, GROUP_RADIUS, GUTTER, INSET, RADIUS, SPACE, useTheme } from '@/theme';

// Every Ask Jonz warning looks the same (Glyn's pick A, 12 Nov): while the
// chat can carry on, one line over the message box (an icon, one sentence,
// a chevron to what to do about it); once nothing more can be sent, a card
// in the box's place (what stopped it, a bar when it's a limit, what comes
// next, and its buttons). One at a time: the chat picks the most urgent.
// docs/style/states.md, "Ask Jonz's warnings".

/** The line over the message box: a sentence to read, and a tap to what to do about it (a page, or a move). */
export function ChatNotice({
  icon: Icon,
  text,
  label,
  href,
  onPress,
  testID,
}: {
  icon: ButtonIcon;
  text: string;
  /** Where the tap goes, in words, for a screen reader ("See usage"). */
  label: string;
  href?: Href;
  onPress?: () => void;
  testID?: string;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const line = (
    <Pressable
      // One flat object: Link's asChild spreads the style, dropping an array.
      style={StyleSheet.flatten([styles.line, { backgroundColor: colors.card, borderColor: colors.border }])}
      role={href ? 'link' : 'button'}
      aria-label={words('common.join.then', { first: text, second: label })}
      onPress={onPress}
      testID={testID}
    >
      <Icon size={18} color={colors.foreground} aria-hidden />
      <Body style={styles.flex}>{text}</Body>
      <ChevronRightIcon size={18} color={colors.mutedForeground} aria-hidden />
    </Pressable>
  );
  return (
    <View style={styles.over}>
      {href ? (
        <Link href={href} asChild>
          {line}
        </Link>
      ) : (
        line
      )}
    </View>
  );
}

/**
 * In the message box's place once nothing more can be sent: what stopped
 * it, a full bar when it's a limit that comes back, what comes next, and
 * its buttons (each a `Button`).
 */
export function ChatStop({
  title,
  note,
  limit = false,
  children,
  testID,
}: {
  title: string;
  note: string;
  /** A limit that comes back (the week's Ask Jonz): a full bar under the title. */
  limit?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <ComposerBar testID={testID}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowTitle>{title}</RowTitle>
        {limit ? (
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { backgroundColor: colors.hazard }]} />
          </View>
        ) : null}
        <Meta>{note}</Meta>
        <ButtonRow>{children}</ButtonRow>
      </View>
    </ComposerBar>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  over: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingHorizontal: GUTTER, paddingBottom: SPACE.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: { borderRadius: GROUP_RADIUS, padding: INSET, gap: SPACE.sm },
  track: { height: SPACE.sm, borderRadius: RADIUS, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: RADIUS },
});
