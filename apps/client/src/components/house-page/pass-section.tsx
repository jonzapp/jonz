import { formatMoney, freeGroups, PASS_PRICES, passLine, passWords, type PassGroup } from '@app/core';
import { CheckIcon, LockIcon, MinusIcon, TicketIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import type { HouseView } from '@/hooks/use-house';
import { useWords } from '@/hooks/use-words';
import { INSET, LABEL_GAP, TAP, useTheme } from '@/theme';

/**
 * Free and House Pass on House (the Family Pass in a family): every group of
 * features once, in plain words, with a Free and a Pass column of ticks, so
 * what the Pass adds shows at a glance. Its last row is where the house
 * stands (and, while it hasn't paid, about what the Pass costs each person a
 * month), pushing the Pass page. Titles and lines wrap whole, never cut, so
 * a small phone reads every word beside the two tick columns.
 */
export function PassSection({ view }: { view: HouseView }) {
  const words = useWords(view.snapshot.house.kind);
  const { colors, type } = useTheme();
  const { house, rules, members } = view.snapshot;
  const sign = passWords(house.kind, words);
  const where = passLine(house.pass, view.now, rules.timezone, words);
  // Only while the house hasn't paid: the free month, or once it has ended.
  const selling = house.pass.plan === 'trial';
  const each = Math.round(PASS_PRICES[rules.currency].yearly / 12 / Math.max(1, members.length));
  const meta = selling
    ? words('common.join.comma', {
        first: words('house.pass.card.perPerson', { price: formatMoney(each, rules.currency, words) }),
        second: where.charAt(0).toLocaleLowerCase(words.locale) + where.slice(1),
      })
    : where;
  const free = words('house.pass.card.free');
  const pass = words('house.pass.card.passHead');
  const line = (group: PassGroup, inFree: boolean) => (
    <Row
      key={group.key}
      title={group.title}
      meta={<Meta>{group.meta}</Meta>}
      titleLines={2}
      accessibilityLabel={`${group.title}, ${group.meta} ${free}: ${inFree ? words('house.pass.card.yes') : words('house.pass.card.no')}. ${pass}: ${words('house.pass.card.yes')}.`}
      cells={
        <>
          <View style={styles.cell}>
            {inFree ? <CheckIcon size={20} color={colors.foreground} aria-hidden /> : <MinusIcon size={20} color={colors.mutedForeground} aria-hidden />}
          </View>
          <View style={styles.cell}>
            <CheckIcon size={20} color={colors.foreground} aria-hidden />
          </View>
        </>
      }
      testID={`pass-group-${group.key}`}
    />
  );
  return (
    <View testID="pass-section">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[type.sectionLabel, styles.label, { color: colors.foreground }]}>
          {words('house.pass.card.label')}
        </Text>
        <Text aria-hidden style={[type.caps, styles.headCell, { color: colors.mutedForeground }]}>
          {free}
        </Text>
        <Text aria-hidden style={[type.caps, styles.headCell, { color: colors.mutedForeground }]}>
          {pass}
        </Text>
      </View>
      <Group>
        {freeGroups(words).map((group) => line(group, true))}
        {sign.extras.map((group) => line(group, false))}
        <Row leading={<RowIcon icon={TicketIcon} />} title={sign.unlock} meta={<Meta>{meta}</Meta>} href="/house/pass" chevron testID="to-pass" />
      </Group>
    </View>
  );
}

/** Where an extra was, for a house without the Pass once it's enforced: one row to the Pass page. */
export function PassLocked({ label, feature, testID }: { label: string; feature: string; testID?: string }) {
  const words = useWords();
  return (
    <Section label={label} testID={testID}>
      <Row
        leading={<RowIcon icon={LockIcon} />}
        title={words('house.pass.locked', { feature })}
        meta={words('house.pass.unlock')}
        href="/house/pass"
        chevron
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: INSET, marginBottom: LABEL_GAP },
  label: { flex: 1 },
  cell: { width: TAP, alignItems: 'center', justifyContent: 'center' },
  headCell: { width: TAP, textAlign: 'center' },
});
