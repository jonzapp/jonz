import "server-only";

import { ACCOUNT_PERMISSIONS, OWNER_PERMISSION_NAMES, PERMISSION_NAMES } from "@app/core";
import { CLIENT_CAPABILITIES_META_KEY, createMcpHandler, inputRequired, McpServer, UrlElicitationRequiredError } from "@modelcontextprotocol/server";
import { randomUUID } from "node:crypto";
import { V1_OPERATIONS, v1Instance } from "v1";
import { answersSafely, asProblem, notSetUpProblem, Problem, problemResponse, type ApiOperation, type Executor } from "@app/server";

import { V1_HANDLERS } from "@/lib/v1/handlers";

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
 * Every operation /v1 serves, but approving a connected app's request
 * (`firstParty`): that's for the person, in Jonz itself. What can't be undone
 * (`destructive`) is offered, and the executor holds it until the person
 * approves it in Jonz.
 */
export const mcpOperations = (operations: readonly ApiOperation[] = V1_OPERATIONS) => operations.filter((o) => !o.operation.firstParty);

/** The id at the end of an approval link (https://jonz.app/approve/<id>), which the client is told to open. */
const approvalId = (url: string) => url.slice(url.lastIndexOf("/") + 1);

interface ToolContext {
  mcpReq: { envelope?: Record<string, unknown> };
}

/**
 * Sends the person to Jonz to approve, by URL elicitation (MCP 2025-11-25):
 * on the 2026 revision as an input request when the client says it can open
 * one; on 2025 revisions as the urlElicitationRequired error (-32042); and
 * otherwise as a tool error with the link, which any client can show.
 */
function askToApprove(url: string, message: string, ctx: ToolContext) {
  const elicitation = { elicitationId: approvalId(url), url, message: "Approve this in Jonz. It can't be undone." };
  const envelope = ctx.mcpReq.envelope;
  if (envelope === undefined) throw new UrlElicitationRequiredError([{ mode: "url", ...elicitation }], message);
  const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY] as { elicitation?: { url?: unknown } } | undefined;
  if (capabilities?.elicitation?.url !== undefined) return inputRequired({ inputRequests: { approve: inputRequired.elicitUrl(elicitation) } });
  return { isError: true, content: [{ type: "text" as const, text: `approval_required: ${message}` }] };
}

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
        annotations: { readOnlyHint: read, destructiveHint: op.operation.destructive === true, idempotentHint: read, openWorldHint: false },
      },
      async (input: Record<string, unknown>, ctx: ToolContext) => {
        try {
          const { body } = await execute(op.name, { authorization, via: "mcp", requestId: randomUUID() }, input ?? {});
          const structured = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : { result: body };
          return { content: [{ type: "text" as const, text: JSON.stringify(body ?? null) }], structuredContent: structured };
        } catch (error) {
          const p = asProblem(error);
          if (p.extra.approvalUrl) return askToApprove(p.extra.approvalUrl, p.message, ctx);
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

/** Answers one /mcp request. Anything it throws answers problem+json, with the cause only in the logs. */
export const handleMcp = answersSafely("/mcp", async (request: Request): Promise<Response> => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    // Tells the client where to sign in (MCP authorization, RFC 9728 §5.1).
    return problemResponse(
      new Problem("unauthenticated", "Sign in to Jonz to use this.", { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl()}"` }),
    );
  }
  const ready = v1Instance(process.env, V1_HANDLERS);
  if (!ready) return problemResponse(notSetUpProblem(), { status: 503 });
  const { execute, operations } = await ready;
  const handler = createMcpHandler(() => buildMcpServer(execute, authorization, mcpOperations(operations)));
  return handler.fetch(request);
});
