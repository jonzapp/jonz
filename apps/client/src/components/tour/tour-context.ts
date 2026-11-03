import type { TourFacts, TourId, ToursSaved } from '@app/core';
import { createContext, useContext } from 'react';

/** What a screen can do with tours: start one, open Help, and Today's one-time offer. */
export interface TourControls {
  start: (id: TourId) => void;
  openHelp: () => void;
  /** Whether a tour is being played (its card is up). */
  running: boolean;
  facts: TourFacts;
  saved: ToursSaved;
  /** Today offers its tour (`offersTour`): Not now marks the offer done. */
  dismissOffer: () => void;
}

export const TourContext = createContext<TourControls | null>(null);

/** The tours, for a screen inside a house (null outside, where there are none). */
export function useTour(): TourControls | null {
  return useContext(TourContext);
}

