/**
 * React Query's cache keys. Everything a house's screens read sits under
 * `houseKey(id)`, so reading the house again after a move or a Realtime
 * change (an invalidation of that key) refreshes all of it, the Wall too.
 */
export const houseKey = (houseId: string) => ['house', houseId] as const;

/** The Wall's events, under the house. */
export const wallKey = (houseId: string) => [...houseKey(houseId), 'wall'] as const;

/** One receipt's signed link, under the house. */
export const photoKey = (houseId: string, path: string) => [...houseKey(houseId), 'photo', path] as const;

/** The month's Table and the fair shares, under the house. */
export const tableKey = (houseId: string) => [...houseKey(houseId), 'table'] as const;

/** The Stake, under the house. */
export const stakeKey = (houseId: string) => [...houseKey(houseId), 'stake'] as const;

/** The John list and the groups, under the house. */
export const listKey = (houseId: string) => [...houseKey(houseId), 'list'] as const;

/** The house's time away, under the house. */
export const awayKey = (houseId: string) => [...houseKey(houseId), 'away'] as const;
export const recordKey = (houseId: string) => [...houseKey(houseId), 'record'] as const;

/** History, under the house: any move reads it again. */
export const historyKey = (houseId: string) => [...houseKey(houseId), 'history'] as const;

/** The house you just left, while it can come with you (the Moving on screen). Yours, not a house's. */
export const movingOnKey = (userId: string) => ['moving-on', userId] as const;

/** A family's pocket money, under the house: a tick standing or Paid reads it again. */
export const pocketKey = (houseId: string) => [...houseKey(houseId), 'pocket'] as const;

/** The week's Ask Jonz: what's left, who used it, when it's back. */
export const askUsageKey = (houseId: string) => [...houseKey(houseId), 'ask-usage'] as const;
export const askChatsKey = (houseId: string) => [...houseKey(houseId), 'ask-chats'] as const;
