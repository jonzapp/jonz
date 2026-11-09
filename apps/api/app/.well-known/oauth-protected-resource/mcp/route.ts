import { protectedResource } from "@/lib/mcp/server";

/** How an MCP client signs in for /mcp: its protected resource metadata (RFC 9728). */
export const dynamic = "force-dynamic";

export function GET() {
  const supabase = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Response.json(protectedResource(process.env.API_ORIGIN ?? "https://api.jonz.app", supabase), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}
