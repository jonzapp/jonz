import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hairline, useRowInset } from '@/components/group';
import { Separator } from '@/components/separator';
import { Meta } from '@/components/text';
import { FONT, LEADING, ROW_GAP, ROW_MIN, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Finished things, folded away inside a group: a row that says what it holds
 * ("Done (2)", from common.shell.done) and shows its rows under it when
 * opened. `meta` follows the label on the same line, after a comma ("1 late"
 * with its hazard mark, or a time), and keeps its room while a long label
 * gives way. `detail` is a line of its own under the label, as a row's meta
 * is (who ticked, under "3 ticked on time"), whole on up to two lines.
 * `aria-expanded` says whether it's open.
 */
export function Fold({
  label,
  meta,
  detail,
  children,
  initiallyOpen = false,
  testID,
}: {
  label: string;
  meta?: ReactNode;
  detail?: string;
  children: ReactNode;
  initiallyOpen?: boolean;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const inset = useRowInset();
  const words = useWords();
  const [open, setOpen] = useState(initiallyOpen);
  const [pressed, setPressed] = useState(false);
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((was) => !was)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        testID={testID}
        style={[styles.fold, { paddingHorizontal: inset }, pressed && { backgroundColor: colors.secondary }]}
      >
        <Hairline />
        <View style={styles.leading}>
          <Chevron size={20} color={colors.mutedForeground} aria-hidden />
        </View>
        <View style={styles.words}>
          <View style={styles.line}>
            <Text numberOfLines={1} style={[type.body, styles.label]}>
              {meta != null ? words('common.join.trailingComma', { text: label }) : label}
            </Text>
            {meta != null ? <View style={styles.meta}>{meta}</View> : null}
          </View>
          {detail ? <Meta numberOfLines={2}>{detail}</Meta> : null}
        </View>
      </Pressable>
      {open ? children : null}
    </>
  );
}

/**
 * A quiet fold in a chat: its words in Meta with a chevron that turns down
 * when it opens, and what it holds under it ("Thought for 4 seconds" over
 * Jonz's steps). With `rule`, a line runs either side of the words, across
 * the chat ("Jonz summed up 38 earlier messages"). `aria-expanded` says
 * whether it's open.
 */
export function QuietFold({
  label,
  rule = false,
  children,
  testID,
}: {
  label: string;
  rule?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  const head = (
    <Pressable
      accessibilityRole="button"
      aria-expanded={open}
      onPress={() => setOpen((was) => !was)}
      hitSlop={SPACE.md}
      style={({ pressed }) => [styles.quietHead, pressed && styles.quietPressed]}
      testID={testID}
    >
      <Meta>{label}</Meta>
      <Chevron size={16} color={colors.mutedForeground} aria-hidden />
    </Pressable>
  );
  return (
    <View style={styles.quiet}>
      {rule ? (
        <View style={styles.rule}>
          <Separator grow />
          {head}
          <Separator grow />
        </View>
      ) : (
        head
      )}
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fold: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: SPACE.sm,
  },
  leading: { width: LEADING, alignItems: 'center' },
  // The gap stands in for the space after the separator, which a line drops at its end.
  words: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  label: { flexShrink: 1, fontFamily: FONT.bold },
  meta: { flexShrink: 0 },
  quiet: { gap: SPACE.sm },
  quietHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start' },
  quietPressed: { opacity: 0.6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
