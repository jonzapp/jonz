import { withAlpha } from '@app/core';
import { Link, type Href } from 'expo-router';
import { ChevronRightIcon, type LucideIcon } from 'lucide-react-native';
import { createContext, isValidElement, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hairline, useRowInset } from '@/components/group';
import { HazardTape } from '@/components/hazard-tape';
import { LidBar } from '@/components/lid';
import { Body, Meta, RowTitle } from '@/components/text';
import { LEADING, ROW_GAP, ROW_MIN, SPACE, TABULAR, TAP, useTheme } from '@/theme';

/** A row with a meta line comes out this tall; one without, ROW_MIN. */
const TWO_LINES = 64;

/** Whether the row drawing this sits on the tint (yours, or the one picked). */
const TintContext = createContext(false);

/** Whether what's drawing sits on a tinted row: a housemate's plate, the tint itself, would vanish there. */
export function useOnTint(): boolean {
  return useContext(TintContext);
}

/**
 * Whether a slot holds its own control (a TickBox, a TextButton, a
 * toggle), which keeps it out of the row's press target. A guess from the
 * element's own props; a wrapper that takes none of these says so with
 * Row's `leadingControl` or `trailingControl`.
 */
function looksLikeControl(node: ReactNode): boolean {
  if (!isValidElement<Record<string, unknown>>(node)) return false;
  const { onPress, href, onValueChange, onChange } = node.props;
  return onPress != null || href != null || onValueChange != null || onChange != null;
}

/**
 * The one row, everywhere: a 32pt leading slot (a tick box, an avatar or
 * an icon), a one-line title (two where a name or a sentence must show whole,
 * as a John's or on the Wall: `titleLines`), a meta line that wraps onto a
 * second rather than being cut short (`metaLines={1}` only where a table's
 * rows must keep one height), and one trailing item (a value, a chip or a
 * text button), 56 tall, 64 with a meta line, taller when it wraps. A value in words takes what it needs, up
 * to about 60% of the row, and wraps onto a second line past that, so it
 * never squeezes the title out. With `onPress` or `href` it is a button or a link a whole
 * thumb tall, `chevron` when it pushes a page. `selected` (true or false)
 * makes it one of several to choose from, a radio (`aria-checked`), the
 * chosen one on the tint; put the rows in a radiogroup. `current` marks the
 * one open beside its list on a laptop (a guide topic), on the tint with an
 * ink edge, as a chosen row of an owner's table is. A `leading` or
 * `trailing` element that has its own `onPress`, `href`, `onChange` or
 * `onValueChange` is its own control and sits beside the row's press target,
 * never inside it; `leadingControl` / `trailingControl` say so outright for
 * a component that takes none of those. `cells` are columns of their own
 * before the trailing item, for a row in a table. In a Group (or a card's
 * CardRows) it draws the hairline above itself from the leading edge.
 */
export function Row({
  title,
  sentence,
  meta,
  lid,
  leading,
  trailing,
  onPress,
  onLongPress,
  href,
  chevron = false,
  tint = false,
  hazardEdge = false,
  tone = 'ink',
  disabled = false,
  selected,
  current = false,
  titleLines = 1,
  metaLines = 2,
  top = false,
  cells,
  leadingControl,
  trailingControl,
  testID,
  accessibilityLabel,
}: {
  title: string;
  /**
   * The title as a sentence in Body with runs of its own (a Wall row's, its
   * names and Johns in bold), in place of the bold title. `title` is still
   * what it says.
   */
  sentence?: ReactNode;
  /** One line under the title, truncated: a string, or Meta text with spans of its own. */
  meta?: ReactNode;
  /** A John's category: its lid bar leads the meta line. */
  lid?: string;
  leading?: ReactNode;
  /** One thing: a value (a string is set as Body), a StatusMark, or a TextButton. */
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  href?: Href;
  /** Pushes a page: a muted chevron at the end. */
  chevron?: boolean;
  /** The neutral tint behind your own row (the Table's "You"); `hivis`, a faint amber, behind a Wall flag still open. */
  tint?: boolean | 'hivis';
  /** The 4pt hazard-tape edge of an overdue or missed John: the only coloured edge in the app. */
  hazardEdge?: boolean;
  /** `hazard` sets the title in hazard: a destructive row (Leave, Remove), on the card colour only. */
  tone?: 'ink' | 'hazard';
  disabled?: boolean;
  /** One of several to choose from: a radio, checked and tinted when chosen. Needs `onPress`. */
  selected?: boolean;
  /** The one of a list that's open beside it on a laptop: on the tint with an ink edge, `aria-current`. */
  current?: boolean;
  /** How many lines the title may take before it's cut short: 2 for a John's name or a sentence (a Wall row). */
  titleLines?: 1 | 2;
  /** How many lines a meta string may take before it's cut short: 2 unless said. */
  metaLines?: 1 | 2;
  /**
   * Line everything up on the first line of words rather than the row's
   * middle: the leading slot at the top, the words' first line on its
   * centre, and the trailing item (set to the first line's height) level
   * with it. For a row whose words may take two lines and grow (a Wall row).
   */
  top?: boolean;
  /** Fixed columns between the words and the trailing item, part of the row's press target: Week's table on a laptop. */
  cells?: ReactNode;
  /** `leading` is a control of its own (kept out of the row's press target). Guessed from its props when left out. */
  leadingControl?: boolean;
  /** `trailing` is a control of its own (a toggle, a reaction). Guessed from its props when left out. */
  trailingControl?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors, scheme, type } = useTheme();
  const inset = useRowInset();
  const [pressed, setPressed] = useState(false);
  const pressable = onPress != null || onLongPress != null || href != null;
  const leadingOutside = pressable && (leadingControl ?? looksLikeControl(leading));
  const trailingOutside = pressable && (trailingControl ?? looksLikeControl(trailing));
  const hasMeta = (meta != null && meta !== '') || lid != null;
  const tinted = tint === true || selected === true || current;

  const leadingSlot = leading != null ? <View style={styles.leading}>{leading}</View> : null;
  // On a top-lined row, how far the words' first line sits below the slot's top, to share its centre.
  const firstLine = top ? (LEADING - (sentence != null ? type.body.lineHeight! : type.rowTitle.lineHeight!)) / 2 : 0;
  const trailingValue =
    trailing == null ? null : typeof trailing === 'string' || typeof trailing === 'number' ? (
      <Body numberOfLines={2} style={styles.value}>
        {trailing}
      </Body>
    ) : (
      trailing
    );
  const trailingItem = top && trailingValue != null ? <View style={{ paddingTop: firstLine }}>{trailingValue}</View> : trailingValue;

  const inside = (
    <>
      {leadingOutside ? null : leadingSlot}
      <View style={[styles.words, top && { paddingTop: firstLine }]}>
        {sentence != null ? (
          <Body numberOfLines={titleLines}>{sentence}</Body>
        ) : (
          <RowTitle numberOfLines={titleLines} style={tone === 'hazard' ? { color: colors.hazard } : undefined}>
            {title}
          </RowTitle>
        )}
        {hasMeta ? (
          <View style={styles.metaLine}>
            {/* The dot stays on the meta's first line. */}
            {lid != null ? (
              <View style={styles.lid}>
                <LidBar category={lid} />
              </View>
            ) : null}
            <View style={styles.metaText}>
              {typeof meta === 'string' || typeof meta === 'number' ? <Meta numberOfLines={metaLines}>{meta}</Meta> : meta}
            </View>
          </View>
        ) : null}
      </View>
      {cells}
      {trailingOutside ? null : trailingItem}
      {chevron ? <ChevronRightIcon size={20} color={colors.mutedForeground} aria-hidden /> : null}
    </>
  );

  let body: ReactNode;
  if (!pressable) {
    body = <View style={[styles.target, top && styles.topped]}>{inside}</View>;
  } else {
    const target = (
      <Pressable
        accessibilityRole={selected != null ? 'radio' : href != null ? 'link' : 'button'}
        accessibilityLabel={accessibilityLabel}
        aria-checked={selected}
        aria-current={current || undefined}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        // One flat object: Link's asChild spreads the style, dropping an array.
        style={StyleSheet.flatten([styles.target, top && styles.topped, disabled && styles.disabled])}
      >
        {inside}
      </Pressable>
    );
    body = href != null ? (
      <Link href={href} asChild>
        {target}
      </Link>
    ) : (
      target
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        top && styles.topped,
        { minHeight: hasMeta ? TWO_LINES : ROW_MIN, paddingHorizontal: inset },
        tinted && { backgroundColor: colors.secondary },
        tint === 'hivis' && { backgroundColor: withAlpha(colors.hivis, scheme === 'dark' ? 0.12 : 0.16) },
      ]}
    >
      {pressed ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.foreground, 0.06) }]} />
      ) : null}
      <Hairline />
      {current ? <View aria-hidden pointerEvents="none" style={[styles.current, { backgroundColor: colors.foreground }]} /> : null}
      {hazardEdge ? (
        <View aria-hidden pointerEvents="none" style={styles.edge}>
          <HazardTape tone="hazard" width={4} height="100%" />
        </View>
      ) : null}
      <TintContext.Provider value={tinted}>
        {leadingOutside ? leadingSlot : null}
        {body}
        {trailingOutside ? trailingItem : null}
      </TintContext.Provider>
    </View>
  );
}

/** A row's leading icon: 24pt ink, centred in the 32pt slot, silent to a screen reader. */
export function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { colors } = useTheme();
  return <Icon size={24} color={colors.foreground} aria-hidden />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  target: {
    flex: 1,
    minWidth: 0,
    minHeight: TAP,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: SPACE.sm,
  },
  disabled: { opacity: 0.5 },
  topped: { alignItems: 'flex-start' },
  leading: { width: LEADING, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  // As tall as Meta's line, so the dot sits in the middle of the first one.
  lid: { height: 20, justifyContent: 'center' },
  metaText: { flexShrink: 1, minWidth: 0 },
  value: { flexShrink: 1, maxWidth: '60%', textAlign: 'right', ...TABULAR },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  // The open one's ink edge, as on a chosen row of an owner's table.
  current: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});
