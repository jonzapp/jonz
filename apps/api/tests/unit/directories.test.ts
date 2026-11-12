import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL, MCP_ADDRESS, OPERATIONS } from "@app/core";
import { afterEach, describe, expect, it } from "vitest";
import { withHandlers } from "v1";

import { GET as challenge } from "@/app/.well-known/openai-apps-challenge/route";
import { mcpOperations, MCP_INSTRUCTIONS, toolAnnotations, toolDescription } from "@/lib/mcp/server";
import { V1_HANDLERS } from "@/lib/v1/handlers";

/**
 * What Claude's connector directory and ChatGPT's app directory check before
 * they list Jonz (docs/specs/assistant-directories.md), held here so a new
 * tool can't quietly break a listing: every tool /mcp serves, and the
 * package ChatGPT's portal takes (integrations/chatgpt).
 */

const served = mcpOperations(withHandlers(V1_HANDLERS));
const PACKAGE = join(__dirname, "../../../../integrations/chatgpt");
const plugin = JSON.parse(readFileSync(join(PACKAGE, "plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(join(PACKAGE, "mcp.json"), "utf8"));
const openai = plugin.extensions["com.openai"];

/** Words that change or take away what's there: a write named so is never only additive. */
const CHANGES = /^(remove|delete|cancel|undo|un|reset|end|stop|leave|set|save|change|update|use|answer|cast|see|plan)_|^unreact$/;
/** A listing or tool may not sell: no prices, trials or discounts (ChatGPT), nor promote a product (Claude). */
const SELLING = /[$£€]\s?\d|\bfree trial\b|\bdiscount\b|\bper (month|year)\b|\bupgrade\b/i;

describe("Claude's and ChatGPT's directories", () => {
  it("get every tool with a short name, a title and every hint said outright", () => {
    expect(served.length).toBeGreaterThan(50);
    for (const op of served) {
      expect(op.name.length, op.name).toBeLessThanOrEqual(64);
      const a = toolAnnotations(op);
      expect(a.title.trim(), op.name).not.toBe("");
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) expect(typeof a[hint], `${op.name} ${hint}`).toBe("boolean");
    }
  });

  it("mark every write destructive unless it only adds, even one that can be undone; never a read", () => {
    for (const op of served) {
      const { readOnlyHint, destructiveHint } = toolAnnotations(op);
      if (op.operation.effect === "read") expect([readOnlyHint, destructiveHint], op.name).toEqual([true, false]);
      else expect(destructiveHint, op.name).toBe(op.operation.additive !== true);
    }
    // What may be marked only additive: a write that changes or takes nothing away.
    for (const [name, o] of Object.entries(OPERATIONS) as [string, { effect: string; additive?: true; destructive?: true }][]) {
      if (!o.additive) continue;
      expect(o.effect, name).toBe("write");
      expect(o.destructive, `${name} needs approving, so it isn't only additive`).toBeUndefined();
      expect(name, `${name} changes what's there`).not.toMatch(CHANGES);
    }
    for (const name of ["remove_john", "cancel_away", "undo_done", "change_john", "remove_flag", "end_notice", "unreact", "set_away", "deal_week", "cover_john"]) {
      const op = served.find((o) => o.name === name)!;
      expect(toolAnnotations(op).destructiveHint, name).toBe(true);
    }
    expect(toolAnnotations(served.find((o) => o.name === "mark_done")!).destructiveHint).toBe(false);
  });

  it("sell nothing: buying or paying for the House Pass stays on jonz.app", () => {
    const names = served.map((o) => o.name);
    for (const name of ["pass_checkout", "pass_billing", "leave_pass"]) expect(names, name).not.toContain(name);
    for (const op of served) expect(op.operation.guard, op.name).not.toEqual({ by: "permission", permission: "billing:write_own" });
    for (const op of served) expect(toolDescription(op), op.name).not.toMatch(SELLING);
    expect(MCP_INSTRUCTIONS).not.toMatch(SELLING);
  });

  it("list Jonz from a package ChatGPT's portal takes", () => {
    const i = openai.interface;
    expect(i.displayName.length).toBeLessThanOrEqual(30);
    expect(i.shortDescription.length).toBeLessThanOrEqual(30);
    expect(i.longDescription.length).toBeLessThanOrEqual(4000);
    expect(`${i.shortDescription} ${i.longDescription} ${plugin.description}`).not.toMatch(SELLING);
    // Who runs Jonz, as the Privacy page says: OpenAI turns down a developer name that doesn't match.
    expect(i.developerName).toBe(LEGAL.operator);
    expect(plugin.author.name).toBe(LEGAL.operator);
    expect(i.websiteURL).toBe(LEGAL.site);
    expect(i.supportURL).toBe(`${LEGAL.site}${LEGAL.helpPath}`);
    expect(i.privacyPolicyURL).toBe(`${LEGAL.site}${LEGAL.privacyPath}`);
    expect(i.termsOfServiceURL).toBe(`${LEGAL.site}${LEGAL.termsPath}`);
    expect(i.defaultPrompt.length).toBeLessThanOrEqual(3);
    for (const p of i.defaultPrompt) expect(p.length, p).toBeLessThanOrEqual(128);
    for (const c of [i.brandColor, i.brandColorDark]) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    for (const file of [i.logo, i.composerIcon]) {
      expect(file).toMatch(/^\.\//);
      const png = readFileSync(join(PACKAGE, file));
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(w, file).toBe(h);
      expect(w, file).toBeGreaterThanOrEqual(48);
      expect(w, file).toBeLessThanOrEqual(4096);
    }
    expect(Object.values(mcp.mcpServers)).toEqual([{ type: "streamable-http", url: MCP_ADDRESS }]);
    expect(openai.publication.countries.length).toBeGreaterThan(0);
  });

  it("gives ChatGPT's reviewers five things to try and three to leave alone, with tools /mcp really serves", () => {
    const { positive, negative } = openai.review.test_cases;
    expect(positive).toHaveLength(5);
    expect(negative).toHaveLength(3);
    const names = served.map((o) => o.name);
    for (const t of positive) {
      for (const tool of t.tools_triggered.split(",").map((s: string) => s.trim())) expect(names, `${t.prompt}: ${tool}`).toContain(tool);
      expect(t.expected_behavior.trim()).not.toBe("");
    }
    for (const t of [...positive, ...negative]) expect(t.description.trim()).not.toBe("");
  });
});

describe("/.well-known/openai-apps-challenge", () => {
  const before = process.env.OPENAI_APPS_CHALLENGE;
  afterEach(() => {
    if (before === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
    else process.env.OPENAI_APPS_CHALLENGE = before;
  });

  it("shows OpenAI's token as plain text and nothing else", async () => {
    process.env.OPENAI_APPS_CHALLENGE = " tok_abc123 \n";
    const res = challenge();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("tok_abc123");
  });

  it("is not found while no token is set", () => {
    delete process.env.OPENAI_APPS_CHALLENGE;
    expect(challenge().status).toBe(404);
  });
});
