import type { MyPrefs } from '@app/core';

import { callV1 } from './v1';

// Your preferences in a house: days that suit you, your best time, and the
// Johns you'd rather do or not (members.suits_days, best_time, rather).
// save_prefs keeps only real days and this house's own Johns.

/** Save them all at once. */
export async function saveMyPrefs(houseId: string, prefs: MyPrefs): Promise<void> {
  await callV1('save_prefs', { houseId, days: prefs.days, bestTime: prefs.bestTime, rather: prefs.rather });
}
