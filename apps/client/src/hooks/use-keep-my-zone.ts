import { useEffect } from 'react';

import { loadPrefs, savePrefs } from '@/api/notification-prefs';
import { deviceTimeZone } from '@/locale';

/**
 * Keeps the zone your pushes are said in, and your quiet hours kept, as
 * this phone's (notification_prefs.timezone, docs/specs/time-zones.md):
 * once each time the house opens, if the phone has moved zones since it
 * was saved, your settings are saved again as they are, from here. Quiet
 * from 22:00 stays 22:00 on the clock you're reading.
 */
export function useKeepMyZone(userId: string): void {
  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const prefs = await loadPrefs(userId);
        if (!gone && prefs.timezone !== deviceTimeZone()) await savePrefs(userId, prefs);
      } catch {
        // Tried again the next time the house opens; until then pushes keep the zone saved last.
      }
    })();
    return () => {
      gone = true;
    };
  }, [userId]);
}
