import { humanError, languageOf, wordsFor, type Words } from "@app/core";

import { corsHeaders } from "./cors";
import { env } from "./env";

// Every /api/* response goes through these, so CORS and the error shape are
// the same everywhere.

function cors(request: Request): Record<string, string> {
  return corsHeaders(request.headers.get("origin"), env.allowedOrigins());
}

/**
 * The caller's words, for a sentence fit to show them: the app sends the
 * language they read Jonz in as Accept-Language (apps/client src/api/base.ts).
 * Anything else, or none, reads English.
 */
export function wordsOf(request: Request): Words {
  const first = request.headers.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim();
  return wordsFor(languageOf(first), "housemates");
}

/** A JSON response, with CORS headers for an allowed web origin. */
export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: cors(request) });
}

/** `{ "error": "..." }`: a sentence fit to show. Never a stack trace, a key or a query. */
export function error(request: Request, status: number, message: string): Response {
  return json(request, { error: message }, status);
}

/**
 * The database's refusal of a move, in its own words: 403 when it isn't the
 * caller's to make (42501), 409 when the rules say not now (a short code
 * from `raise exception`), 500 for anything else, which isn't a refusal.
 */
export function refused(request: Request, refusal: { message?: string; code?: string }): Response {
  const status = refusal.code === "42501" ? 403 : refusal.code === "P0001" ? 409 : 500;
  return error(request, status, humanError(refusal, wordsOf(request)));
}

/** Answers a browser's CORS preflight. Export it as OPTIONS from every route. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}
