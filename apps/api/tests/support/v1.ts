import { DELETE, GET, OPTIONS, POST } from "@/app/v1/[...path]/route";

import type { Actor } from "./clients";

// /v1 called the way the app calls it: the real route handler (the executor,
// then the operation's handler in lib/v1/handlers.ts), a bearer token and
// JSON, from the app's own origin.

export const V1_BASE = "http://localhost:3205";
export const APP_ORIGIN = "http://localhost:8205";

const HANDLERS = { GET, POST, DELETE };

/** The person's bearer token, as the app sends it. */
async function bearerOf(actor: Actor): Promise<string> {
  const { data } = await actor.db.auth.getSession();
  return `Bearer ${data.session!.access_token}`;
}

/** One /v1 call as `actor` (nobody signed in when undefined): "POST /v1/houses/…/deal" and its JSON body. */
export async function v1(actor: Actor | undefined, call: `${keyof typeof HANDLERS} /v1/${string}`, body?: unknown): Promise<Response> {
  const [method, path] = call.split(" ") as [keyof typeof HANDLERS, string];
  const headers: Record<string, string> = { origin: APP_ORIGIN };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (actor) headers.authorization = await bearerOf(actor);
  return HANDLERS[method](new Request(`${V1_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}

/** A browser's preflight for a /v1 path, from the app's origin. */
export function preflight(path: `/v1/${string}`, method = "POST"): Promise<Response> {
  return OPTIONS(new Request(`${V1_BASE}${path}`, { method: "OPTIONS", headers: { origin: APP_ORIGIN, "access-control-request-method": method } }));
}

/** A refusal's code and words, from its problem+json. */
export async function problemOf(res: Response): Promise<{ code: string; detail: string }> {
  const body = (await res.json()) as { title: string; detail: string };
  return { code: body.title, detail: body.detail };
}
