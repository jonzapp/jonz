import { useQuery } from '@tanstack/react-query';

import type { HouseSnapshot } from '@/api/board';
import { houseKey } from '@/hooks/keys';
import { useMembership } from '@/hooks/use-membership';

/**
 * Whether whoever is looking is a kid in a family, once the house has been
 * read. It reads nothing of its own: the house as House's pages read it.
 */
export function useKid(): boolean {
  const { session, house } = useMembership();
  const { data } = useQuery<HouseSnapshot>({ queryKey: houseKey(house?.id ?? ''), enabled: false });
  const me = data?.members.find((m) => m.userId === session?.user.id);
  return data?.house.kind === 'family' && me != null && me.role !== 'admin';
}
