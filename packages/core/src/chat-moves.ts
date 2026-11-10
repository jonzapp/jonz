import type { Words } from "./words-for";
import { z } from "zod";

import { ASK_CARD_OPERATIONS, type AskCardOperation } from "./ask-operations";
import { dateRange } from "./format";
import { AwayDraft } from "./schemas";

/**
 * Moves Ask Jonz puts on a card that aren't changes to the John list: each
 * one the person ticks and applies, done through the same calls the app's
 * own pages make, as them. Nothing happens before they tap.
 */
export const ChatMove = z.discriminatedUnion("kind", [
  /** Book time away for the person asking. */
  z.object({ kind: z.literal("away"), from: AwayDraft.shape.from, to: AwayDraft.shape.to, note: AwayDraft.shape.note }),
  /** Cancel some of their own time away, or come back early from it. */
  z.object({ kind: z.literal("cancel_away"), awayId: z.uuid(), from: AwayDraft.shape.from, to: AwayDraft.shape.to }),
  /**
   * Any other house write (ask-operations.ts): the operation and its input
   * as OPERATION_IO has it, already checked, with its title and what it
   * does in words for the card.
   */
  z.object({
    kind: z.literal("operation"),
    operation: z.enum(ASK_CARD_OPERATIONS as [AskCardOperation, ...AskCardOperation[]]),
    input: z.record(z.string(), z.json()),
    title: z.string().min(1).max(120),
    meta: z.string().max(300),
  }),
]);
export type ChatMove = z.infer<typeof ChatMove>;

/** The most moves one answer puts on a card. */
export const CHAT_MOVES_MAX = 6;

/** A move's title on its card: time away says its dates. */
export function moveTitle(m: ChatMove, words: Words): string {
  if (m.kind === "away") return words("ask.moves.awayTitle", { range: dateRange(m.from, m.to) });
  if (m.kind === "cancel_away") return words("ask.moves.cancelTitle", { range: dateRange(m.from, m.to) });
  return m.title;
}

/** The line under a move's title. */
export function moveMeta(m: ChatMove, words: Words): string {
  if (m.kind === "away") return words("ask.moves.awayMeta", { hasNote: Boolean(m.note), note: m.note ?? "" });
  if (m.kind === "cancel_away") return words("ask.moves.cancelMeta");
  return m.meta;
}
