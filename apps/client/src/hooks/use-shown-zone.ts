import { deviceTimeZone } from '@/locale';

/**
 * The zone a screen says times in: always this phone's own, with nothing
 * saying so (docs/specs/time-zones.md). Weeks, days and due times are still
 * set in the house's zone (`rules.timezone`); this only says a moment, so
 * someone away from home reads "due today 15:00" on their own clock.
 */
export function useShownZone(): string {
  return deviceTimeZone();
}
