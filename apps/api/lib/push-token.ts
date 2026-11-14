import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// A push's buttons work without a session: the notification carries a token
// that says whose it is and what it may do, signed by apps/api. The token
// only ever does what its button says (tick that one John, or vote on that
// one dispute) as the person it was sent to, and only for a few days.
//
// The signing key is made from the VAPID private key, which every deployment
// that sends pushes has already, so this needs no new secret. Changing the
// VAPID key retires every token, as it retires every web push subscription.

/** What a token lets its bearer do. */
export type PushGrant = { userId: string; assignmentId: string } | { userId: string; disputeId: string };

const DAY = 86_400;
/** Long enough for a Monday's push to work until the week is out. */
const TOKEN_DAYS = 8;

function signingKey(): Buffer | null {
  const vapid = process.env.VAPID_PRIVATE_KEY;
  if (!vapid) return null;
  return createHash("sha256").update(`johns push actions\n${vapid}`).digest();
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** A token for one push to one person, or null where pushes can't be sent. */
export function pushToken(grant: PushGrant, now: Date): string | null {
  const key = signingKey();
  if (!key) return null;
  const claims =
    "assignmentId" in grant
      ? { u: grant.userId, a: grant.assignmentId, e: Math.floor(now.getTime() / 1000) + TOKEN_DAYS * DAY }
      : { u: grant.userId, d: grant.disputeId, e: Math.floor(now.getTime() / 1000) + TOKEN_DAYS * DAY };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

/** What a token grants, or null when it's forged, mangled or out of date. */
export function readPushToken(token: string, now: Date): PushGrant | null {
  const key = signingKey();
  if (!key) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claims: { u?: unknown; a?: unknown; d?: unknown; e?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.u !== "string" || typeof claims.e !== "number") return null;
  if (claims.e * 1000 <= now.getTime()) return null;
  if (typeof claims.a === "string") return { userId: claims.u, assignmentId: claims.a };
  if (typeof claims.d === "string") return { userId: claims.u, disputeId: claims.d };
  return null;
}
