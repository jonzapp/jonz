import { useQuery } from '@tanstack/react-query';

import { listChats } from '@/api/ask-chats';
import { askChatsKey } from '@/hooks/keys';

/** Your Ask Jonz chats in this house, the latest first (Ask Jonz's start and Your chats). */
export function useAskChats(houseId: string) {
  return useQuery({ queryKey: askChatsKey(houseId), queryFn: () => listChats(houseId) });
}
