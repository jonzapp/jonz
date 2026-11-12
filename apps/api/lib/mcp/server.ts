import "server-only";

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
 * What a client such as Claude reads before it calls a tool: how fair shares
 * work, so it explains the numbers the way the deal counts them. The app's
 * own words for each part are the guide (ask_house answers from it).
 */
export const MCP_INSTRUCTIONS = [
  "Jonz shares a house's chores (Johns) out fairly each week. Each person's fair share counts points from the day they joined: their share of every John dealt (split between everyone who shares it) against the points of work they did, on time or late, including Johns they covered for someone. Standing = done minus share; below zero is behind.",
  "A group's Johns (a John only that group shares, such as one floor's bathroom) are evened out within the group, apart from the rest of the house's: each person has a standing in each group they're in and one in the rest of the house's Johns, and a group John never changes anyone's turn at the rest. house_balances gives the whole balance; house_group_balances gives each group's part, and the rest of the house's is the whole less the groups someone is in now. Covering a group's John when you're not in the group counts toward the rest of the house's; leaving a group takes that standing into the rest of the house's, and joining one starts level.",
  "The deal gives each John to whoever is furthest behind in its pool, with a weekly points budget as a guide, not a limit: in Smart whoever is behind may get up to half the budget more, and in Classic whoever's turn it is may go up to half the budget over. Time away is left out and made up as the house's rules say.",
  "To explain a part of the app in its own words, use ask_house. Look numbers up rather than guess them.",
].join("\n\n");

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
  const server = new McpServer(MCP_INFO, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS });
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

/** The scopes Supabase's OAuth server issues that a connected app needs: who you are, and staying signed in. */
export const OAUTH_SCOPES = ["openid", "email", "profile", "offline_access"] as const;

/** Where a client learns how to sign in for /mcp (RFC 9728). */
export function protectedResource(origin: string, supabaseUrl: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [`${supabaseUrl.replace(/\/$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
    // Only scopes Supabase's OAuth server can issue: a client such as Claude asks
    // for every scope listed here, and one Supabase doesn't know turns the whole
    // sign-in away (invalid_scope). What the app may do is still what the
    // person's role holds, checked on every call.
    scopes_supported: [...OAUTH_SCOPES],
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
