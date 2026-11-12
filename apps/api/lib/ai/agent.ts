import "server-only";

import { generateText, isStepCount, Output, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { type RawAsk } from "@app/core";
import { z } from "zod";

// Every Ask Jonz runs the same way, whoever is asking: a housemate's
// (house-draft.ts), the owner's in /admin (owner-ask.ts), or the support
// agent's on a report (support-draft.ts). Claude reads and proposes
// through the tools it's given, which already act as the person asking and
// hold only the moves they may make, then says its last word: a reply in
// Markdown (packages/core reply-format.ts) and, maybe, a question to tap an
// answer to. Each chat brings its own prompt and tools; this is the loop.

/** The model behind every Ask Jonz. */
export const AGENT_MODEL = "anthropic/claude-haiku-5.5";

/** The most tool calls and answers in one turn, so a confused model can't loop. */
export const STEPS_MAX = 12;

/**
 * Whether a turn should answer now rather than call more tools: when what
 * it has used, plus another step as big as its last, would pass `budget`.
 * Each step reads the whole chat again, so the next costs at least the last.
 */
export function shouldWrapUp(steps: readonly { usage: { inputTokens?: number; outputTokens?: number } }[], budget: number | undefined): boolean {
  if (budget === undefined || steps.length === 0) return false;
  const size = (s: (typeof steps)[number]) => (s.usage.inputTokens ?? 0) + (s.usage.outputTokens ?? 0);
  const used = steps.reduce((sum, s) => sum + size(s), 0);
  return used + size(steps[steps.length - 1]) > budget;
}

/** Jonz's last word in a turn, as Claude is asked to return it. */
export const FinalAnswer = z.object({
  reply: z.string().describe("What you say to the person."),
  ask: z.object({ kind: z.enum(["none", "choices", "day"]), options: z.array(z.string()) }),
});

export interface AgentAnswer<T = { reply: string; ask: RawAsk }> {
  raw: T;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Whether Claude is set up here: on Vercel (the gateway signs in with the
 * deployment's OIDC token) or with AI_GATEWAY_API_KEY set. Without either,
 * as locally and in CI, a chat answers without it.
 */
export function canAsk(): boolean {
  return Boolean(process.env.VERCEL || process.env.AI_GATEWAY_API_KEY);
}

/**
 * One turn: Claude with `tools` until it answers. Throws when it can't (the
 * gateway down, a refusal, a cut-off answer); the caller answers without it.
 * `model` is Claude, unless a test stands in for it.
 */
export async function runAgent<T = { reply: string; ask: RawAsk }>({
  system,
  messages,
  tools,
  model = AGENT_MODEL,
  answer,
  budget,
}: {
  /** Fixed, so it caches: who Jonz is here and how to use the tools. */
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  model?: LanguageModel;
  /** The shape of its last word, when it isn't a chat's reply and question (the support agent's suggestion). */
  answer?: { schema: z.ZodType<T>; name: string };
  /** The most tokens the turn should use (what's left of the person's Ask Jonz): near it, Claude answers without more tools. */
  budget?: number;
}): Promise<AgentAnswer<T>> {
  const result = await generateText({
    model,
    system,
    messages,
    tools,
    output: Output.object({ schema: (answer?.schema ?? FinalAnswer) as z.ZodType<T>, name: answer?.name ?? "jonz_reply" }),
    stopWhen: isStepCount(STEPS_MAX),
    // Near the budget, no more tools: Claude says its last word with what it has.
    prepareStep: ({ steps }) => (shouldWrapUp(steps, budget) ? { activeTools: [] } : undefined),
    maxOutputTokens: 4000,
    maxRetries: 1,
    timeout: 45_000,
  });
  if (result.finishReason !== "stop") throw new Error(`No answer: ${result.finishReason}`);
  return {
    raw: result.output as T,
    inputTokens: result.totalUsage.inputTokens ?? 0,
    outputTokens: result.totalUsage.outputTokens ?? 0,
  };
}
