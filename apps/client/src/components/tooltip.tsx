import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View, type HostInstance } from 'react-native';

import { measureBox } from '@/components/measure-box';
import { floatShadow, FONT, MARK_RADIUS, SPACE, useTheme } from '@/theme';

/** How long the mouse rests on an icon before its name shows. */
export const TIP_DELAY = 500;

/** Which way the label runs from the control's edge: from its left (`start`) or back from its right (`end`). */
type Side = 'start' | 'end';

/** What a control with a tooltip hands it: its box, and its own hover and press state to keep. */
export interface TipControl {
  on: boolean;
  box: RefObject<HostInstance | null>;
  hovered: (on: boolean) => void;
  pressed: (on: boolean) => void;
}

/**
 * A Tooltip (shadcn's): an icon-only control's name in a small ink label
 * under it, once the mouse has rested on it for TIP_DELAY or straight away
 * when the keyboard lands on it. On the web only, where there's a mouse and
 * a keyboard: a phone's screen reader already says the name, and a finger
 * has no hover. The label runs toward the middle of the window, so it never
 * runs off the side. It's aria-hidden, so a screen reader hears the name
 * once. Leaving, pressing or tabbing away puts it away. `on` is false for a
 * control that shows its words. Gives the control's press, hover and focus
 * handlers, and the label to draw inside it.
 */
export function useTooltip(label: string, control: TipControl) {
  const { on, box, hovered, pressed } = control;
  const win = useWindowDimensions();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const live = on && Platform.OS === 'web';
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const show = () => measureBox(box, ({ x, width }) => setSide(x + width / 2 > win.width / 2 ? 'end' : 'start'));
  const hide = () => {
    stop();
    setSide(null);
  };
  const handlers = {
    onPressIn: () => {
      pressed(true);
      hide();
    },
    onPressOut: () => pressed(false),
    onHoverIn: () => {
      hovered(true);
      if (!live) return;
      stop();
      timer.current = setTimeout(show, TIP_DELAY);
    },
    onHoverOut: () => {
      hovered(false);
      hide();
    },
    onFocus: (event: unknown) => {
      if (live && fromKeyboard(event)) show();
    },
    onBlur: hide,
  };
  return { handlers, tip: side ? <Tip text={label} side={side} /> : null };
}

/** Whether focus came from the keyboard (the browser's :focus-visible), not a click. */
function fromKeyboard(event: unknown): boolean {
  const target = (event as { nativeEvent?: { target?: { matches?: (query: string) => boolean } } }).nativeEvent?.target;
  try {
    return target?.matches?.(':focus-visible') === true;
  } catch {
    return false;
  }
}

/** The label: the name in bold on ink, lifted as floating things are, under the control. */
function Tip({ text, side }: { text: string; side: Side }) {
  const { colors, scheme, type } = useTheme();
  return (
    <View
      aria-hidden
      pointerEvents="none"
      testID="tooltip"
      style={[styles.tip, side === 'end' ? styles.end : styles.start, { backgroundColor: colors.foreground, boxShadow: floatShadow(colors, scheme) }]}
    >
      <Text numberOfLines={1} style={[type.meta, styles.words, { color: colors.background }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    top: '100%',
    marginTop: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs / 2,
    borderRadius: MARK_RADIUS * 2,
    zIndex: 10,
  },
  start: { left: 0 },
  end: { right: 0 },
  words: { fontFamily: FONT.bold },
});
