import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import {
  ASK_CARD_OPERATIONS,
  ASK_COVERAGE,
  ASK_WRITE_TOOLS,
  askOperationsFor,
  operationPermission,
  PERMISSION_NAMES,
  REPLY_FORMAT_GUIDE,
  REPLY_SAMPLES,
  tidyReply,
  type AskCardOperation,
  type Permission,
} from "@app/core";

import { askClaude, jonzToolSet, type DraftContext, type JonzTools } from "@/lib/ai/house-draft";

/** Ask Jonz's tools: every read for everyone, a write only for a move the person may make. */
const asked: unknown[][] = [];
const reads = {
  ...Object.fromEntries(["week", "people", "timeAway", "history", "balances", "rules", "stake", "wall", "disputes", "swaps"].map((k) => [k, async () => k])),
  whyJohn: async (...args: unknown[]) => (asked.push(["whyJohn", ...args]), "Dealt to you: furthest behind."),
  page: (page: string) => (asked.push(["page", page]), `How ${page} works.`),
} as unknown as JonzTools["reads"];
const offered: unknown[][] = [];
const tools = (may: Partial<JonzTools["may"]>, operations: readonly AskCardOperation[] = []): JonzTools => ({
  reads,
  listJohns: () => "The list is empty.",
  edit: () => ({ ok: true, said: "ok" }),
  setGroup: () => ({ ok: true, said: "ok" }),
  offerReset: async () => ({ ok: true, said: "ok" }),
  offerAway: async () => ({ ok: true, said: "ok" }),
  offerCancelAway: async () => ({ ok: true, said: "ok" }),
  offerOperation: async (name, given) => (offered.push([name, given]), { ok: true, said: "On the card." }),
  operations,
  may: { add: false, change: false, remove: false, groups: false, resets: false, away: false, ...may },
});
const READS = ["balances", "disputes", "history", "house_rules", "list_johns", "people", "read_page", "stake", "swaps", "time_away", "wall", "week", "why_john"];

describe("jonzToolSet", () => {
  it("gives someone who can only look every read and no writes", () => {
    expect(Object.keys(jonzToolSet(tools({}))).sort()).toEqual(READS);
  });

  it("adds each write only with its permission", () => {
    expect(Object.keys(jonzToolSet(tools({ remove: true }))).sort()).toEqual([...READS, "remove_john"].sort());
    expect(Object.keys(jonzToolSet(tools({ add: true, change: true, remove: true, groups: true, resets: true, away: true }))).sort()).toEqual(
      [...READS, "add_john", "change_john", "remove_john", "set_group", "offer_reset", "book_away", "cancel_away"].sort(),
    );
  });

  it("adds a tool for each card operation the person may make, which puts it on the card", async () => {
    const set = jonzToolSet(tools({}, ["mark_done", "react"]));
    expect(Object.keys(set).sort()).toEqual([...READS, "mark_done", "react"].sort());
    const run = set.mark_done.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const said = await run({ assignmentId: "1a2b3c4d", say: "Tick off Bins out" }, { toolCallId: "1", messages: [], context: {} });
    expect(said).toBe("On the card.");
    expect(offered.at(-1)).toEqual(["mark_done", { assignmentId: "1a2b3c4d", say: "Tick off Bins out" }]);
  });
});

// What each tool's switch in JonzTools["may"] stands for (draft.ts sets them from these permissions).
const MAY_FOR: Record<keyof JonzTools["may"], Permission> = {
  add: "johns:write",
  change: "johns:write",
  remove: "johns:write",
  groups: "groups:write",
  resets: "history:write",
  away: "away:write_own",
};

describe("every permission has a way through Ask Jonz", () => {
  const all = Object.keys(jonzToolSet(tools({ add: true, change: true, remove: true, groups: true, resets: true, away: true }, ASK_CARD_OPERATIONS)));
  const writes = all.filter((t) => !READS.includes(t));

  it("says how Jonz handles each one", () => {
    expect(Object.keys(ASK_COVERAGE).sort()).toEqual([...PERMISSION_NAMES].sort());
  });

  it("gives each card move's tools, switched on by that move's permission", () => {
    const on = { add: true, change: true, remove: true, groups: true, resets: true, away: true };
    for (const [perm, c] of Object.entries(ASK_COVERAGE)) {
      if (c.by !== "card") continue;
      for (const name of c.tools) {
        if ((ASK_CARD_OPERATIONS as readonly string[]).includes(name)) {
          // A card operation is offered to someone who holds its permission, and only then.
          const op = name as AskCardOperation;
          expect(askOperationsFor((p) => p === operationPermission(op)), name).toContain(op);
          expect(askOperationsFor((p) => p !== operationPermission(op)), name).not.toContain(op);
          continue;
        }
        expect(all, `${perm} needs ${name}`).toContain(name);
        // The one switch that takes the tool away is the permission's own.
        const off = (Object.keys(MAY_FOR) as (keyof JonzTools["may"])[]).filter((k) => !(name in jonzToolSet(tools({ ...on, [k]: false }))));
        expect(off, name).toHaveLength(1);
        const owner = ASK_COVERAGE[MAY_FOR[off[0]]];
        expect(owner.by === "card" && owner.tools.includes(name), `${name} is switched by ${MAY_FOR[off[0]]}`).toBe(true);
      }
    }
  });

  it("has no write tool that the list doesn't account for", () => {
    expect([...writes].sort()).toEqual([...ASK_WRITE_TOOLS].sort());
  });

  it("leaves no permission without a tool: every move someone may make is on the card", () => {
    for (const p of PERMISSION_NAMES) if (!p.endsWith(":read")) expect(ASK_COVERAGE[p].by, p).toBe("card");
  });
});

describe("askClaude", () => {
  const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
  const ctx: DraftContext = {
    people: ["Ava", "Ben"],
    me: { name: "Ava", role: "admin" },
    houseName: "Elm Road",
    family: false,
    language: "English",
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
    // And the language Ava reads Jonz in, for Claude to answer in.
    expect(JSON.stringify(call.prompt)).toContain("Ava reads Jonz in English: answer in English");
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
            { type: "tool-call", toolCallId: "1", toolName: "read_page", input: JSON.stringify({ page: "stake" }) },
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
      ["page", "stake"],
      ["whyJohn", "Bins out", "me"],
    ]);
    expect(answer.raw.reply).toContain("**£4**");
    // Everyone gets the explaining reads, whatever they may change; the prompt asks for the working, not for silence on it.
    const call = model.doGenerateCalls[0];
    expect((call.tools ?? []).map((t) => t.name)).toEqual(expect.arrayContaining(["read_page", "stake", "why_john", "balances"]));
    expect(call.prompt[0].content).toContain("Walk through the maths");
    expect(call.prompt[0].content).not.toContain("Don't explain points maths");
  });
});
