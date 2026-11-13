import { StyleSheet, Text, View } from 'react-native';

import { ListTableRow, type ListColumn } from '@/components/list-table';
import { LID_BAR, LidBar } from '@/components/lid';
import { Meta } from '@/components/text';
import { SPACE, TABULAR, useTheme } from '@/theme';

/**
 * The John list's columns on a laptop: the John, when it's due, how often,
 * what else sets it apart, and its points. Where the page is too narrow for
 * five (a John open in the panel beside it), how often and the rest go on
 * a line under the name.
 */
function lineColumns(roomy: boolean): ListColumn[] {
  return [
    { key: 'name', label: '', flex: 2 },
    { key: 'when', label: '', width: 104 },
    ...(roomy ? [{ key: 'often', label: '', width: 168 }, { key: 'also', label: '', flex: 1.3 }] : []),
    { key: 'points', label: '', width: 64, end: true },
  ];
}

/**
 * One John on the John list on a laptop: a line of lined-up columns, so the
 * eye runs down a kind's days, how often and points like a timetable. Its
 * lid bar leads the name. Nothing on it but itself to press: it opens the
 * John. Words wrap rather than being cut off. (John list C, 13 Nov)
 */
export function JohnLine({
  name,
  category,
  when,
  often,
  also,
  points,
  weekly,
  roomy,
  onPress,
  accessibilityLabel,
}: {
  name: string;
  category: string;
  when: string;
  often: string;
  also: string[];
  points: string;
  /** Comes round every week: under the name, where it's the usual, it goes unsaid. */
  weekly: boolean;
  /** Room for every column; otherwise how often and the rest sit under the name. */
  roomy: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors, type } = useTheme();
  const quiet = [type.body, { color: colors.mutedForeground }];
  const under = roomy ? null : [weekly ? null : often, ...also].filter(Boolean).join(', ');
  return (
    <ListTableRow
      columns={lineColumns(roomy)}
      cells={{
        name: (
          <View style={styles.name}>
            <View style={styles.titled}>
              <View style={styles.lid}>
                <LidBar category={category} />
              </View>
              <Text style={[type.body, styles.grow, { color: colors.foreground, fontFamily: type.rowTitle.fontFamily }]}>{name}</Text>
            </View>
            {under ? <Meta style={styles.under}>{under}</Meta> : null}
          </View>
        ),
        when: <Text style={[type.body, TABULAR, { color: colors.foreground }]}>{when}</Text>,
        often: <Text style={quiet}>{often}</Text>,
        also: <Text style={quiet}>{also.join(', ')}</Text>,
        points: <Text style={[type.body, TABULAR, styles.end, { color: colors.foreground }]}>{points}</Text>,
      }}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID="john-def"
    />
  );
}

const LID_GAP = SPACE.sm;

const styles = StyleSheet.create({
  name: { gap: SPACE.xs },
  titled: { flexDirection: 'row', alignItems: 'center', gap: LID_GAP },
  lid: { flexShrink: 0 },
  grow: { flex: 1, minWidth: 0 },
  // The line under the name starts under the name, past the lid bar.
  under: { paddingLeft: LID_BAR + LID_GAP },
  end: { textAlign: 'right' },
});
