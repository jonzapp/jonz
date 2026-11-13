import { useQuery } from '@tanstack/react-query';

import type { HouseSnapshot } from '@/api/board';
import { loadPocket } from '@/api/pocket';
import { pocketKey } from '@/hooks/keys';

/** The kids of a family: everyone who isn't a parent. */
function kidsOf(snapshot: HouseSnapshot): string[] {
  return snapshot.members.filter((m) => m.role !== 'admin').map((m) => m.userId);
}

/** A family's pocket money, once the house has been read; nothing for housemates. */
export function usePocket(houseId: string, snapshot: HouseSnapshot | undefined) {
  return useQuery({
    queryKey: pocketKey(houseId),
    queryFn: () => loadPocket(houseId, snapshot!.rules.timezone, kidsOf(snapshot!), new Date()),
    enabled: snapshot !== undefined && snapshot.house.kind === 'family',
  });
}
