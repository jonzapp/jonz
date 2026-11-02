import type { TourRect, TourSpotId } from '@app/core';
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, View, type HostInstance, type ScrollViewInstance } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';

/**
 * A spot a tour can light: how to find it on screen and how to bring it
 * into view. One id can be on screen more than once at a time (the title
 * bar's question mark is on every tab, the hidden ones too), so the tour
 * asks each and takes one that's showing.
 */
export interface SpotHandle {
  /** Where it is in the window, or null when it isn't showing (a tab out of view, nothing laid out). */
  measure: () => Promise<TourRect | null>;
  /** Scrolls the page it's on until it's in view. */
  reveal: () => void;
}

/** Where spots sign in: the tour player keeps them. */
export interface SpotRegistry {
  add: (id: TourSpotId, handle: SpotHandle) => () => void;
}
export const SpotRegistryContext = createContext<SpotRegistry | null>(null);

/**
 * The scroll a spot sits in, for bringing it into view on a phone: a
 * Screen's page, or one of its two columns. On the web the browser scrolls
 * whatever holds it.
 */
export const TourScrollContext = createContext<RefObject<ScrollViewInstance | null> | null>(null);

/** Under the title bar, a revealed spot keeps this much of the page above it. */
const REVEAL_ABOVE = 96;

/**
 * Tags a piece of the page as a spot that tours can light (`id` from
 * TOUR_SPOTS in @app/core). It draws nothing of its own: a View around the
 * children that a tour can measure. Outside a house's screens (no tour
 * player), it's only that View. A tab you've been to stays drawn behind the
 * one showing (on the web, at the same place on screen), so a spot on a
 * screen that isn't the focused one says it isn't showing.
 */
export function TourSpot({ id, children }: { id: TourSpotId; children: ReactNode }) {
  const registry = useContext(SpotRegistryContext);
  const scroll = useContext(TourScrollContext);
  const navigation = useContext(NavigationContext);
  const view = useRef<HostInstance>(null);
  useEffect(
    () =>
      registry?.add(id, {
        measure: () => (navigation && !navigation.isFocused() ? Promise.resolve(null) : measure(view.current)),
        reveal: () => reveal(view.current, scroll?.current ?? null),
      }),
    [registry, id, scroll, navigation],
  );
  return (
    <View ref={view} collapsable={false} testID={`tour-spot-${id}`}>
      {children}
    </View>
  );
}

function measure(view: HostInstance | null): Promise<TourRect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x: number, y: number, width: number, height: number) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

function reveal(view: HostInstance | null, scroll: ScrollViewInstance | null) {
  if (!view) return;
  if (Platform.OS === 'web') {
    // react-native-web's View is the element itself. To the top of the page, under the title bar, as on a
    // phone: a tall spot then leaves room for the card under it, where centring it would leave none.
    (view as unknown as { scrollIntoView?: (o: ScrollIntoViewOptions) => void }).scrollIntoView?.({ block: 'start', inline: 'nearest' });
    return;
  }
  const inner = scroll?.getInnerViewRef?.() as HostInstance | null | undefined;
  if (!scroll || !inner) return;
  view.measureLayout(inner, (_x: number, y: number) => scroll.scrollTo({ y: Math.max(0, y - REVEAL_ABOVE), animated: false }));
}
