import { CHAT_SAVED_TURNS, savedTurns, type SavedTurn } from '@app/core';

import { callV1 } from './v1';

// Ask Jonz chats, on /v1: you read, keep and delete only your own, in a
// house you're in.

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface SavedChat {
  id: string;
  title: string;
  turns: SavedTurn[];
}

/** Your chats in this house, the latest first. */
export async function listChats(houseId: string): Promise<ChatSummary[]> {
  return callV1('my_ask_chats', { houseId });
}

/** One of your chats, with its turns. */
export async function loadChat(id: string): Promise<SavedChat> {
  const chat = await callV1('my_ask_chat', { chatId: id });
  if (!chat) throw new Error('That chat isn’t there any more.');
  return { id: chat.id, title: chat.title, turns: savedTurns(chat.turns) };
}

/** Keep a chat as it now stands: a new one the first time (its id back), then the same row. */
export async function keepChat(houseId: string, id: string | null, turns: readonly SavedTurn[]): Promise<string> {
  const kept = turns.slice(-CHAT_SAVED_TURNS);
  if (id) {
    await callV1('update_ask_chat', { chatId: id, turns: kept });
    return id;
  }
  return callV1('keep_ask_chat', { houseId, turns: kept });
}

/** Delete one of your chats for good. */
export async function deleteChat(id: string): Promise<void> {
  await callV1('delete_ask_chat', { chatId: id });
}

/**
 * Where a chat's history is kept, so the same pieces (Your chats, keeping
 * after each answer) serve a housemate's Ask Jonz and the owner's: `key` is
 * its list's cache key.
 */
export interface ChatStore {
  key: readonly unknown[];
  list: () => Promise<ChatSummary[]>;
  load: (id: string) => Promise<SavedChat>;
  keep: (id: string | null, turns: readonly SavedTurn[]) => Promise<string>;
  remove: (id: string) => Promise<void>;
}
