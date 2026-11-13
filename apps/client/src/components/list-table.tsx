import { withAlpha } from '@app/core';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Group, Hairline } from '@/components/group';
import { GROUP_RADIUS, INSET, ROW_GAP, SPACE, TABULAR, useTheme } from '@/theme';

/** One of a table's columns: its name, and a fixed width or a share of what's left. */
export interface ListColumn {
  key: string;
  label: string;
  width?: number;
  flex?: number;
  /** Numbers and times line up on their right. */
  end?: boolean;
}

/** On a laptop, where a pointer can hit it, a table row is this tall, so a busy list shows three times as many rows as a phone's. */
const DENSE = 40;

function cellStyle(column: ListColumn): StyleProp<ViewStyle> {
  return column.width != null ? { width: column.width } : { flex: column.flex ?? 1, minWidth: 0 };
}

/**
 * A busy admin list on a laptop (the audit log, Houses, Deletions): one
 * line a row, in columns under their names, so a screen holds twenty rows
 * and the eye runs down a column. The names are in section-label caps on
 * the secondary band at the group's top, hidden from a screen reader, which
 * hears each row whole. On a phone the same list is Rows instead.
 */
export function ListTable({
  columns,
  children,
  head = true,
  testID,
}: {
  columns: readonly ListColumn[];
  children: ReactNode;
  /** False when the names sit apart, in a ListTableHead pinned over the rows: the rows then join it square. */
  head?: boolean;
  testID?: string;
}) {
  return (
    <Group testID={testID} style={!head && styles.joined}>
      {head ? <ListTableHead columns={columns} inside testID={testID ? `${testID}-head` : undefined} /> : null}
      {children}
    </Group>
  );
}

/**
 * A table's column names on their band. Inside the table's group, or on
 * its own (`inside` false) as the rounded top of a table whose rows follow
 * square under it, so a busy list can keep the names in view as it scrolls.
 */
export function ListTableHead({ columns, inside = false, testID }: { columns: readonly ListColumn[]; inside?: boolean; testID?: string }) {
  const { colors, type } = useTheme();
  return (
    <View aria-hidden testID={testID} style={[styles.head, !inside && styles.top, { backgroundColor: colors.secondary }]}>
      {columns.map((column) => (
        <Text
          key={column.key}
          numberOfLines={1}
          style={[type.caps, styles.caps, cellStyle(column) as StyleProp<TextStyle>, column.end && styles.end]}
        >
          {column.label}
        </Text>
      ))}
    </View>
  );
}

/**
 * One row of a ListTable: a cell for each column, in order. A string is set
 * in Body (muted where `quiet` names its column), anything else as it is.
 * The whole row is one button that opens the entry; the chosen one is on
 * the tint with an ink edge, as a picked row is in the side panel's list.
 */
export function ListTableRow({
  columns,
  cells,
  quiet = [],
  strong = [],
  chosen = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  columns: readonly ListColumn[];
  cells: Record<string, ReactNode>;
  /** The columns set in muted ink: a time, a detail. */
  quiet?: readonly string[];
  /** The columns set in bold: who. */
  strong?: readonly string[];
  chosen?: boolean;
  /** Opens the entry; without it the row is only read (someone whose role can't change it). */
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <View style={[chosen && { backgroundColor: colors.secondary }]} testID={testID}>
      <Hairline />
      {chosen ? <View aria-hidden pointerEvents="none" style={[styles.edge, { backgroundColor: colors.foreground }]} /> : null}
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        aria-current={chosen || undefined}
        disabled={!onPress}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.row, pressed && { backgroundColor: withAlpha(colors.foreground, 0.06) }]}
      >
        {columns.map((column) => {
          const cell = cells[column.key];
          return (
            <View key={column.key} style={[cellStyle(column), styles.cell, column.end && styles.cellEnd]}>
              {typeof cell === 'string' || typeof cell === 'number' ? (
                <Text
                  numberOfLines={1}
                  style={[
                    type.body,
                    TABULAR,
                    { color: quiet.includes(column.key) ? colors.mutedForeground : colors.foreground },
                    strong.includes(column.key) && { fontFamily: type.rowTitle.fontFamily },
                    column.end && styles.end,
                  ]}
                >
                  {cell}
                </Text>
              ) : (
                cell
              )}
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingHorizontal: INSET },
  // On its own, the band is the table's rounded top; the rows' group meets it square.
  top: { borderTopLeftRadius: GROUP_RADIUS, borderTopRightRadius: GROUP_RADIUS },
  joined: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  // Overpass's caps sit high in their line, so the names come down a little, as a section's label does.
  caps: { paddingTop: 2 },
  row: { minHeight: DENSE, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingHorizontal: INSET, paddingVertical: SPACE.xs },
  cell: { justifyContent: 'center' },
  cellEnd: { alignItems: 'flex-end' },
  end: { textAlign: 'right' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});
