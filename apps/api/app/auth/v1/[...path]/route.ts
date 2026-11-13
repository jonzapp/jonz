import { corsFor } from "@app/core";

import { env } from "@/lib/env";

/**
 * Sign-in on our own address (docs/specs/api.md, C3): the app's Supabase
 * Auth client points here, so the app never talks to Supabase. Each request
 * goes on to Supabase Auth as it came, and its answer comes back as it went.
 *
 * - Only the paths a person signs in, up and out with: never `/admin`, nor
 *   anything else Supabase Auth serves.
 * - The person's own `Authorization` decides what they may do, as it did
 *   straight to Supabase. Our key only goes in `apikey`.
 * - With SUPABASE_SECRET_KEY set (and IP Address Forwarding on in Supabase,
 *   Authentication > Rate Limits), Supabase limits each person by their own
 *   address (`Sb-Forwarded-For`), not by ours, which every person shares.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The first part of each path a person's sign-in uses. */
const OPEN = new Set(["authorize", "factors", "logout", "oauth", "otp", "reauthenticate", "recover", "resend", "settings", "signup", "token", "user", "verify"]);

/** Request headers Supabase Auth reads; nothing else goes on. */
const ASK = ["authorization", "content-type", "accept", "x-client-info", "x-supabase-api-version"];
/** Answer headers that come back; Supabase's own (cookies, its servers' names) stay behind. */
const ANSWER = ["content-type", "location", "cache-control", "x-supabase-api-version", "retry-after"];
/** No answer is bigger than this; a sign-in carries a few kilobytes. */
const MOST_BYTES = 64 * 1024;

type Params = { params: Promise<{ path: string[] }> };

function cors(request: Request): Record<string, string> {
  return corsFor(request.headers.get("origin"), env.allowedOrigins(), {
    methods: "GET, POST, PUT, DELETE, OPTIONS",
    headers: "Authorization, Content-Type, apikey, x-client-info, x-supabase-api-version",
    expose: "x-supabase-api-version, retry-after",
  });
}

const nothing = (request: Request) =>
  Response.json({ code: 404, error_code: "not_found", msg: "Not found" }, { status: 404, headers: { ...cors(request), "Cache-Control": "no-store" } });

/** The person's own address, as Vercel saw it (it sets x-forwarded-for itself). */
function clientAddress(request: Request): string | null {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip");
}

async function pass(request: Request, { params }: Params): Promise<Response> {
  const { path } = await params;
  if (!path.length || !OPEN.has(path[0]) || path.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) return nothing(request);

  const query = new URL(request.url).search;
  const url = `${env.supabaseUrl().replace(/\/+$/, "")}/auth/v1/${path.map(encodeURIComponent).join("/")}${query}`;
  const headers = new Headers();
  for (const name of ASK) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const secret = env.supabaseSecretKey();
  headers.set("apikey", secret ?? env.supabaseAnonKey());
  // Without the person's own token, they ask as anyone would: never as our key.
  // A new publishable key ("sb_publishable_…") isn't a JWT and never goes as
  // a Bearer token (Supabase's rule, which supabase-js follows): the apikey
  // alone says it. A legacy anon key still does.
  const anon = env.supabaseAnonKey();
  if (!headers.has("authorization") && !anon.startsWith("sb_")) headers.set("authorization", `Bearer ${anon}`);
  const address = clientAddress(request);
  if (secret && address) headers.set("sb-forwarded-for", address);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > MOST_BYTES) return new Response(null, { status: 413, headers: { ...cors(request), "Cache-Control": "no-store" } });

  let answer: Response;
  try {
    answer = await fetch(url, { method: request.method, headers, body, redirect: "manual" });
  } catch {
    return Response.json({ code: 502, error_code: "unexpected_failure", msg: "Sign-in isn't answering. Try again." }, { status: 502, headers: { ...cors(request), "Cache-Control": "no-store" } });
  }
  const out = new Headers(cors(request));
  for (const name of ANSWER) {
    const value = answer.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has("cache-control")) out.set("Cache-Control", "no-store");
  return new Response(answer.status === 204 || answer.status === 304 ? null : answer.body, { status: answer.status, headers: out });
}

export const GET = pass;
export const POST = pass;
export const PUT = pass;
export const DELETE = pass;
export const OPTIONS = (request: Request) => new Response(null, { status: 204, headers: cors(request) });
