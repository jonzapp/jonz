import { deleteChat, keepChat, listChats, loadChat, type ChatStore } from '@/api/ask-chats';
import { askChatsKey } from '@/hooks/keys';

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
