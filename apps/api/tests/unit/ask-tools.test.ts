import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { REPLY_FORMAT_GUIDE, REPLY_SAMPLES, tidyReply } from "@app/core";

import { askClaude, jonzToolSet, type DraftContext, type JonzTools } from "@/lib/ai/house-draft";

/** Ask Jonz's tools: every read for everyone, a write only for a move the person may make. */
const asked: unknown[][] = [];
const reads = {
  ...Object.fromEntries(["week", "people", "timeAway", "history", "balances", "rules", "stake"].map((k) => [k, async () => k])),
  whyJohn: async (...args: unknown[]) => (asked.push(["whyJohn", ...args]), "Dealt to you: furthest behind."),
  howItWorks: (topic: string) => (asked.push(["howItWorks", topic]), `How ${topic} works.`),
} as unknown as JonzTools["reads"];
const tools = (may: Partial<JonzTools["may"]>): JonzTools => ({
  reads,
  listJohns: () => "The list is empty.",
  edit: () => ({ ok: true, said: "ok" }),
  setGroup: () => ({ ok: true, said: "ok" }),
  offerReset: async () => ({ ok: true, said: "ok" }),
  may: { add: false, change: false, remove: false, groups: false, resets: false, ...may },
});
const READS = ["balances", "history", "house_rules", "how_it_works", "list_johns", "people", "stake", "time_away", "week", "why_john"];

describe("jonzToolSet", () => {
  it("gives someone who can only look every read and no writes", () => {
    expect(Object.keys(jonzToolSet(tools({}))).sort()).toEqual(READS);
  });

  it("adds each write only with its permission", () => {
    expect(Object.keys(jonzToolSet(tools({ remove: true }))).sort()).toEqual([...READS, "remove_john"].sort());
    expect(Object.keys(jonzToolSet(tools({ add: true, change: true, remove: true, groups: true, resets: true }))).sort()).toEqual(
      [...READS, "add_john", "change_john", "remove_john", "set_group", "offer_reset"].sort(),
    );
  });
});

describe("askClaude", () => {
  const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
  const ctx: DraftContext = {
    people: ["Ava", "Ben"],
    me: { name: "Ava", role: "admin" },
    houseName: "Elm Road",
    family: false,
    weekStarts: 1,
    today: "Thursday 2026-11-05, 17:00",
    allowed: ["Take a John off the list"],
    messages: [{ role: "user", text: "Take the bins off" }],
    editing: true,
    now: null,
  };

  it("runs the tools Claude calls, then reads its last word", async () => {
    const edits: unknown[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            { type: "tool-call", toolCallId: "1", toolName: "list_johns", input: "{}" },
            { type: "tool-call", toolCallId: "2", toolName: "remove_john", input: JSON.stringify({ ref: "bins" }) },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_use" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: JSON.stringify({ reply: "Bins are on the card to take off.", ask: { kind: "none", options: [] } }) }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        },
      ],
    });
    const answer = await askClaude(ctx, { ...tools({ remove: true }), edit: (e) => (edits.push(e), { ok: true, said: "Taking off." }) }, model);
    expect(edits).toEqual([{ kind: "remove", ref: "bins" }]);
    expect(answer).toEqual({ raw: { reply: "Bins are on the card to take off.", ask: { kind: "none", options: [] } }, inputTokens: 200, outputTokens: 40 });
    // The house rides on the first message; the tools Claude was given are the ones this person may use.
    const call = model.doGenerateCalls[0];
    expect(JSON.stringify(call.prompt)).toContain("Elm Road");
    expect((call.tools ?? []).map((t) => t.name)).toContain("remove_john");
    expect((call.tools ?? []).map((t) => t.name)).not.toContain("add_john");
  });

  it("tells Claude how to write: Markdown, chips and cards, from the same list the app draws", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: JSON.stringify({ reply: REPLY_SAMPLES[1].reply, ask: { kind: "none", options: [] } }) }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage,
        warnings: [],
      },
    });
    const answer = await askClaude(ctx, tools({}), model);
    const system = JSON.stringify(model.doGenerateCalls[0].prompt[0]);
    expect(system).toContain(JSON.stringify(REPLY_FORMAT_GUIDE).slice(1, -1));
    // The old rule against lists and Markdown is gone.
    expect(system).not.toMatch(/no bullets or markdown/i);
    // A Markdown reply comes through with its lines and cards as written.
    expect(tidyReply(answer.raw.reply)).toBe(REPLY_SAMPLES[1].reply);
  });
  it("explains how things work: reads the rule and the person's numbers, then walks through the maths", async () => {
    asked.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            { type: "tool-call", toolCallId: "1", toolName: "how_it_works", input: JSON.stringify({ topic: "stake" }) },
            { type: "tool-call", toolCallId: "2", toolName: "stake", input: "{}" },
            { type: "tool-call", toolCallId: "3", toolName: "why_john", input: JSON.stringify({ name: "Bins out", who: "me" }) },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_use" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: JSON.stringify({ reply: "1. Late once: £1\n2. Missed once: £3\n\nSo **£4**.", ask: { kind: "none", options: [] } }) }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        },
      ],
    });
    const answer = await askClaude({ ...ctx, me: { name: "Ben", role: "member" }, allowed: [] }, tools({}), model);
    expect(asked).toEqual([
      ["howItWorks", "stake"],
      ["whyJohn", "Bins out", "me"],
    ]);
    expect(answer.raw.reply).toContain("**£4**");
    // Everyone gets the explaining reads, whatever they may change; the prompt asks for the working, not for silence on it.
    const call = model.doGenerateCalls[0];
    expect((call.tools ?? []).map((t) => t.name)).toEqual(expect.arrayContaining(["how_it_works", "stake", "why_john", "balances"]));
    expect(call.prompt[0].content).toContain("Walk through the maths");
    expect(call.prompt[0].content).not.toContain("Don't explain points maths");
  });
});
