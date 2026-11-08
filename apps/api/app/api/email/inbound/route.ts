import { env } from "@/lib/env";
import { fetchReceived, readInbound, type ReceivedEvent, verifySvix } from "@/lib/inbound";
import { receiveEmail } from "@/lib/moves/reports";

/**
 * POST /api/email/inbound: Resend tells the API an email came to
 * support@jonz.app (docs/specs/report-a-problem.md, step 2). Called by
 * Resend alone, never by the app, so there's no CORS and no sign-in: the
 * signature, made with RESEND_WEBHOOK_SECRET, is what proves it's Resend.
 * The email becomes a report in the Inbox, or writes back on the one it
 * answers. A 500 makes Resend send the event again; the same email twice is
 * one report.
 */
export async function POST(request: Request) {
  const secret = env.resendWebhookSecret();
  if (!secret || !env.resendReceivingKey()) return Response.json({ error: "Email in isn't set up here." }, { status: 503 });

  const payload = await request.text();
  const signed = verifySvix(
    payload,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
    new Date(),
  );
  if (!signed) return Response.json({ error: "That isn't signed by Resend." }, { status: 400 });

  let event: ReceivedEvent;
  try {
    event = JSON.parse(payload) as ReceivedEvent;
  } catch {
    return Response.json({ error: "That isn't an event." }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ received: true, did: "ignored" });

  const email = await fetchReceived(event.data.email_id);
  if (!email) return Response.json({ error: "Couldn't read that email from Resend." }, { status: 500 });
  const read = readInbound(email);
  if ("skip" in read) return Response.json({ received: true, did: "skipped", why: read.skip });

  const done = await receiveEmail(read.inbound);
  return Response.json({ received: true, did: done.did });
}
