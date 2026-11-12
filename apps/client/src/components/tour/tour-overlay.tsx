import { placeTourCard, stepCount, withAlpha, type TourRect, type TourStepSaid } from '@app/core';
import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/button';
import { TextButton } from '@/components/text-button';
import { Body, Meta, RowTitle } from '@/components/text';
import { GROUP_RADIUS, GUTTER, INSET, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** How far the lit area reaches past the spot, so its edge isn't on the spot's own. */
const AROUND = SPACE.sm;
/** The card's widest, and its height before it's been drawn. */
const CARD_MAX = 360;
const CARD_GUESS = 168;
/** The amber line round the lit spot. */
const RING = 3;

/**
 * A tour's step on screen: the window dimmed but for the spot, an amber
 * line round it, and a card beside it with the step's words and the way
 * on (Skip, Back, Next; Done on the last). Over everything, tabs included,
 * as a sheet is. Taps on the dimmed page do nothing: the tour shows the app,
 * it never asks you to use it. Escape (or a phone's back) skips; on the web
 * the arrow keys step through. While the spot is looked for only the dim
 * shows, for a moment; then the card shows anyway, inside the window,
 * so Skip and Next can always be reached.
 */
export function TourOverlay({
  step,
  index,
  total,
  rect,
  looking,
  wide,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStepSaid;
  index: number;
  total: number;
  rect: TourRect | null;
  /** Still looking for the spot: only the dim shows, for a moment, so the card doesn't jump once it's found. */
  looking: boolean;
  wide: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const words = useWords();
  const { colors, scheme } = useTheme();
  const window = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(CARD_GUESS);
  const last = index === total - 1;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onBack();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onNext, onBack]);

  // The darker of the two inks, whichever way the theme is: the page shows through, the spot stands out.
  const ink = scheme === 'dark' ? colors.background : colors.foreground;
  const shade = withAlpha(ink, scheme === 'dark' ? 0.75 : 0.6);
  const lit = rect
    ? { x: rect.x - AROUND, y: rect.y - AROUND, width: rect.width + 2 * AROUND, height: rect.height + 2 * AROUND }
    : null;
  // Once found, or once it's been looked for a moment, the card shows; with no spot, at the window's foot.
  const card =
    lit || !looking ? placeTourCard(lit, window, { width: CARD_MAX, height: cardHeight }, { gap: SPACE.md, edge: GUTTER, wide }) : null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onSkip} aria-label={words("door.tour.stepSpoken", { step: index + 1, total })}>
      <View style={StyleSheet.absoluteFill} testID="tour">
        {/* The dim, with the spot cut out of it; it takes every tap so the page under it holds still. */}
        <View aria-hidden onStartShouldSetResponder={() => true} style={StyleSheet.absoluteFill} testID="tour-scrim">
          <Svg width={window.width} height={window.height}>
            <Path d={dimWithHole(window, lit)} fill={shade} fillRule="evenodd" />
          </Svg>
        </View>
        {lit ? (
          <View
            aria-hidden
            pointerEvents="none"
            testID="tour-ring"
            style={[
              styles.ring,
              { left: lit.x, top: lit.y, width: lit.width, height: lit.height, borderColor: colors.hivis },
            ]}
          />
        ) : null}
        {card ? (
          <View
            accessibilityViewIsModal
            aria-live="polite"
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            testID="tour-card"
            style={[
              styles.card,
              {
                left: card.x,
                top: card.y,
                width: card.width,
                backgroundColor: colors.card,
                boxShadow: `0 8px 24px ${withAlpha(ink, scheme === 'dark' ? 0.5 : 0.24)}`,
              },
            ]}
          >
            <View style={styles.head}>
              <RowTitle style={styles.title}>{step.title}</RowTitle>
              <Meta testID="tour-count">{stepCount(index, total, words)}</Meta>
            </View>
            <Body testID="tour-body">{step.body}</Body>
            <View style={styles.way}>
              {last ? null : <TextButton label={words('door.tour.skip')} onPress={onSkip} testID="tour-skip" />}
              <View style={styles.space} />
              {index > 0 ? <TextButton label={words('door.tour.back')} onPress={onBack} testID="tour-back" /> : null}
              {/* eslint-disable-next-line jonz/button-in-row -- Next shares the line with Skip and Back, at the trailing edge */}
              <Button label={last ? words('door.tour.done') : words('door.tour.next')} onPress={onNext} testID="tour-next" />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** The window as one shape with the lit spot's rounded rectangle cut out of it (even-odd fill). */
function dimWithHole(window: { width: number; height: number }, hole: TourRect | null): string {
  const outer = `M0 0H${window.width}V${window.height}H0Z`;
  if (!hole) return outer;
  const r = Math.min(GROUP_RADIUS + AROUND, hole.width / 2, hole.height / 2);
  const { x, y, width: w, height: h } = hole;
  return (
    `${outer}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: RING, borderRadius: GROUP_RADIUS + AROUND },
  card: { position: 'absolute', borderRadius: GROUP_RADIUS, padding: INSET, paddingBottom: SPACE.sm, gap: SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  title: { flex: 1 },
  way: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xs },
  space: { flex: 1 },
});
