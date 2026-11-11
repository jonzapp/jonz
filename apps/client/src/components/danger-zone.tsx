import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, type ButtonIcon } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Hairline } from '@/components/group';
import { Section } from '@/components/section';
import { Meta, RowTitle } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { BUTTON_MIN, GROUP_RADIUS, INSET, ROW_GAP, SPACE, useTheme } from '@/theme';

/**
 * The Danger zone, GitHub's way: the moves that can't be taken back, together
 * at the foot of the page that owns them, in one group edged in hazard. Each
 * is a DangerRow: what it does and what it costs on the left, its hazard
 * button on the right; on a phone, or wherever the row is too narrow for
 * both, the button goes under the words at full width. A button opens the
 * move's own "Are you sure?" sheet; nothing happens on the tap itself.
 */
export function DangerZone({ children, testID }: { children: ReactNode; testID?: string }) {
  const words = useWords();
  const { colors } = useTheme();
  return (
    <Section label={words('house.danger.label')} testID={testID}>
      <View style={[styles.edge, { borderColor: colors.hazard }]} pointerEvents="box-none">
        {children}
      </View>
    </Section>
  );
}

/** One move in the Danger zone. */
export function DangerRow({
  title,
  meta,
  action,
  icon,
  onPress,
  testID,
}: {
  title: string;
  /** What it does and what goes, in a sentence or two. */
  meta: string;
  /** The button's words: the move, short ("Start over"). */
  action: string;
  icon?: ButtonIcon;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID ? `${testID}-row` : undefined}>
      <Hairline />
      <View style={styles.words}>
        <RowTitle>{title}</RowTitle>
        <Meta>{meta}</Meta>
      </View>
      <View style={styles.button}>
        <ButtonRow>
          <Button variant="hazard" icon={icon} label={action} onPress={onPress} testID={testID} />
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Drawn over the group's own edge, so its rows keep their insets and hairlines.
  edge: { borderWidth: 1, borderRadius: GROUP_RADIUS, overflow: 'hidden' },
  // Words and button share the line when there's room; the button wraps under them when there isn't.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: ROW_GAP,
    rowGap: SPACE.md,
    paddingHorizontal: INSET,
    paddingVertical: SPACE.md,
  },
  // The words take the line first, and give it up only below 240.
  words: { flexGrow: 1000, flexBasis: 240, flexShrink: 1, gap: SPACE.xs },
  // Beside the words, BUTTON_MIN wide; on a line of its own, the whole width.
  button: { flexGrow: 1, flexBasis: BUTTON_MIN },
});
