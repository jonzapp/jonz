import "server-only";

import { proofPath } from "@app/core";
import { Problem } from "@app/server";
import { randomUUID } from "node:crypto";

import { userClient } from "@/lib/supabase/user";

// Files through our own addresses (docs/specs/api.md, C3): the app never
// talks to Supabase Storage. The API asks Storage as the person, so the
// buckets' own rules still decide who may put or see what, then hands back
// a link on the site: /files/up/… takes the bytes, /files/see/… shows a
// private picture for an hour, /files/photo/… shows someone's photo.
// Storage's own signed token rides along in the link, so the route needs no
// secret of ours and a link stops working when Storage's token runs out.

/** The buckets, as each kind of file lives in one. */
export const BUCKETS = { proof: "proofs", shot: "report-shots", photo: "avatars" } as const;
type Kind = keyof typeof BUCKETS;

/** How long a private picture's link works. */
export const SEE_SECONDS = 60 * 60;

/** The site's address for a file route: `${site}/files/${what}/${bucket}/${path}`. */
export const fileUrl = (site: string, what: "up" | "see" | "photo", bucket: string, path: string, token?: string) =>
  `${site}/files/${what}/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

/** Storage's token from one of its signed addresses. */
const tokenOf = (signed: string) => new URL(signed).searchParams.get("token");

/** Where a new file goes, for each kind, and as what. */
function newPath(kind: Kind, who: string, type: string, place?: { houseId: string; assignmentId: string }): string {
  if (kind === "proof") return proofPath(place!.houseId, place!.assignmentId, randomUUID());
  const ext = type === "image/png" ? "png" : "jpg";
  return kind === "shot" ? `${who}/${randomUUID()}.${ext}` : `${who}/photo-${randomUUID()}.${ext}`;
}

/**
 * A place to upload one new file, as the person: Storage refuses here when
 * its rules don't let them put a file there (someone else's John, another
 * person's folder).
 */
export async function uploadLink(
  token: string,
  who: string,
  site: string,
  kind: Kind,
  type: string,
  place?: { houseId: string; assignmentId: string },
): Promise<{ path: string; upload: string; link: string | null }> {
  const bucket = BUCKETS[kind];
  const path = newPath(kind, who, type, place);
  const { data, error } = await userClient(token).storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Problem("forbidden", "You can’t put a picture there.");
  return {
    path,
    upload: fileUrl(site, "up", bucket, path, data.token),
    link: kind === "photo" ? fileUrl(site, "photo", bucket, path) : null,
  };
}

/** Links to see private pictures, as the person: only the ones they may see come back. */
export async function seeLinks(token: string, site: string, kind: "proof" | "shot", paths: readonly string[]): Promise<Record<string, string>> {
  const bucket = BUCKETS[kind];
  const { data } = await userClient(token).storage.from(bucket).createSignedUrls([...paths], SEE_SECONDS);
  const links: Record<string, string> = {};
  for (const one of data ?? []) {
    const signed = one.signedUrl ? tokenOf(one.signedUrl) : null;
    if (one.path && signed) links[one.path] = fileUrl(site, "see", bucket, one.path, signed);
  }
  return links;
}
