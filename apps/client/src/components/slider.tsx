import { useRef } from 'react';
import { Platform, StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type HostInstance } from 'react-native';

import { FieldLabel } from '@/components/field';
import { RING_PART, RING_PART_SHOWN } from '@/components/focus-rings';
import { measureBox } from '@/components/measure-box';
import { Body, Meta } from '@/components/text';
import { FONT, MARK_GAP, SPACE, TABULAR, TAP, useTheme } from '@/theme';

/** The knob's size, how far Page Up and Page Down move it, and how wide a mark's number may be. */
const KNOB = SPACE.xl;
const PAGE = 5;
const MARK = SPACE.xxl;

/** What a key moves the value by, or to: an arrow one step, Page Up and Page Down five, Home and End to either end. */
function keyTo(key: string, value: number, ends: { min: number; max: number }): number | null {
  const by: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: PAGE, PageDown: -PAGE };
  if (key in by) return value + by[key]!;
  if (key === 'Home') return ends.min;
  if (key === 'End') return ends.max;
  return null;
}

/**
 * Drag to set a whole number (shadcn's Slider): a John's effort on a
 * laptop, where a pointer can drag it. Its name over it with the value in
 * words at the end (`shown`), then the grey track with the ink part up to
 * the knob, then `marks` under it at their places. Drag the knob, click
 * the track, or use the arrows (Page Up and Down by five, Home and End to
 * the ends); the knob wears the focus ring when the keyboard reaches it.
 * A screen reader hears a slider named `label` at `shown`, which swiping
 * up and down changes.
 */
export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  shown,
  marks = [],
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  shown: string;
  marks?: readonly number[];
  testID?: string;
}) {
  const { colors } = useTheme();
  const track = useRef<HostInstance>(null);
  const part = (Math.min(max, Math.max(min, value)) - min) / (max - min);
  const set = (next: number) => {
    const v = Math.min(max, Math.max(min, Math.round(next)));
    if (v !== value) onChange(v);
  };
  // Where the pointer is along the track, as a value.
  const follow = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX;
    measureBox(track, ({ x, width }) => {
      if (width > 0) set(min + ((pageX - x) / width) * (max - min));
    });
  };
  const onKey = (event: { key: string; preventDefault: () => void }) => {
    const to = keyTo(event.key, value, { min, max });
    if (to === null) return;
    event.preventDefault();
    set(to);
  };
  const onAction = (event: AccessibilityActionEvent) => set(value + (event.nativeEvent.actionName === 'increment' ? 1 : -1));
  return (
    <View style={styles.slider} testID={testID}>
      <View style={styles.head}>
        <FieldLabel>{label}</FieldLabel>
        <Body style={[styles.shown, TABULAR]}>{shown}</Body>
      </View>
      <View
        accessible
        focusable
        role="slider"
        accessibilityLabel={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={shown}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={follow}
        onResponderMove={follow}
        {...(Platform.OS === 'web' ? ({ onKeyDown: onKey, dataSet: RING_PART } as object) : {})}
        style={styles.hit}
        testID={testID ? `${testID}-track` : undefined}
      >
        <View ref={track} style={[styles.track, { backgroundColor: colors.secondary }]}>
          <View style={[styles.fill, { width: `${part * 100}%`, backgroundColor: colors.foreground }]} testID={testID ? `${testID}-fill` : undefined} />
          <View
            {...(Platform.OS === 'web' ? ({ dataSet: RING_PART_SHOWN } as object) : {})}
            style={[styles.knob, { left: `${part * 100}%`, backgroundColor: colors.card, borderColor: colors.foreground }]}
          />
        </View>
      </View>
      {marks.length > 0 ? (
        <View aria-hidden style={styles.marks}>
          {marks.map((mark) => {
            const at = (mark - min) / (max - min);
            const align = at <= 0 ? ENDS.start : at >= 1 ? ENDS.end : ENDS.middle;
            return (
              <View key={mark} style={[styles.mark, align.box, { left: `${at * 100}%` }]}>
                <Meta style={[TABULAR, align.words]}>{String(mark)}</Meta>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { gap: SPACE.xs },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.sm },
  shown: { fontFamily: FONT.bold },
  // A thumb tall to grab, the track inset by half a knob so the knob stays inside at either end.
  hit: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: KNOB / 2, cursor: 'pointer', userSelect: 'none' },
  track: { height: MARK_GAP, borderRadius: MARK_GAP / 2 },
  fill: { height: MARK_GAP, borderRadius: MARK_GAP / 2 },
  knob: { position: 'absolute', top: (MARK_GAP - KNOB) / 2, width: KNOB, height: KNOB, marginLeft: -KNOB / 2, borderRadius: KNOB / 2, borderWidth: 2 },
  // The numbers under their places on the track, the ends' kept inside it.
  marks: { height: SPACE.lg, marginHorizontal: KNOB / 2 },
  mark: { position: 'absolute', top: 0, width: MARK },
  startWords: { textAlign: 'left' },
  middleBox: { marginLeft: -MARK / 2 },
  middleWords: { textAlign: 'center' },
  endBox: { marginLeft: -MARK },
  endWords: { textAlign: 'right' },
});

/** A mark's number starts at its place at the low end, ends there at the high end, and is centred on it between. */
const ENDS = {
  start: { box: null, words: styles.startWords },
  middle: { box: styles.middleBox, words: styles.middleWords },
  end: { box: styles.endBox, words: styles.endWords },
};
