import "server-only";

import { type PushActionRequest, type PushActionResponse, wordsFor } from "@app/core";

import { tickHouse } from "@/lib/engine/tick";
import { readPushToken } from "@/lib/push-token";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Refusal } from "./disputes";

// Pushes and server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

// A button on a notification. There's no session: the token that came with
// the push says who and what, and push_action makes the move as them through
// the same function the app calls, so it's refused exactly where the app's
// would be (a John that needs a photo, a vote that has closed).

export type PushAnswer = { ok: PushActionResponse } | { expired: true } | { mismatch: true } | { refusal: Refusal };

export async function answerPush({ token, action }: PushActionRequest, now: Date): Promise<PushAnswer> {
  const grant = readPushToken(token, now);
  if (!grant) return { expired: true };
  const admin = createAdminClient();

  if ("assignmentId" in grant) {
    if (action !== "done") return { mismatch: true };
    const { error } = await admin.rpc("push_action", {
      p_user: grant.userId,
      p_assignment: grant.assignmentId,
      p_dispute: null as unknown as string,
      p_uphold: null as unknown as boolean,
    });
    const { data: a } = await admin.from("assignments").select("name").eq("id", grant.assignmentId).maybeSingle();
    const name = a?.name ?? "That John";
    if (error?.message === "already_done") return { ok: { ok: true, title: words('house.notify.alreadyTicked', { john: name }), body: "" } };
    if (error) return { refusal: error };
    return { ok: { ok: true, title: words('house.notify.ticked', { john: name }), body: words('house.notify.tickedBody') } };
  }

  if (action === "done") return { mismatch: true };
  const { error } = await admin.rpc("push_action", {
    p_user: grant.userId,
    p_assignment: null as unknown as string,
    p_dispute: grant.disputeId,
    p_uphold: action === "struck",
  });
  if (error) return { refusal: error };
  // Decide it now if this vote made a majority, as a vote in the app does.
  const { data: d } = await admin
    .from("disputes")
    .select("house_id, assignments(name)")
    .eq("id", grant.disputeId)
    .single();
  if (d) await tickHouse(admin, d.house_id, now);
  return {
    ok: {
      ok: true,
      title: words('house.notify.voted', { john: d?.assignments?.name ?? "that John" }),
      body: action === "struck" ? words('house.notify.votedStruck') : words('house.notify.votedHeld'),
    },
  };
}
