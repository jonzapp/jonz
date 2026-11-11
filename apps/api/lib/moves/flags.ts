import "server-only";

import { dueInLine, houseKind, rulesOf } from "@app/core";

import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";


// Flagging an on-call John needs a server for one thing: telling whoever has
// it. The flag itself is the caller's own call to raise_flag, which decides
// who that is (whoever is on call, or whoever is home if they're away).

/**
 * Say an on-call John needs doing. Whoever has the flag hears about it,
 * unless they raised it themselves; flagging one that's already open nudges
 * them again. Answers the flag's id, so the one on call can tick it at once.
 */
export async function raiseFlag(
  caller: Caller,
  johnId: string,
  now: Date,
): Promise<{ refusal: Refusal } | { assignmentId: string }> {
  const { data: assignmentId, error } = await caller.db.rpc("raise_flag", { p_john: johnId });
  if (error) return { refusal: error };

  // Read through the caller's own session, so this can only reach their house.
  const { data: flag } = await caller.db
    .from("assignments")
    .select("user_id, name, due_at, needs_photo, houses(kind, timezone, currency, week_starts, stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours, cover_grace_hours, late_hours, deal_mode, deal_budget)")
    .eq("id", assignmentId)
    .single();
  if (!flag || flag.user_id === caller.userId || !flag.houses) return { assignmentId };

  const notify = pushNotifier(createAdminClient());
  if (notify) {
    const { data: me } = await caller.db.from("profiles").select("display_name").eq("id", caller.userId).single();
    const zone = rulesOf(flag.houses).timezone;
    await notify([flag.user_id], {
      houseKind: houseKind(flag.houses.kind),
      title: (w) => w('today.onCall.pushTitle', { john: flag.name }),
      body: (w) => w('today.onCall.pushBody', { by: me?.display_name ?? "Someone", due: dueInLine(new Date(flag.due_at), now, zone, w) }),
      url: "/today",
      kind: "flags",
      zone,
      ...(flag.needs_photo ? {} : { act: { assignmentId } }),
      tag: `john:${assignmentId}`,
    });
  }
  return { assignmentId };
}
