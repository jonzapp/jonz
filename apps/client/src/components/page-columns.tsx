import { Fragment, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useHouseWorkspace } from '@/components/house/workspace';
import { roomFor, useFilled } from '@/components/screen';
import { askPanelWidth, useAskPanelOpen } from '@/hooks/use-ask-jonz';
import { COLUMN_MIN, FILL_MAX, GUTTER, SECTION_GAP, WIDE } from '@/theme';

/** How many columns of at least COLUMN_MIN, SECTION_GAP apart, fit in `width`. */
export function columnsIn(width: number): number {
  return Math.max(1, Math.floor((width + SECTION_GAP) / (COLUMN_MIN + SECTION_GAP)));
}

/**
 * Shares things out into `columns` columns in their order, each going to the
 * column that's shortest so far (the leftmost of the shortest), by `weights`
 * (how tall each is, in rows). Gives each column's indexes, top to bottom.
 */
export function flowColumns(weights: readonly number[], columns: number): number[][] {
  const heights = Array.from({ length: Math.max(1, columns) }, () => 0);
  const out: number[][] = heights.map(() => []);
  weights.forEach((weight, i) => {
    const shortest = heights.indexOf(Math.min(...heights));
    out[shortest].push(i);
    heights[shortest] += weight;
  });
  return out;
}

/** Whether a `Pair` here shows its two stacks side by side: on a page that fills the room, with two columns' worth of it. */
export function useSideBySide(): boolean {
  const filled = useFilled();
  return filled !== null && columnsIn(filled) >= 2;
}

/**
 * Whether a page that fills the room would show a `Pair` side by side at
 * this window's width: where it does, a page a phone pushes from a list (a
 * housemate's record, a guide topic) opens beside its list instead, never in
 * one column with the room blank beside it. Read from the window (less the
 * chat with Jonz, where it's open), as the page it goes to hasn't measured
 * itself yet.
 */
export function useOpensBeside(): boolean {
  const windowWidth = useWindowDimensions().width;
  const { listed } = useHouseWorkspace();
  const asking = useAskPanelOpen();
  if (windowWidth < WIDE) return false;
  const room = roomFor(windowWidth, listed) - (asking ? askPanelWidth(windowWidth) : 0);
  return columnsIn(Math.min(room - 2 * GUTTER, FILL_MAX)) >= 2;
}

/**
 * Two stacks of sections side by side on a page that fills the room on a
 * laptop (`Screen` with `fills`): `start` takes `ratio` of the width to
 * `end`'s one, and they share a top edge. Where two columns of COLUMN_MIN
 * don't fit, and on a phone, it's one stack: `start`, then `end`, or `end`
 * first with `endFirst` (what a phone comes to the page for, when that's
 * the second column on a laptop).
 */
export function Pair({
  start,
  end,
  ratio = 1,
  endFirst = false,
  testID,
}: {
  start: ReactNode;
  end: ReactNode;
  ratio?: number;
  endFirst?: boolean;
  testID?: string;
}) {
  if (!useSideBySide()) {
    return endFirst ? (
      <>
        {end}
        {start}
      </>
    ) : (
      <>
        {start}
        {end}
      </>
    );
  }
  return (
    <View style={styles.row} testID={testID}>
      <View style={[styles.column, { flex: ratio }]} testID={testID ? `${testID}-start` : undefined}>
        {start}
      </View>
      <View style={[styles.column, { flex: 1 }]} testID={testID ? `${testID}-end` : undefined}>
        {end}
      </View>
    </View>
  );
}

/** One of the things a Flow shares out: its key, how tall it is in rows, and what it shows. */
export interface FlowItem {
  key: string;
  weight: number;
  node: ReactNode;
}

/**
 * Sections in as many columns as fit (each at least COLUMN_MIN) on a page
 * that fills the room on a laptop: a housemate's record, Stake history's
 * months. Each goes to the shortest column so far, so the columns end near
 * each other and the page reads across, then down. On a phone it's one
 * stack, in order.
 */
export function Flow({ items, testID }: { items: readonly FlowItem[]; testID?: string }) {
  const filled = useFilled();
  if (filled === null) {
    return (
      <>
        {items.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </>
    );
  }
  const columns = flowColumns(
    items.map((item) => item.weight),
    columnsIn(filled),
  );
  return (
    <View style={styles.row} testID={testID}>
      {columns.map((column, i) => (
        <View key={i} style={[styles.column, styles.even]} testID={testID ? `${testID}-column` : undefined}>
          {column.map((index) => (
            <Fragment key={items[index].key}>{items[index].node}</Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SECTION_GAP },
  // Each column keeps SECTION_GAP between its sections, as the page does, and may shrink below its words.
  column: { minWidth: 0, gap: SECTION_GAP },
  even: { flex: 1 },
});
