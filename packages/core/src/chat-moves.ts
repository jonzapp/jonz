import { z } from "zod";

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
]);
export type ChatMove = z.infer<typeof ChatMove>;

/** The most moves one answer puts on a card. */
export const CHAT_MOVES_MAX = 6;

export const CHAT_MOVES_COPY = {
  card: "Your time away",
  cardMeta: "Ticked ones happen when you tap",
  title: (m: ChatMove) => (m.kind === "away" ? `Away ${dateRange(m.from, m.to)}` : `Cancel time away ${dateRange(m.from, m.to)}`),
  meta: (m: ChatMove) =>
    m.kind === "away"
      ? `${m.note ? `${m.note}. ` : ""}No Johns due while you’re gone; any you have then are due before you go.`
      : "The Johns it moved go back to when they were due.",
  apply: (n: number) => (n === 0 ? "Pick at least one" : n === 1 ? "Do 1 thing" : `Do ${n} things`),
  applying: "Doing it…",
  done: (n: number) => (n === 1 ? "Done." : `All ${n} done.`),
} as const;
