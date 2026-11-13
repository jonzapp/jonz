import "server-only";

import { languageOf, messagePush, ownerMessageEmail, testWays, type OwnerMessageRequest } from "@app/core";

import { sendEmail } from "@/lib/email";
import { pushNotifier } from "@/lib/push";
import { type AdminClient, createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";
import { type Notify } from "@/lib/engine/shared";

// Messages from the owner (docs/specs/owner-admin.md, "Messages"). Sending is
// the owner's own call to the database (owner_send_message), which checks it
// is them with their code, posts on the Walls and leaves one outbox row per
// person; then this pushes and emails those people, a batch at a time,
// until the time it has is up. The clock (/api/cron/tick) sends whatever is
// left, so a message to everyone never has to fit in one request.

/** Where a push or an email is sent: kept apart so tests can watch. */
export interface MessageOutbox {
  db: AdminClient;
  notify: Notify | undefined;
  email: typeof sendEmail;
}

export function messageOutbox(): MessageOutbox {
  const db = createAdminClient();
  return { db, notify: pushNotifier(db), email: sendEmail };
}

const SITE = "https://jonz.app";
const BATCH = 200;

interface Taken {
  message_id: string;
  user_id: string;
  subject: string;
  body: string;
  by_push: boolean;
  by_wall: boolean;
  by_email: boolean;
  email: string | null;
  name: string | null;
  zone: string;
}

/**
 * Pushes and emails what's waiting in the outbox (one message's, or
 * anyone's), until it's empty or `until` has passed. Each row is taken off
 * the outbox as it's read, so two senders never send one twice; an email
 * also carries an idempotency key. Returns how many people it reached.
 */
export async function sendOutbox(
  out: MessageOutbox,
  { message = null, until, test = false }: { message?: string | null; until: number; test?: boolean },
): Promise<number> {
  let sent = 0;
  while (Date.now() < until) {
    const { data, error } = await out.db.rpc("take_message_outbox", { p_limit: BATCH, p_message: message ?? undefined });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Taken[];
    if (rows.length === 0) break;

    // One push per message and zone (quiet hours are read in each person's own zone).
    const groups = new Map<string, Taken[]>();
    for (const row of rows.filter((r) => r.by_push)) {
      const key = `${row.message_id} ${row.zone}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      const first = group[0];
      await out.notify?.(
        group.map((r) => r.user_id),
        {
          ...messagePush({ subject: first.subject, body: first.body, wall: first.by_wall }),
          kind: "support",
          zone: first.zone,
          tag: `message:${first.message_id}`,
        },
      );
    }

    const emailed = rows.filter((r) => r.by_email && r.email);
    const { data: people } = emailed.length
      ? await out.db.from("profiles").select("id, language").in("id", emailed.map((r) => r.user_id))
      : { data: [] };
    for (const row of emailed) {
      const language = languageOf(people?.find((p) => p.id === row.user_id)?.language);
      // A failed email is logged by sendEmail and never holds the rest up.
      await out.email(
        row.email!,
        ownerMessageEmail({ name: row.name, subject: row.subject, body: row.body, url: row.by_wall ? `${SITE}/house/wall` : SITE, test, language }),
        { tag: test ? "message-test" : "message", idempotencyKey: `message-${row.message_id}-${row.user_id}` },
      );
    }
    sent += rows.length;
  }
  return sent;
}

/**
 * The owner sends a message, or a test of it to themself (`audience:
 * "test"`, the ways it would go less the Wall). The database decides who it
 * reaches; this sends what it can in the next ~40 seconds.
 */
export async function sendMessage(
  caller: Caller,
  request: OwnerMessageRequest,
  out: MessageOutbox = messageOutbox(),
  until = Date.now() + 40_000,
): Promise<{ refusal: Refusal } | { id: string; people: number; walls: number; sent: number }> {
  const test = request.audience === "test";
  const ways = test ? testWays(request) : request;
  const { data, error } = await caller.db.rpc("owner_send_message", {
    p_audience: request.audience,
    p_person: request.personId,
    p_house: request.houseId,
    p_subject: request.subject,
    p_body: request.body,
    p_push: ways.push,
    p_wall: ways.wall,
    p_email: ways.email,
  });
  if (error || !data) return { refusal: error ?? { message: "not_found" } };
  const sent = data as { id: string; people: number; walls: number };
  const reached = await sendOutbox(out, { message: sent.id, until, test });
  return { ...sent, sent: reached };
}
