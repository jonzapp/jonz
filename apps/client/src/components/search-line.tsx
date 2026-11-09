import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useWaitShown } from '@/hooks/use-wait-shown';
import { DIM, PULSE, SEARCH_LINE, useTheme } from '@/theme';

/**
 * The line under a list's search box (docs/style/states.md, "Waiting"):
 * while a new search or filter reads, a lit third runs along it (still and
 * whole with reduced motion). It is always there, SEARCH_LINE tall, so
 * nothing moves when it lights; it lights only after WAIT_DELAY, so a fast
 * search never flickers. Pair it with `Dimmed` round the old rows.
 */
export function SearchLine({ searching, label, testID = 'search-line' }: { searching: boolean; label: string; testID?: string }) {
  const { colors } = useTheme();
  const shown = useWaitShown(searching);
  const [width, setWidth] = useState(0);
  const [still, setStill] = useState(false);
  const [run] = useState(() => new Animated.Value(0));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!shown || still) return;
    run.setValue(0);
    const loop = Animated.loop(
      Animated.timing(run, { toValue: 1, duration: PULSE, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [shown, still, run]);

  const third = width / 3;
  return (
    <View
      testID={testID}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityLabel={shown ? label : undefined}
      aria-busy={shown}
      style={[styles.line, { backgroundColor: shown ? colors.border : 'transparent' }]}
    >
      {shown ? (
        <Animated.View
          aria-hidden
          style={[
            styles.lit,
            { backgroundColor: colors.foreground },
            still
              ? styles.whole
              : { width: third, transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-third, width] }) }] },
          ]}
        />
      ) : null}
    </View>
  );
}

/**
 * A list's old rows while a new search reads: dimmed, after WAIT_DELAY, so
 * they don't pass for the answer; you keep your place.
 */
export function Dimmed({ searching, children, testID }: { searching: boolean; children: ReactNode; testID?: string }) {
  const shown = useWaitShown(searching);
  return (
    <View testID={testID} style={shown ? styles.dim : undefined}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { height: SEARCH_LINE, overflow: 'hidden', borderRadius: SEARCH_LINE },
  lit: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  whole: { right: 0, opacity: 0.5 },
  dim: { opacity: DIM },
});
