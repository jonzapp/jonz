import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { RING_ROW, RING_ROW_HOLDER } from '@/components/focus-rings';
import { Group, Hairline } from '@/components/group';
import { Separator } from '@/components/separator';
import { GROUP_RADIUS, HAIR, INSET, pressTint, ROW_GAP, SPACE, TABULAR, useTheme } from '@/theme';

/** One of a table's columns: its name, and a fixed width or a share of what's left. */
export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  flex?: number;
  /** Numbers and times line up on their right. */
  end?: boolean;
}

/** On a laptop, where a pointer can hit it, a table row is this tall, so a busy list shows three times as many rows as a phone's. */
const DENSE = 40;

function cellStyle(column: TableColumn): StyleProp<ViewStyle> {
  return column.width != null ? { width: column.width } : { flex: column.flex ?? 1, minWidth: 0 };
}

/**
 * One Table (shadcn's Table), for every table in the app: a busy admin list
 * on a laptop (the audit log, Houses, Deletions), Week on a laptop, the John
 * list, and a table in an Ask Jonz reply. One line a row where it fits, in
 * columns under their names, so the eye runs down a column. The names are
 * in section-label caps on the table's own card colour at its top, a line
 * under them; numbers line up on their right. A screen reader hears each
 * row whole, so the names are hidden from it, unless the rows are heard
 * cell by cell (`spoken`: a reply's table). On a phone a busy list is Rows
 * instead.
 */
export function Table({
  columns,
  children,
  head = true,
  spoken = false,
  testID,
}: {
  columns: readonly TableColumn[];
  children: ReactNode;
  /** False when the names sit apart, in a TableHead pinned over the rows: the rows then join it square. */
  head?: boolean;
  /** The names are heard too, where the rows are heard cell by cell (a reply's table). */
  spoken?: boolean;
  testID?: string;
}) {
  return (
    <Group testID={testID} style={!head && styles.joined}>
      {head ? <TableHead columns={columns} inside spoken={spoken} testID={testID ? `${testID}-head` : undefined} /> : null}
      {children}
    </Group>
  );
}

/**
 * A table's column names, on the card colour. Inside the table's group,
 * where the first row's line falls under them, or on its own (`inside`
 * false) as the rounded top of a table whose rows follow square under it,
 * drawing that line itself, so a busy list can keep the names in view as
 * it scrolls.
 */
export function TableHead({ columns, inside = false, spoken = false, testID }: { columns: readonly TableColumn[]; inside?: boolean; spoken?: boolean; testID?: string }) {
  const { colors, type } = useTheme();
  return (
    <View aria-hidden={!spoken} testID={testID} style={[styles.head, !inside && styles.top, { backgroundColor: colors.card }]}>
      {columns.map((column) => (
        <Text
          key={column.key}
          numberOfLines={1}
          style={[type.caps, styles.caps, cellStyle(column) as StyleProp<TextStyle>, column.end && styles.end]}
        >
          {column.label}
        </Text>
      ))}
      {/* On its own, over rows that scroll under it, it draws the line the first row would. */}
      {inside ? null : <Separator style={styles.under} testID={testID ? `${testID}-line` : undefined} />}
    </View>
  );
}

/**
 * One row of a Table: a cell for each column, in order. A string is set
 * in Body (muted where `quiet` names its column), anything else as it is.
 * The whole row is one button that opens the entry; the chosen one is on
 * the tint with an ink edge, as a picked row is in the side panel's list.
 */
export function TableRow({
  columns,
  cells,
  quiet = [],
  strong = [],
  chosen = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  columns: readonly TableColumn[];
  cells: Record<string, ReactNode>;
  /** The columns set in muted ink: a time, a detail. */
  quiet?: readonly string[];
  /** The columns set in bold: who. */
  strong?: readonly string[];
  chosen?: boolean;
  /** Opens the entry; without it the row is only read (someone whose role can't change it, a reply's table). */
  onPress?: () => void;
  /** The whole row as a screen reader hears it; leave it out for each cell to be heard on its own (a reply's table). */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  // The mouse over a row that opens: the same wash as a press.
  const [hovered, setHovered] = useState(false);
  // The keyboard's focus ring, inside the row's edges (components/focus-rings.tsx).
  const ring = (set: object) => (onPress && Platform.OS === 'web' ? ({ dataSet: set } as object) : {});
  const line = <TableCells columns={columns} cells={cells} quiet={quiet} strong={strong} />;
  return (
    <View style={[chosen && { backgroundColor: colors.secondary }]} testID={testID} {...ring(RING_ROW_HOLDER)}>
      <Hairline />
      {chosen ? <View aria-hidden pointerEvents="none" style={[styles.edge, { backgroundColor: colors.foreground }]} /> : null}
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          aria-current={chosen || undefined}
          onPress={onPress}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          {...ring(RING_ROW)}
          style={[styles.row, (pressed || hovered) && { backgroundColor: pressTint(colors) }]}
        >
          {line}
        </Pressable>
      ) : (
        // Only read: heard whole when it has a label (someone whose role can't change it), else cell by cell (a reply's table, its links still pressable).
        <View accessible={accessibilityLabel != null} accessibilityLabel={accessibilityLabel} style={styles.row}>
          {line}
        </View>
      )}
    </View>
  );
}

/** A row's cells, one per column: a string in Body (muted or bold where its column says), anything else as it is. */
function TableCells({ columns, cells, quiet, strong }: { columns: readonly TableColumn[]; cells: Record<string, ReactNode>; quiet: readonly string[]; strong: readonly string[] }) {
  const { colors, type } = useTheme();
  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingHorizontal: INSET },
  // On its own, the names are the table's rounded top; the rows' group meets them square.
  top: { borderTopLeftRadius: GROUP_RADIUS, borderTopRightRadius: GROUP_RADIUS },
  joined: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  // Overpass's caps sit high in their line, so the names come down a little, as a section's label does.
  caps: { paddingTop: HAIR },
  row: { minHeight: DENSE, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingHorizontal: INSET, paddingVertical: SPACE.xs },
  cell: { justifyContent: 'center' },
  cellEnd: { alignItems: 'flex-end' },
  end: { textAlign: 'right' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  under: { position: 'absolute', left: INSET, right: 0, bottom: 0 },
});
