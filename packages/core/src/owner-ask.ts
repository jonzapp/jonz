import type { Words } from "./words-for";
import { z } from "zod";

import { ChatAsk, ChatMessage, CHAT_MAX_MESSAGES } from "./house-draft";
import { OwnerMove, OWNER_MOVES_MAX } from "./owner-moves";

// The owner's Ask Jonz in /admin (docs/specs/owner-admin.md, "Ask Jonz,
// owner"): the same chat as a housemate's, with its own address, tools,
// instructions and history. It reads what the admin pages read, as the
// owner's own session with their code, and puts anything to do on a card
// (owner-moves.ts): nothing changes until the owner taps it.

/** Questions the owner can ask in a day: plenty for a day's work, few enough that a stuck script can't run up a bill. */
export const OWNER_ASK_TURNS_PER_DAY = 200;

/** ask_owner on /v1: the chat so far, ending with what the owner just asked. */
export const OwnerAskRequest = z.object({
  messages: z
    .array(ChatMessage)
    .min(1)
    .max(CHAT_MAX_MESSAGES)
    .refine((m) => m.at(-1)?.role === "user", "The chat has to end with what you said."),
});
export type OwnerAskRequest = z.infer<typeof OwnerAskRequest>;

/** Jonz's answer to the owner: what it says, what it asks (if anything) and what it put on the card. `source` is "offline" when Claude wasn't there. */
export const OwnerAskResponse = z.object({
  reply: z.string(),
  ask: ChatAsk.nullable(),
  moves: z.array(OwnerMove).max(OWNER_MOVES_MAX).optional(),
  source: z.enum(["ai", "offline"]),
});
export type OwnerAskResponse = z.infer<typeof OwnerAskResponse>;

/** What Ask Jonz is doing while it answers the owner, one after another. */
export function ownerAskThinking(words: Words): string[] {
  return [words("admin.ask.thinkingSteps.read"), words("admin.ask.thinkingSteps.look"), words("admin.ask.thinkingSteps.write")];
}
