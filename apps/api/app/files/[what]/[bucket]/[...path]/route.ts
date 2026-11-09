import { env } from "@/lib/env";
import { BUCKETS, SEE_SECONDS } from "@/lib/files";

/**
 * Files on our own address (lib/files.ts, docs/specs/api.md C3): the site
 * passes /files/* here, so the app never talks to Supabase Storage.
 *
 * - `PUT /files/up/{bucket}/{path}?token=` puts the bytes where an
 *   upload link (proof_upload, file_upload) said.
 * - `GET /files/see/{bucket}/{path}?token=` shows a private picture while
 *   its link (file_links) works.
 * - `GET /files/photo/avatars/{path}` shows someone's photo.
 *
 * Storage checks its own token on each, so a link only ever does what the
 * API handed out. Pictures only; anything Storage refuses comes back as a
 * plain 404, with nothing of Storage's in it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel takes a request body up to 4.5 MB; a picture is far smaller. */
const MOST_BYTES = 4 * 1024 * 1024;
const PICTURES = new Set(["image/jpeg", "image/png"]);
const KNOWN = new Set<string>(Object.values(BUCKETS));

type Params = { params: Promise<{ what: string; bucket: string; path: string[] }> };

const nothing = (status = 404) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** Storage's address for a file, or null when the request names something it shouldn't. */
async function storageUrl(params: Params["params"], request: Request, what: string, kind: string): Promise<string | null> {
  const p = await params;
  if (p.what !== what || !KNOWN.has(p.bucket) || (what === "photo") !== (p.bucket === BUCKETS.photo)) return null;
  if (p.path.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) return null;
  const path = p.path.map(encodeURIComponent).join("/");
  const token = new URL(request.url).searchParams.get("token");
  if (what !== "photo" && !token) return null;
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${env.supabaseUrl()}/storage/v1/object/${kind}/${p.bucket}/${path}${query}`;
}

export async function GET(request: Request, { params }: Params) {
  const { what } = await params;
  const url = await storageUrl(params, request, what, what === "photo" ? "public" : "sign");
  if (!url || (what !== "see" && what !== "photo")) return nothing();
  const answer = await fetch(url);
  const type = answer.headers.get("content-type") ?? "";
  if (!answer.ok || !answer.body || !PICTURES.has(type.split(";")[0].trim())) return nothing();
  return new Response(answer.body, {
    headers: {
      "Content-Type": type,
      // A private picture's link is its own; a photo's address changes with each new photo.
      "Cache-Control": what === "photo" ? "public, max-age=86400" : `private, max-age=${SEE_SECONDS}`,
    },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const url = await storageUrl(params, request, "up", "upload/sign");
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!url) return nothing();
  if (!PICTURES.has(type)) return nothing(415);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MOST_BYTES) return nothing(413);
  const answer = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": type, apikey: env.supabaseAnonKey(), "x-upsert": "false" },
    body: bytes,
  });
  if (!answer.ok) return nothing(answer.status === 409 ? 409 : 403);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
