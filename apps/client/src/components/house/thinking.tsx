import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Meta } from '@/components/text';
import { GROUP_RADIUS, INSET, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** How long each of Jonz's steps shows while it thinks, before the next. */
const STEP_MS = 1300;
/** One square's fill, in and out, and the gap before the next square starts. */
const FILL_MS = 300;
const HOLD_MS = 450;
const STAGGER_MS = 250;
const SQUARES = 3;
/** The loop's length, the same for every square so they stay in step. */
const CYCLE_MS = 2 * FILL_MS + 2 * HOLD_MS + (SQUARES - 1) * STAGGER_MS;
/** The tick's square, drawn small: TickBox's corner and thick edge. */
const SQUARE = 12;
const CORNER = 3;
const EDGE = 2.5;
const NATIVE = Platform.OS !== 'web';

/** The steps shown by the time an answer took `ms`: at least the first, at most all of them. */
export function stepsShown(steps: readonly string[], ms: number): string[] {
  return steps.slice(0, Math.min(steps.length, Math.floor(ms / STEP_MS) + 1));
}

/** Whether the phone asks for less motion: the squares then sit still and the words don't pulse. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * Jonz working out its answer: three of the tick's small square plates
 * filling with ink one after another, beside the step it's on, which pulses
 * gently and moves on every STEP_MS, holding at the last. Ink, never amber.
 * A screen reader hears "Jonz is thinking…" once, not every step.
 */
export function Thinking({ steps }: { steps: readonly string[] }) {
  const words = useWords();
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [at, setAt] = useState(0);
  const [fills] = useState(() => Array.from({ length: SQUARES }, () => new Animated.Value(0)));
  const [glow] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (at >= steps.length - 1) return;
    const timer = setTimeout(() => setAt((was) => was + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [at, steps.length]);

  useEffect(() => {
    if (reduce) {
      fills.forEach((f, i) => f.setValue(i === 0 ? 1 : 0));
      glow.setValue(1);
      return;
    }
    const fade = (value: Animated.Value, to: number) =>
      Animated.timing(value, { toValue: to, duration: FILL_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE });
    const loops = fills.map((f, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER_MS),
          fade(f, 1),
          Animated.delay(HOLD_MS),
          fade(f, 0),
          Animated.delay(CYCLE_MS - i * STAGGER_MS - 2 * FILL_MS - HOLD_MS),
        ]),
      ),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loops.forEach((l) => l.start());
    pulse.start();
    return () => {
      loops.forEach((l) => l.stop());
      pulse.stop();
    };
  }, [reduce, fills, glow]);

  return (
    <View
      accessible
      accessibilityLabel={words('ask.draft.thinking')}
      accessibilityLiveRegion="polite"
      aria-busy
      style={styles.thinking}
      testID="chat-thinking"
    >
      <View style={styles.squares} aria-hidden>
        {fills.map((fill, i) => (
          <View key={i} style={[styles.square, { borderColor: colors.mutedForeground }]}>
            <Animated.View style={[styles.fill, { backgroundColor: colors.foreground, opacity: fill }]} />
          </View>
        ))}
      </View>
      <Animated.View style={[styles.step, { opacity: glow }]} aria-hidden>
        <Meta numberOfLines={1} testID="chat-thinking-step">
          {steps[at]}
        </Meta>
      </Animated.View>
    </View>
  );
}

/**
 * Over Jonz's answer, folded: how long it thought. A tap opens the steps it
 * got through, each ticked, on a card; tapped again, it folds away.
 */
export function ThoughtFold({ seconds, steps }: { seconds: number; steps: readonly string[] }) {
  const words = useWords();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <View style={styles.fold}>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((was) => !was)}
        hitSlop={SPACE.md}
        style={({ pressed }) => [styles.foldHead, pressed && { opacity: 0.6 }]}
        testID="chat-thought"
      >
        <Meta>{words('ask.draft.thought', { seconds })}</Meta>
        <Chevron size={16} color={colors.mutedForeground} aria-hidden />
      </Pressable>
      {open ? (
        <View style={[styles.steps, { backgroundColor: colors.card }]} testID="chat-thought-steps">
          {steps.map((step) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.square, styles.done, { borderColor: colors.good, backgroundColor: colors.good }]}>
                <CheckIcon size={8} strokeWidth={4} color={colors.card} aria-hidden />
              </View>
              <Meta>{step}</Meta>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thinking: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 2, minHeight: 24 },
  squares: { flexDirection: 'row', gap: SPACE.xs },
  square: { width: SQUARE, height: SQUARE, borderWidth: EDGE, borderRadius: CORNER },
  // The ink covers the edge too, so a filled square is one solid plate.
  fill: { position: 'absolute', top: -EDGE, left: -EDGE, right: -EDGE, bottom: -EDGE, borderRadius: CORNER },
  step: { flexShrink: 1 },
  fold: { gap: SPACE.sm },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start' },
  steps: { borderRadius: GROUP_RADIUS, paddingHorizontal: INSET - 2, paddingVertical: SPACE.sm + 2, gap: SPACE.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 2 },
  done: { width: SQUARE + 2, height: SQUARE + 2, alignItems: 'center', justifyContent: 'center' },
});
