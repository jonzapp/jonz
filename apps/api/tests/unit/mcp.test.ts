import { HOW_JONZ_WORKS, JOHN_LIST_ADVICE, MCP_ADDRESS, OPERATIONS, PAGE_IDS, type Operation } from "@app/core";
import { Problem, type Executor } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { V1_OPERATIONS, withHandlers } from "v1";

import { V1_HANDLERS } from "@/lib/v1/handlers";
import { buildMcpServer, handleMcp, mcpOperations, protectedResource } from "@/lib/mcp/server";

/**
 * /mcp with the executor stood in for: one tool per operation /v1 serves
 * (but approving, which is for the person in Jonz), each run through the
 * executor as the caller's token with via "mcp", refusals answered as tool
 * errors, and a change that needs approving answered by URL elicitation. The
 * executor itself is tested in packages/server.
 */

const TOKEN = "Bearer test-token";

async function rpc(execute: Executor, method: string, params: Record<string, unknown> = {}, operations = mcpOperations()) {
  const handler = createMcpHandler(() => buildMcpServer(execute, TOKEN, operations));
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

const rpcWith = (operations: ReturnType<typeof mcpOperations>, method: string) => rpc(fake(), method, {}, operations);

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
    // What a connected app may do is the person's to set, in Jonz: never a tool an app could call.
    for (const name of ["set_app_access", "my_app_access", "answer_api_approval", "api_approval"]) {
      expect(V1_OPERATIONS.map((o) => o.name), name).toContain(name);
      expect(names, name).not.toContain(name);
    }
    const read = tools.find((t) => OPERATIONS[t.name as keyof typeof OPERATIONS].effect === "read");
    expect(read?.annotations?.readOnlyHint).toBe(true);
    for (const t of tools) {
      const o = OPERATIONS[t.name as keyof typeof OPERATIONS] as Operation;
      expect(t.annotations?.destructiveHint, t.name).toBe(o.effect !== "read" && o.additive !== true);
    }
  });

  it("tells the client how fair shares count, groups' Johns apart, and which tools read them", async () => {
    const { result } = await rpc(fake(), "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const said = result!.instructions as string;
    expect(said).toContain("A group's Johns");
    expect(said).toContain("half the budget over");
    const { result: listed } = await rpc(fake(), "tools/list");
    const names = (listed!.tools as { name: string }[]).map((t) => t.name);
    for (const tool of ["house_balances", "house_group_balances"]) {
      expect(said, tool).toContain(tool);
      expect(names, tool).toContain(tool);
    }
    // What Ask Jonz knows, so the person's own assistant explains as it would, and reads the guide first.
    expect(said).toContain(HOW_JONZ_WORKS);
    // And the same advice on the John list, from the one place Ask Jonz has it too.
    expect(said).toContain(JOHN_LIST_ADVICE);
    // Jonz's pages: one tool lists them, one reads any of them, whatever pages there are.
    for (const tool of ["list_pages", "read_page"]) {
      expect(said, tool).toContain(tool);
      expect(V1_HANDLERS, tool).toHaveProperty(tool);
      expect("firstParty" in OPERATIONS[tool as keyof typeof OPERATIONS], tool).toBe(false);
    }
    // As /mcp serves them, with apps/api's handlers: no tool for any one page, and read_page takes every page there is.
    const served = (await rpcWith(mcpOperations(withHandlers(V1_HANDLERS)), "tools/list")).result!.tools as { name: string; inputSchema: { properties: Record<string, { enum?: string[] }> } }[];
    expect(served.map((t) => t.name).filter((n) => /guide|help|privacy|terms|how_it_works/.test(n))).toEqual([]);
    const read = served.find((t) => t.name === "read_page")!;
    expect(read.inputSchema.properties.pageId.enum).toEqual([...PAGE_IDS]);
    expect(served.map((t) => t.name)).toContain("list_pages");
    // Every tool the instructions name is one /mcp serves.
    const named = new Set(said.match(/\b[a-z]+(?:_[a-z]+)+\b/g));
    expect(named.size).toBeGreaterThan(10);
    for (const name of named) expect(served.map((t) => t.name), name).toContain(name);
  });

  it("offers none of Jonz's own AI: the person's assistant does the thinking, and Jonz pays for no model", async () => {
    const { result: listed } = await rpc(fake(), "tools/list");
    const names = (listed!.tools as { name: string }[]).map((t) => t.name);
    for (const ai of ["ask_house", "ask_owner", "claim_support_draft"]) expect(names, ai).not.toContain(ai);
    const { result } = await rpc(fake(), "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(result!.instructions as string).not.toContain("ask_house");
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

  it("names Supabase Auth as where to sign in, and only scopes it can issue", () => {
    const meta = protectedResource("https://api.jonz.app", "https://x.supabase.co/");
    expect(meta.resource).toBe("https://api.jonz.app/mcp");
    expect(meta.resource).toBe(MCP_ADDRESS); // what jonz.app/help and You tell people to paste
    expect(meta.authorization_servers).toEqual(["https://x.supabase.co/auth/v1"]);
    // Supabase's OAuth server turns a sign-in away over any scope not in this list
    // (supabase/auth internal/models/oauth_scope.go), and Claude asks for all we name.
    const supabaseScopes = ["openid", "email", "profile", "phone", "offline_access"];
    expect(meta.scopes_supported.length).toBeGreaterThan(0);
    for (const scope of meta.scopes_supported) expect(supabaseScopes).toContain(scope);
    expect(meta.scopes_supported).toContain("offline_access");
  });
});
