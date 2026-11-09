import { OPERATIONS, type Operation } from "@app/core";
import { Problem, type Executor } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { V1_OPERATIONS } from "v1";

import { buildMcpServer, handleMcp, mcpOperations, protectedResource } from "@/lib/mcp/server";

/**
 * /mcp with the executor stood in for: one tool per operation /v1 serves
 * (but approving, which is for the person in Jonz), each run through the
 * executor as the caller's token with via "mcp", refusals answered as tool
 * errors, and a change that needs approving answered by URL elicitation. The
 * executor itself is tested in packages/server.
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
  it("offers one tool per operation /v1 serves, but approving, and says which can't be undone", async () => {
    const { result } = await rpc(fake(), "tools/list");
    const tools = (result!.tools as { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }[]);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(mcpOperations().map((o) => o.name).sort());
    expect(names.length).toBeGreaterThan(0);
    for (const o of V1_OPERATIONS) expect(names.includes(o.name), o.name).toBe(!o.operation.firstParty);
    expect(V1_OPERATIONS.map((o) => o.name)).toContain("answer_api_approval");
    const read = tools.find((t) => OPERATIONS[t.name as keyof typeof OPERATIONS].effect === "read");
    expect(read?.annotations?.readOnlyHint).toBe(true);
    for (const t of tools) expect(t.annotations?.destructiveHint ?? false, t.name).toBe((OPERATIONS[t.name as keyof typeof OPERATIONS] as Operation).destructive === true);
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

  it("sends the person to Jonz to approve a change that can't be undone", async () => {
    const url = "https://jonz.app/approve/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const execute = vi.fn(async () => {
      throw new Problem("forbidden", `This can't be undone, so approve it in Jonz first: ${url}`, {}, { approvalUrl: url });
    }) as unknown as Executor;
    expect(OPERATIONS.set_house_kind.destructive).toBe(true);
    const { error } = await rpc(execute, "tools/call", { name: "set_house_kind", arguments: { houseId: A, kind: "family" } });
    expect(error).toMatchObject({ code: -32042, data: { elicitations: [{ mode: "url", url, elicitationId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }] } });
    expect(JSON.stringify(error)).toContain(url);
  });

  it("on MCP's 2026 revision, asks for the approval as an input request, or says where if the client can't open one", async () => {
    const url = "https://jonz.app/approve/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const execute = vi.fn(async () => {
      throw new Problem("forbidden", `This can't be undone, so approve it in Jonz first: ${url}`, {}, { approvalUrl: url });
    }) as unknown as Executor;
    const call = async (capabilities: Record<string, unknown>) => {
      const res = await createMcpHandler(() => buildMcpServer(execute, TOKEN)).fetch(
        new Request("https://api.jonz.app/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "set_house_kind" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "set_house_kind",
              arguments: { houseId: A, kind: "family" },
              _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientCapabilities": capabilities,
                "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
              },
            },
          }),
        }),
      );
      return ((await res.json()) as { result: Record<string, unknown> }).result;
    };
    expect(await call({ elicitation: { url: {} } })).toMatchObject({
      resultType: "input_required",
      inputRequests: { approve: { method: "elicitation/create", params: { mode: "url", url, elicitationId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" } } },
    });
    const plain = await call({});
    expect(plain.isError).toBe(true);
    expect(JSON.stringify(plain.content)).toContain(`approval_required: This can't be undone, so approve it in Jonz first: ${url}`);
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
