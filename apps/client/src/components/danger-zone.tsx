import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, type ButtonIcon } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group, Hairline } from '@/components/group';
import { Section } from '@/components/section';
import { Meta, RowTitle } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { BUTTON_MIN, INSET, ROW_GAP, SPACE, useTheme } from '@/theme';

/**
 * The Danger zone, GitHub's way: the moves that can't be taken back
 * (`isDangerous` in core: the registry's `destructive`), together, in one
 * group edged in hazard. It's the one way the app marks them, wherever they
 * are: at the foot of the page that owns them, each a DangerRow (what it
 * does on the left, its hazard button on the right; on a phone, or wherever
 * the row is too narrow, the button goes under the words at full width,
 * opening the move's own "Are you sure?" sheet), or on an Ask Jonz card,
 * where MoveList puts the ticked rows that can't be undone in one. Its label
 * is "Danger zone" unless the zone is all there is (a card of nothing else
 * keeps the card's own label and meta).
 */
export function DangerZone({ children, label, right, testID }: { children: ReactNode; label?: string; right?: string; testID?: string }) {
  const words = useWords();
  const { colors } = useTheme();
  return (
    <Section label={label ?? words('house.danger.label')} right={right} testID={testID} bare>
      <Group style={[styles.edge, { borderColor: colors.hazard }]}>{children}</Group>
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
  // The group's own edge, so the hazard line runs whole round its corners and the
  // group still hides the first row's hairline under it.
  edge: { borderWidth: 1 },
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
