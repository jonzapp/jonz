import { weekShareRows, weekWho } from '@app/core';
import { InfoIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BarChart } from '@/components/chart';
import { Popover } from '@/components/popover';
import { Meta } from '@/components/text';
import { INSET, MARK_GAP, SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Week's footer: the deal's fairness in one sentence, with an info mark,
 * on a thumb-tall line that opens the fair shares in a Popover (a sheet on
 * a phone): how the deal evens them out (the Table's words), everyone's
 * balance against their share as a BarChart (behind to the left, ahead to
 * the right), and how the house counts time away.
 */
export function FairnessFooter({
  sentence,
  balances,
  memberIds,
  viewerId,
  nameOf,
  awayMakeup,
}: {
  /** From core's weekFairness. */
  sentence: string;
  balances: { userId: string; balance: number }[];
  /** Everyone in the house, in the order they joined. */
  memberIds: string[];
  viewerId: string;
  /** Anyone's full name by id, or null for someone who has left. */
  nameOf: (userId: string) => string | null;
  /** houses.away_makeup. */
  awayMakeup: number;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const shares = weekShareRows(balances, memberIds, viewerId, awayMakeup, words);
  return (
    <Popover
      title={words('house.table.shares')}
      description={words('house.table.sharesBody')}
      opener={(open, isOpen) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sentence}
          accessibilityHint={words('week.summary.sharesHint')}
          aria-expanded={isOpen}
          onPress={open}
          testID="week-fairness"
          style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
        >
          <Meta style={styles.sentence}>{sentence}</Meta>
          <InfoIcon size={16} color={colors.mutedForeground} aria-hidden />
        </Pressable>
      )}
      testID="fair-shares"
    >
      <View style={styles.shares}>
        <SharesChart rows={shares.rows} viewerId={viewerId} nameOf={nameOf} testID="fair-shares-chart" />
        <Meta>{shares.key}</Meta>
      </View>
    </Popover>
  );
}

/**
 * Everyone's balance against their fair share as a BarChart, behind to the
 * left and ahead to the right, each with their face: Week's popover and an
 * Ask Jonz reply's ::shares card draw the same one.
 */
export function SharesChart({
  rows,
  viewerId,
  nameOf,
  testID,
}: {
  /** From core's weekShareRows. */
  rows: readonly { userId: string; balance: string; points: number }[];
  viewerId: string;
  nameOf: (userId: string) => string | null;
  testID?: string;
}) {
  const words = useWords();
  return (
    <BarChart
      bars={rows.map((row) => ({
        key: row.userId,
        leading: <Avatar name={nameOf(row.userId) ?? words('common.shell.formerHousemate')} userId={row.userId} me={row.userId === viewerId} />,
        name: weekWho(row.userId, viewerId, nameOf, words),
        value: row.points,
        shown: row.balance,
      }))}
      below={words('house.table.behind')}
      above={words('house.table.ahead')}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: MARK_GAP,
    paddingHorizontal: INSET,
  },
  pressed: { opacity: 0.6 },
  sentence: { flexShrink: 1 },
  shares: { gap: SPACE.sm, paddingHorizontal: INSET },
});
