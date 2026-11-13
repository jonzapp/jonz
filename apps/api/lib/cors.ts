import { corsFor } from "@app/core";

export { originAllowed } from "@app/core";

/** CORS for /api/*, by the one rule every server keeps (@app/core's cors.ts). */
export function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  return corsFor(origin, allowedOrigins, { methods: "GET, POST, OPTIONS", headers: "Authorization, Content-Type" });
}
