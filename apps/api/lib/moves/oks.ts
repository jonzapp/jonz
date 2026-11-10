import "server-only";

import { firstName, wordsFor } from "@app/core";

import { tickHouse } from "@/lib/engine/tick";
import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

/**
 * A parent answers a kid's tick (family step 2). The caller's own call to
 * answer_tick, which owns the rule (only a parent, only a tick that waits),
 * then what only the service role can do: on Not yet, tell the kid; either
 * way, tick the house, so an OK'd John settles now rather than on the clock.
 */
export async function answerTick(caller: Caller, assignmentId: string, ok: boolean, now: Date): Promise<Refusal | null> {
  const { data: kid, error } = await caller.db.rpc("answer_tick", { p_assignment: assignmentId, p_ok: ok });
  if (error) return error;

  // Read through the caller's own session, so this can only reach their house.
  const { data: a } = await caller.db.from("assignments").select("house_id, name, houses(timezone)").eq("id", assignmentId).single();
  if (!a) return null;
  const admin = createAdminClient();
  const notify = pushNotifier(admin);
  if (!ok && notify && kid && kid !== caller.userId) {
    const { data: me } = await caller.db.from("profiles").select("display_name").eq("id", caller.userId).single();
    await notify([kid], {
      title: words('today.parentOk.notYetTitle', { john: a.name }),
      body: words('today.parentOk.notYetBody', { parent: me ? firstName(me.display_name) : words('today.parentOk.aParent') }),
      url: "/today",
      kind: "checks",
      zone: a.houses?.timezone ?? "UTC",
      tag: `john:${assignmentId}`,
    });
  }
  await tickHouse(admin, a.house_id, now);
  return null;
}
