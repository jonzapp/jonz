import { useQuery } from '@tanstack/react-query';

import { deleteChat, keepChat, listChats, loadChat, type ChatStore } from '@/api/ask-chats';
import { askChatsKey } from '@/hooks/keys';

/** Your Ask Jonz chats in this house, the latest first (Ask Jonz's start and Your chats). */
export function useAskChats(houseId: string) {
  return useQuery({ queryKey: askChatsKey(houseId), queryFn: () => listChats(houseId) });
}

/** A housemate's chats in one house (ask_chats), for the pieces Ask Jonz shares with the owner's. */
export function houseChats(houseId: string): ChatStore {
  return {
    key: askChatsKey(houseId),
    list: () => listChats(houseId),
    load: loadChat,
    keep: (id, turns) => keepChat(houseId, id, turns),
    remove: deleteChat,
  };
}
