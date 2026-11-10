import "server-only";

import { prefsOf, pushFor, wordsFor } from "@app/core";
import webpush from "web-push";

import type { Notify, PushMessage } from "@/lib/engine/tick";
import { pushToken } from "@/lib/push-token";
import type { AdminClient } from "@/lib/supabase/admin";

// Pushes and server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

/** What the service worker (apps/client/public/sw.js) is sent: the message, as one person gets it. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Quiet hours: show it without a sound. */
  silent: boolean;
  /** Its buttons, each posted with `token` to /api/push-actions. */
  actions: { action: "done" | "held" | "struck"; title: string }[];
  token?: string;
}

/**
 * One person's copy of a message: no buttons for a kind they can't answer
 * here, and their own token for the ones it has.
 */
export function payloadFor(userId: string, message: PushMessage, silent: boolean, now: Date): PushPayload {
  const token = message.act ? pushToken({ userId, ...message.act }, now) : null;
  const actions: PushPayload["actions"] = !token
    ? []
    : "assignmentId" in message.act!
      ? [{ action: "done", title: words('house.notify.done') }]
      : [
          { action: "held", title: words('house.notify.held') },
          { action: "struck", title: words('house.notify.struck') },
        ];
  return {
    title: message.title,
    body: message.body,
    url: message.url,
    ...(message.tag ? { tag: message.tag } : {}),
    silent,
    actions,
    ...(token ? { token } : {}),
  };
}

/**
 * Web Push delivery for the engine's `Notify`.
 *
 * Returns undefined when the VAPID keys are not configured, which the engine
 * reads as "send nothing": a deployment without keys simply has no
 * reminders, rather than failing its tick.
 *
 * Each person's settings (notification_prefs) decide whether they get it,
 * and whether it makes a sound.
 */
export function pushNotifier(db: AdminClient): Notify | undefined {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@jonz.app";
  if (!publicKey || !privateKey) return undefined;
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return async (userIds, message) => {
    if (userIds.length === 0) return;
    const now = new Date();
    const [{ data: subs }, { data: prefs }] = await Promise.all([
      db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
      db
        .from("notification_prefs")
        .select("user_id, reminders, checks, flags, deal, quiet_from, quiet_until, timezone")
        .in("user_id", userIds),
    ]);
    for (const sub of subs ?? []) {
      const how = pushFor(prefsOf(prefs?.find((p) => p.user_id === sub.user_id)), message.kind, now, message.zone);
      if (how === "skip") continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payloadFor(sub.user_id, message, how === "quiet", now)),
          // A push service answers in well under a second; one that hangs mustn't hold up the rest of the tick.
          { TTL: 60 * 60 * 6, timeout: 10_000 },
        );
      } catch (e) {
        // 404 and 410 mean the browser has thrown the subscription away.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  };
}
