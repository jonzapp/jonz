import { HOUSE_PAGE_COPY, pocketRules, POCKET_COPY, stakeRules, type HouseRules } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { Group, GroupItem } from '@/components/group';
import { Sheet } from '@/components/sheet';
import { Body, RowTitle } from '@/components/text';

/**
 * How points and the stake work, in plain words with the house's own
 * amounts: points, the Stake, immunity, swaps and fair shares, one to an
 * item in one group. A family's (`pocketCapMinor` given) is how pocket
 * money works instead.
 */
export function RulesSheet({
  visible,
  onClose,
  rules,
  awayMakeup,
  pocketCapMinor,
}: {
  visible: boolean;
  onClose: () => void;
  rules: HouseRules;
  awayMakeup: number;
  pocketCapMinor?: number;
}) {
  const family = pocketCapMinor !== undefined;
  const items = family ? pocketRules(pocketCapMinor, rules.currency) : stakeRules(rules, awayMakeup);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={family ? POCKET_COPY.howItWorks : HOUSE_PAGE_COPY.rulesTitle}
      flush
      testID="rules-sheet"
    >
      <Group>
        {items.map((rule) => (
          <GroupItem key={rule.label}>
            <View style={styles.rule}>
              <RowTitle>{rule.label}</RowTitle>
              <Body>{rule.body}</Body>
            </View>
          </GroupItem>
        ))}
      </Group>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rule: { gap: 2 },
});
