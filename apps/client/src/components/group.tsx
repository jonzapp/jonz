import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Separator } from '@/components/separator';
import { DASH, GROUP_RADIUS, INSET, useTheme } from '@/theme';

/**
 * What a row sits in: how far its content starts from the container's edge
 * (INSET in a group, nothing in a card's rows). Outside a group or a card's
 * rows there is none, and a row draws no hairline.
 */
interface RowFrame {
  inset: number;
}

const GROUP_FRAME: RowFrame = { inset: INSET };
const CARD_FRAME: RowFrame = { inset: 0 };
const RowFrameContext = createContext<RowFrame | null>(null);

/** The group or card rows the calling row sits in, or null outside either. */
function useRowFrame(): RowFrame | null {
  return useContext(RowFrameContext);
}

/** How far in a row starts its content: the frame's inset, or INSET on its own. */
export function useRowInset(): number {
  return useContext(RowFrameContext)?.inset ?? INSET;
}

/**
 * The inset group: one per section, on the card colour, rounded, no border.
 * Every row in it draws a hairline above itself from the leading edge, under
 * its avatar or tick too, and the group hides the first one: its content
 * sits a hairline high and the group clips it. So rows can come from any
 * depth of components (a list, a fragment, a component that returns several
 * rows) and the first one shown never has a line over it. Give it no
 * padding: the rows inset themselves.
 *
 * `dashed` is a group of things in no section yet (the John list's Johns in
 * No kind): no card colour, a dashed outline instead, so it reads as apart
 * from the sections around it. The outline is drawn over the group, so its
 * rows sit exactly where a card's would and line up with them.
 */
export function Group({ children, dashed = false, style, testID }: { children: ReactNode; dashed?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.group, dashed ? null : { backgroundColor: colors.card }, style]}>
      <View style={styles.clip}>
        <RowFrameContext.Provider value={GROUP_FRAME}>{children}</RowFrameContext.Provider>
      </View>
      {dashed ? <View aria-hidden pointerEvents="none" style={[styles.dashed, { borderColor: colors.mutedForeground }]} /> : null}
    </View>
  );
}

/**
 * Rows inside the one Card (Today's setup card: its words, then its
 * rows). They start at the card's own padding rather than
 * insetting again, and each draws a hairline above itself across the card's
 * content width, the first one included, since words come before them.
 * It leaves INSET between those words and the first line.
 */
export function CardRows({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={styles.cardRows}>
      <RowFrameContext.Provider value={CARD_FRAME}>{children}</RowFrameContext.Provider>
    </View>
  );
}

/**
 * The hairline above a row in a group or a card's rows, from the leading
 * edge to the container's right edge. Nothing outside either. Use it at the
 * top of your own row-like piece; the row must be its containing block (any
 * View is).
 */
export function Hairline() {
  const frame = useRowFrame();
  if (frame == null) return null;
  return <Separator testID="hairline" style={[styles.hairline, { left: frame.inset }]} />;
}

/**
 * Something in a group that isn't a row (a form, a sentence, a photo):
 * padded in to the leading edge, with the hairline above it.
 */
export function GroupItem({ children, testID }: { children: ReactNode; testID?: string }) {
  const inset = useRowInset();
  return (
    <View testID={testID} style={[styles.item, { paddingHorizontal: inset }]}>
      <Hairline />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: GROUP_RADIUS, overflow: 'hidden' },
  dashed: { ...StyleSheet.absoluteFill, borderRadius: GROUP_RADIUS, borderWidth: DASH, borderStyle: 'dashed' },
  // The first row's hairline rises out of the group, which clips it.
  clip: { marginTop: -StyleSheet.hairlineWidth },
  cardRows: { marginTop: INSET },
  hairline: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  item: { paddingVertical: INSET, gap: INSET },
});
