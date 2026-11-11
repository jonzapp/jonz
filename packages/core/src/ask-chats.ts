import type { Words } from "./words-for";
import { z } from "zod";

import { dayLabel } from "./format";
import { ChatAsk } from "./house-draft";
import { addDaysTo, localDate } from "./week";

/**
 * Ask Jonz chats, kept until the person deletes them (the ask_chats table:
 * theirs alone, gone when they leave the house or delete their account).
 * A chat is kept as what it showed: what they said, Jonz's replies and
 * questions, and whether a reply had a card. A card is never kept to apply
 * later: the house may have changed since, so a reopened chat says to ask
 * again.
 */
export const SavedTurn = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), text: z.string().max(4000) }),
  z.object({
    role: z.literal("assistant"),
    text: z.string().max(20000),
    ask: ChatAsk.nullable(),
    /** The reply came with a card (changes, resets, moves). */
    hadCard: z.boolean(),
  }),
  z.object({ role: z.literal("done"), added: z.number().int().min(0) }),
]);
export type SavedTurn = z.infer<typeof SavedTurn>;

/** The most turns a chat keeps; past it, the oldest go first. */
export const CHAT_SAVED_TURNS = 200;

/** The longest a chat's title runs: two lines of a row in the 400-wide side panel, so it's never cut short on screen. */
export const CHAT_TITLE_MAX = 44;

/** A chat's title: the first thing they said, on one line, cut at a word to fit CHAT_TITLE_MAX. */
export function chatTitle(turns: readonly SavedTurn[], words: Words): string {
  const first = turns.find((t) => t.role === "user")?.text ?? "";
  const line = first.replace(/\s+/g, " ").trim();
  if (line.length <= CHAT_TITLE_MAX) return line || words('ask.chats.untitled');
  const cut = line.slice(0, CHAT_TITLE_MAX - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > CHAT_TITLE_MAX / 2 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Turns as they're kept: valid ones only, the last CHAT_SAVED_TURNS. */
export function savedTurns(raw: unknown): SavedTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    const parsed = SavedTurn.safeParse(t);
    return parsed.success ? [parsed.data] : [];
  }).slice(-CHAT_SAVED_TURNS);
}

/** When a chat was last used: "Today", "Yesterday", else "Mon 3 Nov". */
export function chatWhen(at: Date, now: Date, zone: string, words: Words): string {
  const day = localDate(at, zone);
  const today = localDate(now, zone);
  if (day === today) return words('ask.chats.today');
  if (day === addDaysTo(today, -1)) return words('ask.chats.yesterday');
  return dayLabel(at, zone, words);
}

/** Your chats in groups by when each was last used, as chat apps list them: Today, Last 7 days, Earlier. Empty groups are left out. */
export function chatGroups<T extends { updatedAt: string }>(
  chats: readonly T[],
  now: Date,
  zone: string, words: Words,
): { label: string; chats: T[] }[] {
  const today = localDate(now, zone);
  const weekAgo = addDaysTo(today, -7);
  const groups = [
    { label: words('ask.chats.today'), chats: [] as T[] },
    { label: words('ask.chats.lastWeek'), chats: [] as T[] },
    { label: words('ask.chats.earlier'), chats: [] as T[] },
  ];
  for (const chat of chats) {
    const day = localDate(new Date(chat.updatedAt), zone);
    groups[day >= today ? 0 : day > weekAgo ? 1 : 2].chats.push(chat);
  }
  return groups.filter((g) => g.chats.length > 0);
}
