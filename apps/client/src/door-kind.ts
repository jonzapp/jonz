import { kindParam, type HouseKind } from '@app/core';

import { authStorage } from '@/api/storage';

/** Where the front door's Housemates / Family choice is kept on this device. */
const KEY = 'jonz.door-kind';

/**
 * The front door's last choice on this device, so Start a house opens with
 * it already picked. Null when nothing was chosen, or storage can't be read
 * (a private window): the door then shows housemates.
 */
export function rememberedKind(): HouseKind | null {
  try {
    return kindParam(authStorage?.getItem(KEY));
  } catch {
    return null;
  }
}

/** Keep the front door's choice; a device that can't store it simply forgets. */
export function rememberKind(kind: HouseKind): void {
  try {
    authStorage?.setItem(KEY, kind);
  } catch {
    // Nothing to do: the choice is a convenience.
  }
}
