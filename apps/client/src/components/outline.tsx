import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { Group, Hairline, useRowInset } from '@/components/group';
import {
  GROUP_RADIUS,
  INSET,
  LABEL_GAP,
  LEADING,
  OUTLINE,
  PULSE,
  PULSE_LOW,
  RADIUS,
  ROW_GAP,
  ROW_MIN,
  SECTION_GAP,
  SPACE,
  TAP,
  useTheme,
} from '@/theme';

// The outline kit (docs/style/states.md, "Waiting"): a page's or a part's
// own shape in blank while it first reads, so nothing jumps when the words
// arrive. Every bar breathes together, from one shared pulse, and holds
// still when the device asks for reduced motion. Wrap an outline in
// `Waiting` (waiting.tsx), which waits WAIT_DELAY before showing it and
// tells a screen reader what is being read; the bars themselves are hidden
// from it.

// ---------------------------------------------------------------- the pulse

const pulse = new Animated.Value(1);
// Fixed once: a value driven natively can't later be driven from JavaScript.
const NATIVE = Platform.OS !== 'web';
let breathing: Animated.CompositeAnimation | null = null;
let users = 0;
let still = false;
let listening = false;

function breathe() {
  if (breathing || still || users === 0) return;
  breathing = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: PULSE_LOW, duration: PULSE / 2, useNativeDriver: NATIVE }),
      Animated.timing(pulse, { toValue: 1, duration: PULSE / 2, useNativeDriver: NATIVE }),
    ]),
  );
  breathing.start();
}

function rest() {
  breathing?.stop();
  breathing = null;
  pulse.setValue(1);
}

function setStill(reduce: boolean) {
  still = reduce;
  if (reduce) rest();
  else breathe();
}

/** Asks once whether the device wants reduced motion, and follows any change. */
function listen() {
  if (listening) return;
  listening = true;
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', setStill);
  void AccessibilityInfo.isReduceMotionEnabled?.()
    .then(setStill)
    .catch(() => setStill(false));
}

/** The shared pulse, breathing while any outline is on screen. */
function usePulse(): Animated.Value {
  useEffect(() => {
    listen();
    users += 1;
    breathe();
    return () => {
      users -= 1;
      if (users === 0) rest();
    };
  }, []);
  return pulse;
}

/** The tint an outline is drawn in: on the card colour, or on the page's ground. */
function useFill(onCard: boolean): string {
  const { colors, scheme } = useTheme();
  // The card's own tint is too faint to see after dark, so the border colour there.
  return onCard && scheme !== 'dark' ? colors.secondary : colors.border;
}

// ---------------------------------------------------------------- the pieces

/**
 * One bar of an outline: words, a picture or a control still on their way.
 * `onCard` (the default) when it sits in a group or a card, false on the
 * bare page.
 */
export function OutlineBar({
  width,
  height = OUTLINE.line,
  radius = OUTLINE.radius,
  onCard = true,
  style,
}: {
  width: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  onCard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = usePulse();
  const fill = useFill(onCard);
  return <Animated.View aria-hidden style={[{ width, height, borderRadius: radius, backgroundColor: fill, opacity }, style]} />;
}

// Widths that vary from row to row, the same every time, so an outline looks like a list.
const TITLES: DimensionValue[] = ['58%', '44%', '66%', '50%', '38%', '61%'];
const METAS: DimensionValue[] = ['32%', '40%', '26%', '36%', '30%', '22%'];

/** What leads an outline row: an avatar's circle, a tick's or an icon's square, or nothing. */
export type OutlineLead = 'circle' | 'square' | 'none';

/**
 * A row in outline, the shape of `Row`: its leading circle or square, a
 * title and a meta line, and a short value at the end when `end`. In a
 * group it draws the hairline above itself, as a row does.
 */
export function OutlineRow({
  lead = 'circle',
  title = TITLES[0],
  meta = METAS[0],
  end = false,
}: {
  lead?: OutlineLead;
  title?: DimensionValue;
  /** The meta line's width, or null for a row with a title only. */
  meta?: DimensionValue | null;
  end?: boolean;
}) {
  const inset = useRowInset();
  return (
    <View style={[styles.row, { paddingHorizontal: inset }]}>
      <Hairline />
      {lead === 'none' ? null : <OutlineBar width={LEADING} height={LEADING} radius={lead === 'circle' ? LEADING / 2 : RADIUS} />}
      <View style={styles.words}>
        <OutlineBar width={title} height={OUTLINE.title} />
        {meta === null ? null : <OutlineBar width={meta} height={OUTLINE.meta} />}
      </View>
      {end ? <OutlineBar width={TAP - SPACE.md} height={OUTLINE.title} /> : null}
    </View>
  );
}

/** `count` outline rows, their widths varied the same way every time. */
export function OutlineRows({ count, lead = 'circle', end = false, meta = true }: { count: number; lead?: OutlineLead; end?: boolean; meta?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OutlineRow key={i} lead={lead} title={TITLES[i % TITLES.length]} meta={meta ? METAS[i % METAS.length] : null} end={end} />
      ))}
    </>
  );
}

/** A section's label in outline, for a page whose sections aren't known yet. */
export function OutlineLabel({ width = 96 }: { width?: DimensionValue }) {
  return <OutlineBar width={width} height={OUTLINE.label} onCard={false} style={styles.label} />;
}

/**
 * A section in outline: its label (the real words when they're known, as a
 * `Section` around this; a bar when `label` is true) and a group of rows.
 */
export function OutlineGroup({
  rows,
  lead = 'circle',
  end = false,
  label = true,
}: {
  rows: number;
  lead?: OutlineLead;
  end?: boolean;
  /** A bar for the section's label above the group. */
  label?: boolean;
}) {
  return (
    <View>
      {label ? <OutlineLabel /> : null}
      <Group>
        <OutlineRows count={rows} lead={lead} end={end} />
      </Group>
    </View>
  );
}

/** Lines of words in outline (a sentence, a paragraph), the last one shorter. */
export function OutlineText({ lines = 2, onCard = true }: { lines?: number; onCard?: boolean }) {
  return (
    <View style={styles.text}>
      {Array.from({ length: lines }, (_, i) => (
        <OutlineBar key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} onCard={onCard} />
      ))}
    </View>
  );
}

/** A button in outline: a thumb tall, the width of its column. */
export function OutlineButton({ onCard = false }: { onCard?: boolean }) {
  return <OutlineBar width="100%" height={TAP} radius={RADIUS} onCard={onCard} />;
}

/** A plate on the card colour (a street plate, a card) breathing with the outline. */
export function OutlinePlate({ height }: { height: number }) {
  const { colors } = useTheme();
  const opacity = usePulse();
  return <Animated.View aria-hidden style={[styles.plate, { height, backgroundColor: colors.card, opacity }]} />;
}

/**
 * A page in outline when its own shape isn't drawn yet: sections of rows,
 * `sections` rows each (three, then two, by default).
 */
export function OutlinePage({ sections = [3, 2], lead = 'circle' }: { sections?: readonly number[]; lead?: OutlineLead }) {
  return (
    <View style={styles.page}>
      {sections.map((rows, i) => (
        <OutlineGroup key={i} rows={rows} lead={lead} />
      ))}
    </View>
  );
}

/** A stack of outline pieces a page builds its own outline from, SECTION_GAP apart. */
export function OutlineStack({ children, gap = SECTION_GAP }: { children: ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: ROW_MIN, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  words: { flex: 1, minWidth: 0, gap: SPACE.sm },
  label: { marginLeft: INSET, marginBottom: LABEL_GAP + SPACE.xs },
  text: { gap: SPACE.sm, paddingVertical: SPACE.xs },
  plate: { borderRadius: GROUP_RADIUS },
  page: { gap: SECTION_GAP },
});
