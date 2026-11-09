import { OPERATIONS } from "@app/core";
import { Problem, type Executor } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { V1_OPERATIONS } from "v1";

import { buildMcpServer, handleMcp, mcpOperations, protectedResource } from "@/lib/mcp/server";

/**
 * /mcp with the executor stood in for: one tool per operation /v1 serves
 * (none that can't be taken back, until approvals), each run through the
 * executor as the caller's token with via "mcp", and refusals answered as
 * tool errors. The executor itself is tested in packages/server.
 */

const TOKEN = "Bearer test-token";

async function rpc(execute: Executor, method: string, params: Record<string, unknown> = {}) {
  const handler = createMcpHandler(() => buildMcpServer(execute, TOKEN));
  const res = await handler.fetch(
    new Request("https://api.jonz.app/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  // A 2025-era request is answered over SSE: the message is the data line.
  const json = text.trimStart().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
  return JSON.parse(json) as { result?: Record<string, unknown>; error?: unknown };
}

const fake = (impl: Executor = vi.fn(async () => ({ status: 200 as const, body: { ok: true }, requestId: "r" }))) => impl;

describe("/mcp", () => {
  it("offers one tool per operation /v1 serves, leaving out what can't be taken back", async () => {
    const { result } = await rpc(fake(), "tools/list");
    const tools = (result!.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[]);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(mcpOperations().map((o) => o.name).sort());
    expect(names.length).toBeGreaterThan(0);
    for (const o of V1_OPERATIONS) if (o.operation.destructive) expect(names, o.name).not.toContain(o.name);
    const read = tools.find((t) => OPERATIONS[t.name as keyof typeof OPERATIONS].effect === "read");
    expect(read?.annotations?.readOnlyHint).toBe(true);
  });

  const A = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("runs a tool through the executor as the caller, by MCP, and answers what it did", async () => {
    const execute = vi.fn(async () => ({ status: 200 as const, body: { ok: true, n: 2 }, requestId: "r" })) as unknown as Executor;
    expect(mcpOperations().map((o) => o.name)).toContain("undo_done");
    const { result } = await rpc(execute, "tools/call", { name: "undo_done", arguments: { assignmentId: A } });
    expect(execute).toHaveBeenCalledWith("undo_done", expect.objectContaining({ authorization: TOKEN, via: "mcp" }), { assignmentId: A });
    expect(result).toMatchObject({ structuredContent: { ok: true, n: 2 } });
    expect(result!.isError).toBeFalsy();
  });

  it("checks the input before the executor sees it", async () => {
    const execute = vi.fn() as unknown as Executor;
    const { result, error } = await rpc(execute, "tools/call", { name: "undo_done", arguments: { assignmentId: "nope" } });
    expect(result?.isError ?? Boolean(error)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers a refusal as a tool error with its code", async () => {
    const execute = vi.fn(async () => {
      throw new Problem("forbidden", "That isn't something you can do.");
    }) as unknown as Executor;
    const { result } = await rpc(execute, "tools/call", { name: "undo_done", arguments: { assignmentId: A } });
    expect(result!.isError).toBe(true);
    expect(JSON.stringify(result!.content)).toContain("forbidden: That isn't something you can do.");
  });

  it("asks a caller with no token to sign in, and says where", async () => {
    const res = await handleMcp(new Request("https://api.jonz.app/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://api.jonz.app/.well-known/oauth-protected-resource/mcp"');
  });

  it("names Supabase Auth as where to sign in, and the permissions as scopes", () => {
    const meta = protectedResource("https://api.jonz.app", "https://x.supabase.co/");
    expect(meta.resource).toBe("https://api.jonz.app/mcp");
    expect(meta.authorization_servers).toEqual(["https://x.supabase.co/auth/v1"]);
    expect(meta.scopes_supported).toEqual(expect.arrayContaining(["johns:read", "ticks:write_own", "admin:read"]));
  });
});
