import type { Words } from "./words-for";
import { z } from "zod";

import { REPORT_LIMITS, REPORT_STATES } from "./reports";

// The support agent (docs/specs/report-a-problem.md, "The support agent"):
// when the owner opens a report that's waiting, Jonz reads it with the
// owner's own session and suggests what to do: a reply in plain words and,
// maybe, one step (fold it into the report it repeats, or start the 30 days
// for someone who asked to be deleted). It asks before it acts: nothing is
// sent, folded or started until the owner taps, on the report itself.

/** Drafts the owner can be offered in a day: one for every report and write-back on a busy day, few enough that a stuck page can't run up a bill. */
export const SUPPORT_DRAFTS_PER_DAY = 200;

/** The one step a draft may suggest besides its reply. */
export const SUPPORT_ACTIONS = ["none", "same_as", "delete"] as const;
export type SupportAction = (typeof SUPPORT_ACTIONS)[number];

/** Where a draft has got to: Jonz still writing it, ready to look at, used, set aside, or not written. */
export const SUPPORT_DRAFT_STATES = ["drafting", "ready", "used", "dismissed", "failed"] as const;
export type SupportDraftState = (typeof SUPPORT_DRAFT_STATES)[number];

/** Why Jonz suggests it, in a sentence or two the owner reads before they tap. */
export const SUPPORT_WHY_MAX = 600;

/** One suggestion, as the Inbox shows it. */
export const SupportDraft = z.object({
  id: z.string(),
  state: z.enum(SUPPORT_DRAFT_STATES),
  /** What to say to the person, plain words, as the reply box sends them. */
  reply: z.string().max(REPORT_LIMITS.words),
  action: z.enum(SUPPORT_ACTIONS),
  /** The report this one repeats, when action is same_as. */
  sameAs: z.object({ id: z.string(), name: z.string().nullable(), words: z.string(), state: z.enum(REPORT_STATES) }).nullable(),
  /** Markdown, with the owner's chips. */
  why: z.string().max(SUPPORT_WHY_MAX),
});
export type SupportDraft = z.infer<typeof SupportDraft>;

/** claim_support_draft on /v1: the report's suggestion, written now or kept from before; null when there's none to give. */
export const SupportDraftResponse = z.object({ draft: SupportDraft.nullable() });
export type SupportDraftResponse = z.infer<typeof SupportDraftResponse>;

/**
 * Claude's suggestion, checked: the reply tidied and cut to fit, an action
 * only when it can be done (a report to fold into that isn't this one; an
 * account to delete), and "none" otherwise.
 */
export function tidySuggestion(
  raw: { reply?: unknown; action?: unknown; same_as?: unknown; why?: unknown },
  can: { sameAs: (id: string) => boolean; delete: boolean },
): { reply: string; action: SupportAction; sameAs: string | null; why: string } {
  const text = (v: unknown, max: number) =>
    typeof v === "string"
      ? v
          .replace(/\r/g, "")
          .replace(/[ \t]+/g, " ")
          .replace(/ *\n */g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, max)
          .trim()
      : "";
  const reply = text(raw.reply, REPORT_LIMITS.words);
  const why = text(raw.why, SUPPORT_WHY_MAX);
  const wanted = SUPPORT_ACTIONS.find((a) => a === raw.action) ?? "none";
  const sameAs = typeof raw.same_as === "string" ? raw.same_as.trim() : "";
  if (wanted === "same_as" && sameAs && can.sameAs(sameAs)) return { reply, action: "same_as", sameAs, why };
  if (wanted === "delete" && can.delete) return { reply, action: "delete", sameAs: null, why };
  return { reply, action: "none", sameAs: null, why };
}

/** What the support draft is doing while it writes, one after another. */
export function supportThinking(words: Words): string[] {
  return [words("admin.support.thinkingSteps.read"), words("admin.support.thinkingSteps.look"), words("admin.support.thinkingSteps.write")];
}
