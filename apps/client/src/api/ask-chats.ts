import { CHAT_SAVED_TURNS, chatTitle, humanError, savedTurns, type SavedTurn } from '@app/core';

import { supabase } from './supabase';

// Ask Jonz chats, through your own session: the ask_chats table lets you
// read, keep and delete only your own, in a house you're in.

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
  const { data, error } = await supabase
    .from('ask_chats')
    .select('id, title, updated_at')
    .eq('house_id', houseId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

/** One of your chats, with its turns. */
export async function loadChat(id: string): Promise<SavedChat> {
  const { data, error } = await supabase.from('ask_chats').select('id, title, turns').eq('id', id).single();
  if (error) throw new Error(humanError(error));
  return { id: data.id, title: data.title, turns: savedTurns(data.turns) };
}

/** Keep a chat as it now stands: a new one the first time (its id back), then the same row. */
export async function keepChat(houseId: string, id: string | null, turns: readonly SavedTurn[]): Promise<string> {
  const kept = turns.slice(-CHAT_SAVED_TURNS);
  const title = chatTitle(turns);
  if (id) {
    const { error } = await supabase.from('ask_chats').update({ title, turns: kept, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(humanError(error));
    return id;
  }
  const { data, error } = await supabase.from('ask_chats').insert({ house_id: houseId, title, turns: kept }).select('id').single();
  if (error) throw new Error(humanError(error));
  return data.id;
}

/** Delete one of your chats for good. */
export async function deleteChat(id: string): Promise<void> {
  const { error } = await supabase.from('ask_chats').delete().eq('id', id);
  if (error) throw new Error(humanError(error));
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
