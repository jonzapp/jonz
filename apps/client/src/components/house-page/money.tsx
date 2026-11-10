import { type MetaPart } from '@app/core';
import { TrendingDownIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { STATUS_ICON } from '@/components/status-mark';
import { Body, Meta } from '@/components/text';
import { SPACE, TABULAR, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * A row's meta line from core's parts: muted Meta, with late and missed in
 * hazard words after their 14pt hazard mark (the status map's clock or X).
 * Hazard words need the card colour behind them: on a `tinted` row (your
 * own, on the Table) they are ink, and the mark alone carries the hazard.
 */
export function MetaLine({ parts, tinted = false }: { parts: readonly MetaPart[]; tinted?: boolean }) {
  const { colors } = useTheme();
  const words = (some: readonly MetaPart[]) =>
    some.map((part, i) => (
      <Text key={i} style={part.hazard && !tinted ? { color: colors.hazard } : undefined}>
        {part.text}
      </Text>
    ));
  const first = parts.findIndex((part) => part.hazard);
  if (first < 0) return <Meta numberOfLines={1}>{words(parts)}</Meta>;

  const Mark = STATUS_ICON[parts[first].icon ?? 'triangle'];
  // What comes before the hazard words keeps its room, its last separator
  // kept clear of the mark; what follows the mark gives way.
  const before = parts.slice(0, first).map((part, i) => (i === first - 1 ? { ...part, text: part.text.trimEnd() } : part));
  return (
    <View style={styles.line}>
      {before.length ? (
        <Meta numberOfLines={1} style={styles.before}>
          {words(before)}
        </Meta>
      ) : null}
      <Mark size={14} color={colors.hazard} aria-hidden />
      <Meta numberOfLines={1} style={styles.after}>
        {words(parts.slice(first))}
      </Meta>
    </View>
  );
}

/**
 * An amount as a row's one trailing item, in tabular Body with its sign.
 * Money lost is in hazard, with a falling-line mark (left off where the row
 * already carries a hazard mark) and said in words to a screen reader. On a
 * `tinted` row the figure is ink and the mark stays, as hazard words need the
 * card colour behind them.
 */
export function Money({
  value,
  losing = false,
  marked = true,
  tinted = false,
  testID,
}: {
  value: string;
  losing?: boolean;
  marked?: boolean;
  tinted?: boolean;
  testID?: string;
}) {
  const words = useWords();
  const { colors } = useTheme();
  if (!losing) {
    return (
      <Body numberOfLines={1} style={styles.value} testID={testID}>
        {value}
      </Body>
    );
  }
  return (
    <View accessible accessibilityLabel={words('house.page.losing', { amount: value })} style={styles.losing} testID={testID}>
      {marked ? <TrendingDownIcon size={16} color={colors.hazard} aria-hidden /> : null}
      <Body numberOfLines={1} style={[styles.value, { color: tinted ? colors.foreground : colors.hazard }]}>
        {value}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  // The gap stands in for the space after the last separator before the mark,
  // which a line drops at its end.
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  before: { flexShrink: 0 },
  after: { flexShrink: 1, minWidth: 0 },
  value: { flexShrink: 0, ...TABULAR },
  losing: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
});
