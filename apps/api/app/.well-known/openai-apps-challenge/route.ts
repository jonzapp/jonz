/**
 * OpenAI's check that we own api.jonz.app before Jonz is listed in ChatGPT's
 * app directory: the token its portal shows, as plain text and nothing else.
 * Set it as OPENAI_APPS_CHALLENGE in jonz-api's environment; unset, there's
 * nothing to show (docs/specs/assistant-directories.md).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(token, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
