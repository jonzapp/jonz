import { z } from "zod";

import { ChatAsk, ChatMessage, CHAT_MAX_MESSAGES } from "./house-draft";

// The owner's Ask Jonz in /admin (docs/specs/owner-admin.md, "Ask Jonz,
// owner"): the same chat as a housemate's, with its own address, tools,
// instructions and history. It reads what the admin pages read, as the
// owner's own session with their code, and changes nothing: anything to do
// is done on the page it names.

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

/** Jonz's answer to the owner: what it says, and what it asks (if anything). `source` is "offline" when Claude wasn't there. */
export const OwnerAskResponse = z.object({
  reply: z.string(),
  ask: ChatAsk.nullable(),
  source: z.enum(["ai", "offline"]),
});
export type OwnerAskResponse = z.infer<typeof OwnerAskResponse>;

export const OWNER_ASK_COPY = {
  title: "Ask Jonz",
  label: "Owner",
  placeholder: "Ask about Jonz, the inbox, the log…",
  offline: "I can’t reach Claude just now, so I can’t answer. Everything I’d read is on the admin pages.",
} as const;
