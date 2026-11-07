import "server-only";

import { EMAIL_ADDRESSES, type EmailMessage } from "@app/core";

import { env } from "@/lib/env";

// Sends Jonz's emails through Resend (docs/specs/email.md). The words and
// the look are drawn in @app/core (email.ts); this only posts them. Without
// RESEND_API_KEY (local, and staging until it has its own key) nothing is
// sent: the email is logged as skipped, so a flow that sends one still runs.

const RESEND = "https://api.resend.com/emails";

export type SendResult = { sent: true; id: string } | { sent: false; reason: "no-key" | "refused" | "no-address"; detail?: string };

export interface SendOptions {
  /** A short name for the kind of email, kept with it in Resend for counting: "account-deleted", "notice". */
  tag: string;
  /** The same key twice within a day sends once: a retried request never emails twice. */
  idempotencyKey?: string;
}

/** Posts one email to Resend. Never throws for Resend's own refusals: the caller decides whether that matters. */
export async function sendEmail(
  to: string,
  message: EmailMessage,
  options: SendOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  // A kid without a sign-in has an address at a domain that can't exist (lib/moves/kids.ts).
  if (/\.invalid$/i.test(to.trim())) return { sent: false, reason: "no-address" };
  const key = env.resendApiKey();
  if (!key) {
    console.info(`email: skipped "${message.subject}" (${options.tag}), no RESEND_API_KEY`);
    return { sent: false, reason: "no-key" };
  }
  const response = await fetchImpl(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.emailFrom(),
      to: [to],
      reply_to: EMAIL_ADDRESSES.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: "kind", value: options.tag }],
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error(`email: Resend refused "${options.tag}" (${response.status}): ${detail}`);
    return { sent: false, reason: "refused", detail };
  }
  const { id } = (await response.json()) as { id: string };
  return { sent: true, id };
}
