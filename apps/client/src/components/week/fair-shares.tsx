import { weekShareRows, weekWho } from '@app/core';
import { InfoIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { INSET, MARK_GAP, SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Week's footer: the deal's fairness in one sentence, with an info mark,
 * on a thumb-tall line that opens the fair shares: how the deal evens them
 * out (the Table's words), everyone's balance against their share, and how
 * the house counts time away.
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
  const [open, setOpen] = useState(false);
  const shares = weekShareRows(balances, memberIds, viewerId, awayMakeup, words);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sentence}
        accessibilityHint={words('week.summary.sharesHint')}
        onPress={() => setOpen(true)}
        testID="week-fairness"
        style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
      >
        <Meta style={styles.sentence}>{sentence}</Meta>
        <InfoIcon size={16} color={colors.mutedForeground} aria-hidden />
      </Pressable>
      <Sheet
        visible={open}
        title={words('house.table.shares')}
        description={words('house.table.sharesBody')}
        onClose={() => setOpen(false)}
        flush
        testID="fair-shares"
      >
        <View style={styles.shares}>
          <Group>
            {shares.rows.map((row) => (
              <Row
                key={row.userId}
                leading={
                  <Avatar name={nameOf(row.userId) ?? words('common.shell.formerHousemate')} userId={row.userId} me={row.userId === viewerId} />
                }
                title={weekWho(row.userId, viewerId, nameOf, words)}
                trailing={row.balance}
                testID="fair-share"
              />
            ))}
          </Group>
          <Meta style={styles.key}>{shares.key}</Meta>
        </View>
      </Sheet>
    </>
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
  shares: { gap: SPACE.sm },
  key: { paddingHorizontal: INSET },
});
