import { clocksDiffer } from '@app/core';
import { useSyncExternalStore } from 'react';

import { authStorage } from '@/api/storage';
import { deviceTimeZone } from '@/locale';

// Which clock this device reads times on when it's away from the house's
// (docs/specs/time-zones.md): its own, unless the person tapped "Show house
// time". Kept on this device like the look, so each phone remembers its own.
const KEY = 'times';

/** Times on this phone's clock (`mine`), or on the house's. */
type Showing = 'mine' | 'house';

const listeners = new Set<() => void>();
let showing: Showing | null = null;

function current(): Showing {
  if (showing === null) {
    try {
      showing = authStorage?.getItem(KEY) === 'house' ? 'house' : 'mine';
    } catch {
      showing = 'mine';
    }
  }
  return showing;
}

function choose(next: Showing) {
  showing = next;
  try {
    authStorage?.setItem(KEY, next);
  } catch {
    // Not remembered (private browsing, say); it still holds until the app closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The house's zone and this phone's, and which one a screen says times in. */
export interface Zones {
  house: string;
  phone: string;
  /** The zone to say times in: the phone's when it's away and reading its own clock, else the house's. */
  shown: string;
  /** Whether the phone's clock says another time than the house's right now. */
  away: boolean;
  showing: Showing;
  /** Read times on the other clock, on every screen, from now on. */
  flip: () => void;
}

/**
 * The zones a screen reads times in. Weeks, days and due times are set in
 * the house's zone; a time is said on the reader's own clock, unless they
 * chose house time. Only a clock that says another time counts as away, so
 * Dublin reads a London house's times as they are.
 */
export function useZones(house: string, now: Date): Zones {
  const chosen = useSyncExternalStore(subscribe, current, current);
  const phone = deviceTimeZone();
  const away = clocksDiffer(phone, house, now);
  return {
    house,
    phone,
    shown: away && chosen === 'mine' ? phone : house,
    away,
    showing: chosen,
    flip: () => choose(chosen === 'mine' ? 'house' : 'mine'),
  };
}

/** The zone a screen says times in: shorthand for `useZones(house, now).shown`. */
export function useShownZone(house: string, now: Date): string {
  return useZones(house, now).shown;
}
