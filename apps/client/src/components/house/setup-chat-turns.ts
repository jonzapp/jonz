import {
  chatCarryOver,
  weeklyEffort,
  type ChatAsk,
  type ChatMessage,
  type ChatMove,
  type ChatReset,
  type ChatSummed,
  type DraftChange,
  type DraftedJohn,
  type HouseDraft,
  type SavedTurn,
  type Words,
} from '@app/core';
import { type ReactNode } from 'react';


// The setup chat's turns: what is kept, sent and carried over, and what a draft comes to.

export type Person = { userId: string; name: string };

/**
 * One line of the chat: what the admin said, what Jonz said back (with a
 * question to tap an answer to, the draft when that turn changed it, and
 * any resets it offers an admin), or the Johns being added.
 */
export type Turn =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      ask: ChatAsk | null;
      draft: HouseDraft | null;
      resets?: ChatReset[];
      /** Other moves Jonz put on a card (time away). */
      moves?: ChatMove[];
      /** How long Jonz thought, and the steps it showed meanwhile; a starter list has none. */
      thought?: { seconds: number; steps: string[] };
      /** A reply from a chat kept earlier that had a card then: the card isn't kept, so it says to ask again. */
      old?: boolean;
      /** Before this reply Jonz summed up the chat's start (SavedTurn's `summed`). */
      summed?: ChatSummed;
    }
  | { role: 'done'; added: number };

/** A kept chat's turns as the chat shows them: no card comes back, only that there was one. */
export function fromSaved(saved: readonly SavedTurn[]): Turn[] {
  return saved.map((t) =>
    t.role === 'assistant' ? { role: 'assistant', text: t.text, ask: t.ask, draft: null, old: t.hadCard, ...(t.summed ? { summed: t.summed } : {}) } : t,
  );
}

/** The chat's turns as they're kept: what was said, and whether a reply had a card. */
export function toSaved(turns: readonly Turn[]): SavedTurn[] {
  return turns.map((t) =>
    t.role === 'assistant'
      ? {
          role: 'assistant',
          text: t.text,
          ask: t.ask,
          hadCard: Boolean(t.old || t.draft || t.resets?.length || t.moves?.length),
          ...(t.summed ? { summed: t.summed } : {}),
        }
      : t,
  );
}

/** The chat as messages: what was said and Jonz's replies with words, oldest first. */
export function messagesOf(turns: readonly Turn[]): ChatMessage[] {
  return turns.flatMap((t) => (t.role === 'done' || !t.text ? [] : [{ role: t.role, text: t.text }]));
}

/** Jonz's latest summary of the chat's start, if it has one. */
export function summedOf(turns: readonly Turn[]): ChatSummed | null {
  for (let at = turns.length - 1; at >= 0; at--) {
    const t = turns[at];
    if (t.role === 'assistant' && t.summed) return t.summed;
  }
  return null;
}

/** The turn the latest summary's line goes over: the first one it doesn't stand for. -1 for none. */
export function summedTurn(turns: readonly Turn[], summed: ChatSummed | null): number {
  if (!summed) return -1;
  if (summed.count === 0) return 0;
  let seen = 0;
  for (let at = 0; at < turns.length; at++) {
    const t = turns[at];
    if (t.role === 'done' || !t.text) continue;
    if (seen === summed.count) return at;
    seen++;
  }
  return -1;
}

/**
 * A new chat that carries on from a full one: it opens with the line from
 * the last chat, holding its summary and what was said since.
 */
export function carriedChat(turns: readonly Turn[], words: Words): SavedTurn[] {
  const summed = summedOf(turns);
  const since = messagesOf(turns).slice(summed?.count ?? 0);
  const text = chatCarryOver(summed?.text ?? null, since, { you: words('ask.long.you'), jonz: words('ask.long.jonz') });
  return text ? [{ role: 'assistant', text: '', ask: null, hadCard: false, summed: { text, count: 0 } }] : [];
}

/** The chat's turns drawn, with `line` over the one at `at` (none when it's -1). */
export function withLine(views: ReactNode[], at: number, line: ReactNode): ReactNode[] {
  return at < 0 || !line ? views : [...views.slice(0, at), line, ...views.slice(at)];
}

/** The time, for how long Jonz thought: read in a send, never while drawing. */
export const clock = () => Date.now();

/** How many of a new house's drafted Johns show before "See all". */
export const FOLDED = 3;
/** How many changes to a list show before "See all": most asks are a few, and all of them show. */
export const CHANGES_FOLDED = 6;

/** The card's sections, in the order it shows them: what goes first, so it's never missed. */
export const KINDS = ['remove', 'change', 'add'] as const;


/** Roughly how many points a week Johns come to: one due every few weeks or months counts its share, one on call as often as it comes up. */
export function pointsAWeek(johns: readonly DraftedJohn[]): number {
  return Math.round(weeklyEffort(johns));
}

/** The list once the ticked changes are applied (an unticked change leaves its John as it was). */
export function afterApplying(base: HouseDraft | null, changes: readonly DraftChange[], keep: readonly string[]): DraftedJohn[] {
  const ticked = (c: DraftChange) => keep.includes(c.key);
  const touched = new Map(changes.flatMap((c) => (c.kind === 'remove' ? [] : [[c.john, c] as const])));
  const list = (base?.johns ?? []).filter((j) => !changes.some((c) => c.kind !== 'add' && c.before.id === j.id && ticked(c)));
  for (const [john, c] of touched) if (ticked(c)) list.push(john);
  return list;
}
