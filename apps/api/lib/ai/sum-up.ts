import "server-only";

import { generateText, type LanguageModel } from "ai";
import { SUMMARY_MAX, type ChatMessage } from "@app/core";

import { AGENT_MODEL } from "@/lib/ai/agent";

// A long Ask Jonz chat carries on from a summary of its start
// (packages/core house-draft.ts, CHAT_SUM_AT): this writes it.

/** What a summary costs at most to write, so summing up never costs more than a short turn. */
const SUM_UP_TOKENS = 700;

const SYSTEM = `You keep notes on a chat between a person and Jonz, the assistant in a chores app for a shared house (a chore is called a John).
Write what Jonz needs to carry on the chat without the messages themselves: the facts the person gave about the house and its people, what was decided or changed, and anything still open or asked for.
- A short list, one point a line starting "- ", at most 12 points and 150 words.
- Keep names, numbers, days and times exactly. Leave out greetings and anything Jonz only explained.
- When there are notes already, fold them in: one list, newest facts winning.
- Write in the language given. Only the list: no heading, no preamble.`;

export interface SumUp {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** A chat's start summed up, with the summary it had before (if any), in `language` (its English name). */
export type SumUpChat = (summary: string | null, messages: readonly ChatMessage[], language: string) => Promise<SumUp>;

/** The messages as the notes' writer reads them: the notes so far, then the chat a line each. */
export function sumUpPrompt(summary: string | null, messages: readonly ChatMessage[], language: string): string {
  const chat = messages.map((m) => `${m.role === "user" ? "Person" : "Jonz"}: ${m.text}`).join("\n");
  return [`Language: ${language}`, summary ? `<notes>\n${summary}\n</notes>` : null, `<chat>\n${chat}\n</chat>`].filter(Boolean).join("\n\n");
}

/** Claude writes the summary. Throws when it can't; the chat then carries on with its latest messages only. */
export const sumUpChat: SumUpChat = async (summary, messages, language, model: LanguageModel = AGENT_MODEL) => {
  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: sumUpPrompt(summary, messages, language),
    maxOutputTokens: SUM_UP_TOKENS,
    maxRetries: 1,
    timeout: 20_000,
  });
  const text = result.text.trim().slice(0, SUMMARY_MAX);
  if (result.finishReason !== "stop" || !text) throw new Error(`No summary: ${result.finishReason}`);
  return { text, inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 };
};
