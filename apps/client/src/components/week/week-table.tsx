import { weekSpokenRow, weekWho, type BoardItem } from '@app/core';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Group, GroupItem } from '@/components/group';
import { DoneFold, useJohnRow, type JohnRowContext } from '@/components/john-row';
import { Row } from '@/components/row';
import { Body } from '@/components/text';
import { INSET, LABEL_GAP, LEADING, ROW_GAP, SPACE, TABULAR, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A section label's line, which the columns' names stand in. */
const LABEL_LINE = 24;

/** The fixed columns; the John's takes what's left. */
const WHO = 112;
const POINTS = 40;
const STATUS = 120;

/**
 * The laptop's Week: one row per John, the whole house in one group, within
 * the tab's 680, under the columns' names. Each row is the phone's Row with two columns of its own:
 * the tick box (yours ticks from it), the John and its meta line (the column
 * that flexes), whose it is, its points (earned, once it's finished), and
 * one cell for where it has got to or what to do about it (Undo, Vote).
 * Tapping a row opens the John sheet. Finished Johns fold away at the end.
 * The column names are only for the eye: each row says all of its columns
 * to a screen reader.
 */
export function WeekTable({ rows, folded, context }: { rows: BoardItem[]; folded: BoardItem[]; context: JohnRowContext }) {
  return (
    <View testID="week-table">
      <HeadRow />
      <Group>
        {rows.map((item) => (
          <TableRow key={item.id} item={item} context={context} />
        ))}
        <DoneFold items={folded}>
          {folded.map((item) => (
            <TableRow key={item.id} item={item} context={context} />
          ))}
        </DoneFold>
      </Group>
    </View>
  );
}

/**
 * The columns' names, in section-label caps, hidden from a screen reader
 * (the rows say them). They stand over the group where a section's label
 * would, a label's line and LABEL_GAP, inset as the rows are: so the table
 * starts level with a section beside it (the Table, on a laptop), and its
 * rows with that section's rows.
 */
function HeadRow() {
  const words = useWords();
  const { type } = useTheme();
  const head = (label: string, style: StyleProp<TextStyle>) => (
    <Text numberOfLines={1} style={[type.caps, styles.caps, style]}>
      {label}
    </Text>
  );
  return (
    <View aria-hidden testID="week-table-head" style={styles.head}>
      <View style={styles.leading} />
      {head(words('week.table.columns.john'), styles.john)}
      {head(words('week.table.columns.who'), styles.who)}
      {head(words('week.table.columns.points'), [styles.points, styles.end])}
      {head(words('week.table.columns.status'), [styles.status, styles.end])}
    </View>
  );
}

/**
 * One John across the table's columns: the one Row, with whose it is and
 * its points as cells of their own, and the status cell as its trailing
 * item, kept beside its press target (it may hold Undo or Vote).
 */
function TableRow({ item, context }: { item: BoardItem; context: JohnRowContext }) {
  const words = useWords();
  const john = useJohnRow(item, context);
  const mine = item.userId === context.userId;
  const name = context.nameOf(item.userId) ?? words('common.shell.formerHousemate');
  const who = weekWho(item.userId, context.userId, context.nameOf, words);
  return (
    <>
      <Row
        title={item.name}
        titleLines={2}
        meta={john.plan.meta}
        metaLines={2}
        lid={john.plan.lid ? item.category : undefined}
        leading={john.leading}
        cells={
          <>
            <View style={[styles.who, styles.person]}>
              <Avatar name={name} userId={item.userId} me={mine} size={24} />
              <Body numberOfLines={1} style={styles.shrink}>
                {who}
              </Body>
            </View>
            <Body numberOfLines={1} style={[styles.points, styles.end, TABULAR]}>
              {String(john.plan.points)}
            </Body>
          </>
        }
        // Its points have their own column, so this cell is for anything else.
        trailing={<View style={[styles.status, styles.cell]}>{john.plan.trailing === 'points' ? null : john.trailing}</View>}
        trailingControl
        hazardEdge={john.plan.hazardEdge}
        onPress={john.open}
        accessibilityLabel={weekSpokenRow(item, john.plan.meta, who, john.plan.points)}
        testID="week-row"
      />
      {john.confirm}
      {john.problem ? (
        <GroupItem>
          <Alert message={john.problem} />
        </GroupItem>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    minHeight: LABEL_LINE,
    marginBottom: LABEL_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: INSET,
  },
  // Overpass's caps sit high in their line, so the names come down a little, as a section's label does.
  caps: { paddingTop: 2 },
  leading: { width: LEADING },
  // The John's column flexes, as a Row's words do.
  john: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  who: { width: WHO },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  points: { width: POINTS },
  status: { width: STATUS },
  end: { textAlign: 'right' },
  cell: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
});
