import { handleMcp } from "@/lib/mcp/server";

/**
 * /mcp, Jonz for MCP clients (lib/mcp/server.ts), at api.jonz.app/mcp:
 * stateless Streamable HTTP, through the same executor as /v1. Node, not
 * the edge: it shares /v1's Postgres pool.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
