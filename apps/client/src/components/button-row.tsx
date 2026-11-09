import { Children, createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { BUTTON_MIN, FORM_MAX, NARROW, SPACE, WIDE } from '@/theme';

/**
 * How a Button inside a ButtonRow sits: an equal share of a line, the full
 * width of a stack, or (a button on its own in a wide column on a laptop)
 * its own width at the leading edge. `wrapped` is how a sharing button says
 * its words took more than one line, so the row stacks instead.
 */
interface RowFit {
  fit: 'share' | 'full' | 'own';
  wrapped: () => void;
  /** Whether a button in the row is busy, so the others can't be pressed. */
  busy: boolean;
  /** Whether a busy button in the row looks busy (after WAIT_DELAY), so the others go pale. */
  busyShown: boolean;
  /** How a busy button tells the row it started (true) or finished (false), and when it looks busy. */
  setBusy: (busy: boolean, shown: boolean) => void;
}

const RowFitContext = createContext<RowFit | null>(null);

/** For `Button`: whether it sits in a ButtonRow, and how. */
export function useRowFit(): RowFit | null {
  return useContext(RowFitContext);
}

/**
 * Where every Button sits. A button on its own (Deal week 1, Copy key, Try
 * again) fills its column: on a phone always, and on a laptop too inside a
 * card, a sheet, a form or a side panel. One on the bare page (`atEdge`:
 * an empty page's action, Re-deal under the list, Try again) keeps its own
 * width at the leading edge in a laptop column wider than FORM_MAX, rather
 * than stretching across the page.
 *
 * Two or three buttons that belong together: Mark done and Photo, Approve and
 * Object, Mark fixed and Same as. They always share the line equally, never
 * sized to their words, and are always the same height. When the row is too
 * narrow for each to have BUTTON_MIN (a small phone, a narrow side panel),
 * or the window is under NARROW, or any button's words would take two
 * lines, they stack at full width, in the order
 * given: put the main action first. Never lay buttons side by side by hand
 * (the lint rule `jonz/no-hand-made-button-row` says so). While one of its
 * buttons is `busy`, the others go pale and can't be pressed.
 */
export function ButtonRow({
  children,
  stacked: stackedAlways = false,
  atEdge = false,
  testID,
}: {
  children: ReactNode;
  /** Always one under another (the front door's two ways in on a phone). */
  stacked?: boolean;
  /** A button on its own on the bare page: its own width at the leading edge of a wide laptop column. */
  atEdge?: boolean;
  testID?: string;
}) {
  const { width: window } = useWindowDimensions();
  const [width, setWidth] = useState<number | null>(null);
  // The widest the row has been while a label still wrapped: at that width
  // or narrower it stays stacked (stacked, the words fit on one line, so
  // the buttons can't be asked again without flickering).
  const [wrapsAt, setWrapsAt] = useState(0);
  const count = Children.toArray(children).filter(Boolean).length;
  const needs = count * BUTTON_MIN + (count - 1) * SPACE.sm;
  const stacked = stackedAlways || window < NARROW || (width !== null && (width < needs || width <= wrapsAt));
  // On its own: the column's width, unless it's on the bare page in a wide laptop column.
  const alone = count === 1;
  const own = alone && atEdge && window >= WIDE && (width === null || width > FORM_MAX);
  // A label can say it wrapped before the row knows its own width (children
  // are laid out first), so the news waits until the width arrives.
  const widthNow = useRef<number | null>(null);
  const wrapPending = useRef(false);
  const wrapped = useCallback(() => {
    const at = widthNow.current;
    if (at === null) wrapPending.current = true;
    else setWrapsAt((was) => Math.max(was, at));
  }, []);
  const fit = own ? 'own' : alone || stacked ? 'full' : 'share';
  // How many of its buttons are busy: while any is, the others go pale.
  const [busyCount, setBusyCount] = useState(0);
  const [shownCount, setShownCount] = useState(0);
  const setBusy = useCallback((on: boolean, shown: boolean) => {
    const step = (n: number) => Math.max(0, n + (on ? 1 : -1));
    if (shown) setShownCount(step);
    else setBusyCount(step);
  }, []);
  const busy = busyCount > 0;
  const busyShown = shownCount > 0;
  const value = useMemo<RowFit>(() => ({ fit, wrapped, busy, busyShown, setBusy }), [fit, wrapped, busy, busyShown, setBusy]);
  return (
    <RowFitContext.Provider value={value}>
      <View
        testID={testID}
        onLayout={(event) => {
          const at = event.nativeEvent.layout.width;
          widthNow.current = at;
          setWidth(at);
          if (wrapPending.current) {
            wrapPending.current = false;
            setWrapsAt((was) => Math.max(was, at));
          }
        }}
        style={own ? styles.own : fit === 'full' ? styles.stack : styles.row}
      >
        {children}
      </View>
    </RowFitContext.Provider>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: SPACE.sm },
  stack: { flexDirection: 'column', alignItems: 'stretch', gap: SPACE.sm },
  own: { flexDirection: 'column', alignItems: 'flex-start' },
});
