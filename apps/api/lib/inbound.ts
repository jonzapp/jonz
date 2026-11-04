import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { emailWords, parseAddress, skipInbound } from "@app/core";

import { env } from "@/lib/env";
import type { Inbound } from "@/lib/moves/reports";

// Email to support@jonz.app (docs/specs/report-a-problem.md, step 2).
// Resend receives it and posts an `email.received` event to
// /api/email/inbound, signed the Svix way with RESEND_WEBHOOK_SECRET. The
// event carries only who and what about; the words come from Resend's
// Receiving API, read with RESEND_RECEIVING_KEY (a key that may read
// received mail; the sending key can't).

/** How far a signature's time may be from ours, as Svix allows. */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Whether a webhook's body was signed with this secret ("whsec_" and
 * base64): the signature is an HMAC-SHA256 of "id.timestamp.body", one or
 * more "v1,<base64>" separated by spaces, made within five minutes of `now`.
 */
export function verifySvix(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now: Date,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const at = Number(timestamp);
  if (!Number.isFinite(at) || Math.abs(now.getTime() / 1000 - at) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** What Resend's webhook says about an email that came in. */
export interface ReceivedEvent {
  type: string;
  data?: { email_id?: string; from?: string; to?: string[]; subject?: string };
}

/** A received email, whole, as Resend's Receiving API answers it (only what Jonz reads). */
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
}

/** Reads one received email from Resend; null when it can't (no key, or Resend said no). */
export async function fetchReceived(id: string, fetchImpl: typeof fetch = fetch): Promise<ReceivedEmail | null> {
  const key = env.resendReceivingKey();
  if (!key) return null;
  const response = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    console.error(`inbound: Resend wouldn't give email ${id} (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return null;
  }
  return (await response.json()) as ReceivedEmail;
}

/**
 * A received email as what the Inbox keeps, or why it keeps nothing: an
 * automatic reply, a bounce, mail from Jonz, mail not for support, or no
 * words at all.
 */
export function readInbound(email: ReceivedEmail): { inbound: Inbound } | { skip: string } {
  const why = skipInbound({ from: email.headers?.from ?? email.from, to: email.to ?? [], headers: email.headers });
  if (why) return { skip: why };
  const sender = parseAddress(email.headers?.from ?? email.from);
  const plain = parseAddress(email.from);
  const address = sender.email ?? plain.email;
  if (!address) return { skip: "address" };
  const words = emailWords({ text: email.text, html: email.html });
  const subject = email.subject?.trim() || null;
  if (!words && !subject) return { skip: "empty" };
  return {
    inbound: {
      emailId: email.id,
      from: address,
      name: sender.name ?? plain.name,
      subject,
      words,
      trusted: email.authentication?.dmarc === "pass",
    },
  };
}
