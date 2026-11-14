import { useQuery } from '@tanstack/react-query';

import { timeZones } from '@/api/time-zones';
import { timeZonesKey } from '@/hooks/keys';

/** The zones a house can be set to, read once: the list changes only when the database's tzdata does. */
export function useTimeZones(enabled = true) {
  return useQuery({ queryKey: timeZonesKey, queryFn: timeZones, staleTime: Infinity, gcTime: Infinity, enabled });
}
