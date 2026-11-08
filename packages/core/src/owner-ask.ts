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

/** POST /api/admin/ask: the chat so far, ending with what the owner just asked. */
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

export const OWNER_ASK_COPY = {
  title: "Ask Jonz",
  /** On the bar, so the owner's chat is never mistaken for a housemate's. */
  label: "Owner",
  greeting: "Ask me about anything on the admin pages, or ask me to do it: reply to a report, put up a notice, send a message, make a promotion, start or stop a deletion. Anything I’d do goes on a card first, and happens when you tap.",
  placeholder: "Ask, or say what to do…",
  send: "Send",
  box: "Ask Jonz, owner",
  offline: "I can’t reach Claude just now, so I can’t answer. Everything I’d read is on the admin pages.",
  open: "Ask Jonz, owner",
  close: "Close Ask Jonz",
  /** Under Your chats: the owner's are theirs alone, apart from every house's. */
  chatsNote: "Only you can see these chats. They’re kept until you delete them.",
  deleteBody: "It’s gone for good.",
  thinkingSteps: ["Reading the admin pages", "Looking it up", "Writing it down"],
  /** What a screen reader says for an owner's chip. */
  spoken: {
    report: (label: string) => `${label}, report`,
    audit: (label: string) => `${label}, audit entry`,
    account: (label: string) => `${label}, account`,
    admin: (label: string) => `${label}, page`,
  },
} as const;
