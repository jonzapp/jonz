import { CHAT_MAX_MESSAGES, draftChanges, groupChanges, listAsDraft, type GroupDef, type HouseDraft, type JohnDef, type KindDef, type Words } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { keepChat, type SavedChat } from '@/api/ask-chats';
import { sendChat } from '@/api/draft';
import { stepsShown } from '@/components/house/thinking';
import { askChatsKey } from '@/hooks/keys';
import { clock, messagesOf, summedOf, toSaved, type Turn } from './setup-chat-turns';

// The setup chat's state: the draft it is working on, keeping the chat, and one question to Jonz.

const NO_KINDS: readonly KindDef[] = [];

/**
 * The draft the chat is working on. `base` is the list as the chat found
 * it: what a draft's changes are counted from. It is held while a draft is
 * open, so applying doesn't move it under the card; once a draft is applied,
 * it's the list as it now is. `keep` are the changes ticked.
 */
export function useDrafting(johns: JohnDef[], groups: GroupDef[], kinds: readonly KindDef[] = NO_KINDS) {
  const live = useMemo(() => (johns.length > 0 ? listAsDraft(johns, groups, kinds) : null), [johns, groups, kinds]);
  const [held, setHeld] = useState(live);
  const [rebase, setRebase] = useState(false);
  const base = rebase ? live : held;
  const editing = base !== null;
  const [draft, setDraft] = useState<HouseDraft | null>(base);
  const [keep, setKeep] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  /** Jonz drafted a list: every change in it starts ticked. */
  function drafted(next: HouseDraft) {
    // A new draft holds the list it was made from until it's applied.
    if (rebase) {
      setHeld(live);
      setRebase(false);
    }
    setDraft(next);
    setKeep([...draftChanges(base, next), ...groupChanges(base, next)].map((c) => c.key));
  }

  /**
   * The draft went in. A list's chat carries on from the list as it now is,
   * read again from the house. A new house's chat ends here (the deal
   * question follows), so it keeps the base it had.
   */
  function applied() {
    setDraft(null);
    if (editing) setRebase(true);
  }

  const toggle = (key: string) => setKeep((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));
  /** How many changes the draft makes to the list. */
  const changes = draft ? draftChanges(base, draft).length + groupChanges(base, draft).length : 0;
  /** What the draft's card is drawn from, but for the draft itself. */
  const card = { base, keep, open, onOpen: setOpen, onToggle: toggle };
  return { base, editing, draft, keep, card, drafted, applied, changes };
}

/**
 * Keeps the chat as it now is after each answer (and each list applied),
 * once `changed` says there's something new. Only a chat with something
 * written in it (`wrote`) is kept: a starter list tapped and kept is no chat
 * to come back to. A chat that can't be kept carries on regardless: keeping
 * is for coming back to it, never in the way of it.
 */
export function useKeptChat(houseId: string, turns: Turn[], { saved, onKept }: { saved: SavedChat | null; onKept?: (id: string) => void }) {
  const chatId = useRef(saved?.id ?? null);
  // Keeping goes one at a time, so the first answer's new row is the one the next answer updates.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const unkept = useRef(false);
  const written = useRef((saved?.turns.length ?? 0) > 0);
  const client = useQueryClient();

  useEffect(() => {
    if (!unkept.current || !written.current || turns.length === 0) return;
    unkept.current = false;
    const kept = toSaved(turns);
    queue.current = queue.current.then(async () => {
      try {
        chatId.current = await keepChat(houseId, chatId.current, kept);
        onKept?.(chatId.current);
        await client.invalidateQueries({ queryKey: askChatsKey(houseId) });
      } catch {
        // Not kept this time; the next answer tries again with the whole chat.
        unkept.current = true;
      }
    });
  }, [turns, houseId, client, onKept]);

  return {
    changed: () => {
      unkept.current = true;
    },
    wrote: () => {
      written.current = true;
    },
  };
}

/**
 * One question to Jonz: the chat so far (`turns`, ending with what was just
 * said) and the draft as it stands. Gives Jonz's turn back, with how long it
 * thought, and what's left of the week's allowance.
 */
export async function askJonz(houseId: string, turns: Turn[], at: { draft: HouseDraft | null; steps: readonly string[]; words: Words }) {
  const asked = clock();
  // Jonz reads its summary of the chat's start, then everything since (CHAT_MAX_MESSAGES at most).
  const all = messagesOf(turns);
  const earlier = summedOf(turns);
  const from = Math.max(earlier?.count ?? 0, all.length - CHAT_MAX_MESSAGES);
  const answer = await sendChat(houseId, all.slice(from), at.draft, at.words, earlier?.text ?? null);
  const took = clock() - asked;
  const thought = { seconds: Math.max(1, Math.round(took / 1000)), steps: stepsShown(at.steps, took) };
  // Jonz summed up the start this turn: the summary now stands for the messages before `from` too.
  const newly = answer.summed ? { summed: { text: answer.summed.text, count: from + answer.summed.count } } : {};
  const reply: Turn & { role: 'assistant' } = {
    role: 'assistant',
    text: answer.reply,
    ask: answer.ask,
    draft: answer.draft,
    resets: answer.resets,
    moves: answer.moves,
    thought,
    ...newly,
  };
  return { reply, allowance: answer.allowance };
}
