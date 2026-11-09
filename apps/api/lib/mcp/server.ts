import "server-only";

import { ACCOUNT_PERMISSIONS, OWNER_PERMISSION_NAMES, PERMISSION_NAMES } from "@app/core";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { randomUUID } from "node:crypto";
import { V1_OPERATIONS, v1Instance } from "v1";
import { asProblem, type ApiOperation, type Executor } from "@app/server";

// Jonz over MCP (docs/specs/operation-registry.md, "MCP"): one tool per
// operation /v1 serves, made from the registry, run through the same
// executor as /v1 with via "mcp" — the same token check, rate limit,
// permission, House Pass and audit. Stateless: each request gets a fresh
// server instance and nothing is kept between requests, so any instance can
// answer any request. The pool and executor are the instance's one, shared
// with /v1 (v1Instance).

/** The MCP server's name and version, as clients see it. */
export const MCP_INFO = { name: "jonz", version: "1.0.0" } as const;

/**
 * Operations that change something nobody can take back (`destructive` in
 * the registry). They need the person's own approval in Jonz first (URL
 * elicitation, next), so until that's built they aren't offered here.
 */
export const mcpOperations = (operations: readonly ApiOperation[] = V1_OPERATIONS) => operations.filter((o) => !o.operation.destructive);

/** What a tool says it does: the registry's words, and which house it acts in. */
export function toolDescription(op: ApiOperation): string {
  const o = op.operation;
  const where =
    o.scope === "house"
      ? " In one house: give its houseId, or the id of the thing it acts on."
      : o.scope === "app"
        ? " For Jonz's owners only."
        : "";
  return `${o.about}.${where}`;
}

/** The tools for one request: each runs `name` through the executor, as whoever the token says. */
export function buildMcpServer(execute: Executor, authorization: string | null, operations: readonly ApiOperation[] = mcpOperations()): McpServer {
  const server = new McpServer(MCP_INFO, { capabilities: { tools: {} } });
  for (const op of operations) {
    const read = op.operation.effect === "read";
    server.registerTool(
      op.name,
      {
        title: op.operation.about,
        description: toolDescription(op),
        inputSchema: op.input,
        annotations: { readOnlyHint: read, destructiveHint: false, idempotentHint: read, openWorldHint: false },
      },
      async (input: Record<string, unknown>) => {
        try {
          const { body } = await execute(op.name, { authorization, via: "mcp", requestId: randomUUID() }, input ?? {});
          const structured = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : { result: body };
          return { content: [{ type: "text" as const, text: JSON.stringify(body ?? null) }], structuredContent: structured };
        } catch (error) {
          const p = asProblem(error);
          return { isError: true, content: [{ type: "text" as const, text: `${p.code}: ${p.message}` }] };
        }
      },
    );
  }
  return server;
}

/** Where a client learns how to sign in for /mcp (RFC 9728). */
export function protectedResource(origin: string, supabaseUrl: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [`${supabaseUrl.replace(/\/$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
    // The same strings as the app's permissions: what a person may do is what their role holds.
    scopes_supported: [...Object.keys(ACCOUNT_PERMISSIONS), ...PERMISSION_NAMES, ...OWNER_PERMISSION_NAMES],
    resource_name: "Jonz",
  };
}

const origin = () => process.env.API_ORIGIN ?? "https://api.jonz.app";
const metadataUrl = () => `${origin()}/.well-known/oauth-protected-resource/mcp`;

const problem = (status: number, code: string, detail: string, headers: Record<string, string> = {}) =>
  Response.json({ type: `https://api.jonz.app/problems/${code}`, title: code, status, detail }, { status, headers: { "content-type": "application/problem+json", ...headers } });

/** Answers one /mcp request. */
export async function handleMcp(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    // Tells the client where to sign in (MCP authorization, RFC 9728 §5.1).
    return problem(401, "unauthenticated", "Sign in to Jonz to use this.", {
      "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl()}"`,
    });
  }
  const ready = v1Instance();
  if (!ready) return problem(503, "internal", "The API isn't set up here yet.");
  const { execute } = await ready;
  const handler = createMcpHandler(() => buildMcpServer(execute, authorization));
  return handler.fetch(request);
}
