import { pocketRules, stakeRules, type HouseRules } from '@app/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Group, GroupItem } from '@/components/group';
import { Popover } from '@/components/popover';
import { Body, RowTitle } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { HAIR } from '@/theme';

/**
 * How points and the stake work, in plain words with the house's own
 * amounts: points, the Stake, immunity, swaps and fair shares, one to an
 * item in one group, in a Popover (a sheet on a phone) that `opener` opens.
 * A family's (`pocketCapMinor` given) is how pocket money works instead.
 */
export function RulesPopover({
  opener,
  rules,
  awayMakeup,
  pocketCapMinor,
}: {
  opener: (open: () => void) => ReactNode;
  rules: HouseRules;
  awayMakeup: number;
  pocketCapMinor?: number;
}) {
  const words = useWords();
  const family = pocketCapMinor !== undefined;
  const items = family ? pocketRules(pocketCapMinor, rules.currency, words) : stakeRules(rules, awayMakeup, words);
  return (
    <Popover title={family ? words('house.pocket.howItWorks') : words('house.page.rulesTitle')} opener={opener} testID="rules-popover">
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
    </Popover>
  );
}

const styles = StyleSheet.create({
  rule: { gap: HAIR },
});
