import { InfoIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { Group } from '@/components/group';
import { Popover } from '@/components/popover';
import { Row } from '@/components/row';
import { Meta } from '@/components/text';
import { INSET, MARK_GAP, TAP, useTheme } from '@/theme';

const SHARES = [
  { who: 'You', balance: '+4.5' },
  { who: 'Sam', balance: '−13.5' },
  { who: 'Priya', balance: '+13.5' },
];

/** Explaining a number: a line with an info mark that opens a Popover (a sheet on a phone), as Week's fair shares do. */
export function Explaining() {
  const { colors } = useTheme();
  return (
    <Popover
      title="Fair shares"
      description="What each of you has done since you joined, against your share."
      opener={(open, isOpen) => (
        <Pressable accessibilityRole="button" aria-expanded={isOpen} onPress={open} style={styles.line} testID="style-popover">
          <Meta style={styles.words}>Sam is 13.5 pts behind on fair shares, and catching up a little each week.</Meta>
          <InfoIcon size={16} color={colors.mutedForeground} aria-hidden />
        </Pressable>
      )}
    >
      <Group>
        {SHARES.map((row) => (
          <Row key={row.who} title={row.who} trailing={row.balance} />
        ))}
      </Group>
    </Popover>
  );
}

const styles = StyleSheet.create({
  line: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: MARK_GAP, paddingHorizontal: INSET },
  words: { flexShrink: 1 },
});
