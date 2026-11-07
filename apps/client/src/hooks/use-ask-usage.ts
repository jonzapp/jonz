import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AskUsage } from '@app/core';

import { askUsageOf } from '@/api/draft';
import { askUsageKey } from '@/hooks/keys';

/**
 * The week's Ask Jonz (POST /api/ask/usage): read when the chat or the
 * usage page opens, and set from each answer in the chat (`put`), which
 * says what's left after it. While it can't be read, nothing warns.
 */
export function useAskUsage(houseId: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: askUsageKey(houseId), queryFn: () => askUsageOf(houseId), retry: 1 });
  const put = (usage: AskUsage) => client.setQueryData(askUsageKey(houseId), usage);
  return { ...query, put };
}
