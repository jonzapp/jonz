import { STATUS_MARK, statusWord, type LiveStatus, type StatusIcon } from '@app/core';
import { CheckIcon, ClockIcon, FlagIcon, ShieldIcon, TriangleAlertIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useWords } from '@/hooks/use-words';
import { HAIR, RADIUS, SPACE, useTheme } from '@/theme';

/** Core names the icon; this is lucide's drawing of it. */
export const STATUS_ICON: Record<StatusIcon, LucideIcon> = {
  clock: ClockIcon,
  check: CheckIcon,
  triangle: TriangleAlertIcon,
  x: XIcon,
  flag: FlagIcon,
  shield: ShieldIcon,
};

/**
 * A chip: a word or two in the section label's caps, 24 tall, with a 14pt
 * icon, outlined and never filled. `quiet` is ink on a hairline edge (Due
 * soon, Checking, Swap ready), fine on the pavement too. `hazard` is hazard
 * words, icon and edge, and needs the card colour behind it, so it lives in
 * a group. `good` is done: a green tick and the word in ink, no edge.
 */
export function Chip({
  label,
  icon: Icon,
  tone = 'quiet',
  testID,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: 'quiet' | 'hazard' | 'good';
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const ink = tone === 'hazard' ? colors.hazard : colors.foreground;
  const edge = tone === 'hazard' ? colors.hazard : tone === 'quiet' ? colors.border : 'transparent';
  return (
    <View testID={testID} style={[styles.chip, tone === 'good' && styles.bare, { borderColor: edge }]}>
      {Icon ? <Icon size={14} strokeWidth={tone === 'good' ? 2.5 : 2} color={tone === 'good' ? colors.good : ink} aria-hidden /> : null}
      <Text numberOfLines={1} style={[type.caps, styles.word, { color: ink }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Where a John has got to, from core's STATUS_MARK, as one trailing item:
 * nothing while it's upcoming (its time is in the meta line); a quiet chip
 * for due soon, checking and excused; a green tick and the word for done; a
 * hazard chip for late, overdue, missed and disputed. Hazard words need the
 * card colour behind them, so a mark lives in a group.
 */
export function StatusMark({ status }: { status: LiveStatus }) {
  const words = useWords();
  const mark = STATUS_MARK[status];
  if (mark.tone === 'none') return null;
  return (
    <Chip
      label={statusWord(status, words)}
      icon={mark.icon ? STATUS_ICON[mark.icon] : undefined}
      tone={mark.tone}
      testID={`status-${status}`}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    height: 24,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS,
    borderWidth: 1,
  },
  // Done has no outline: the green tick and the word are enough.
  bare: { paddingHorizontal: 0 },
  // Overpass's caps sit high in their line, so the word comes down a little.
  word: { paddingTop: HAIR },
});
