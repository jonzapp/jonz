import "server-only";

import { firstName, houseKind, rulesOf, shareLabel, type RollCallRequest } from "@app/core";

import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Ticking a John with who did it needs a server for one thing: telling the
// people it names. The roll call itself is the caller's own call to
// roll_call, which decides who's on it, who it leaves off and what each
// earns (supabase/migrations/20261102090000_shared_jonz.sql).

/**
 * Tick a John with who did it. Everyone on it but the caller hears what
 * they earned ("Glyn added you to Garden tidy, +4 pts"), and anyone it left
 * off hears that it's a miss for them unless they dispute it.
 */
export async function rollCall(
  caller: Caller,
  { assignmentId, crew, photoPath }: RollCallRequest,
): Promise<{ refusal: Refusal } | { people: number }> {
  const { data: people, error } = await caller.db.rpc("roll_call", {
    p_assignment: assignmentId,
    p_crew: crew,
    ...(photoPath ? { p_photo_path: photoPath } : {}),
  });
  if (error) return { refusal: error };

  // Read through the caller's own session, so this can only reach their house.
  const { data: place } = await caller.db
    .from("assignments")
    .select(
      "name, job_id, crew:crew_members(user_id, points), houses(kind, timezone, currency, week_starts, stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours, cover_grace_hours, late_hours, deal_mode, deal_budget)",
    )
    .eq("id", assignmentId)
    .single();
  const notify = pushNotifier(createAdminClient());
  if (!place || !place.houses || !notify) return { people };

  const { data: absent } = place.job_id
    ? await caller.db.from("assignments").select("user_id").eq("job_id", place.job_id).not("absent_at", "is", null)
    : { data: [] };
  const { data: me } = await caller.db.from("profiles").select("display_name").eq("id", caller.userId).single();
  const who = firstName(me?.display_name ?? "Someone");
  const zone = rulesOf(place.houses).timezone;
  const message = { url: "/today", kind: "checks" as const, zone, tag: `john:${assignmentId}`, houseKind: houseKind(place.houses.kind) };
  for (const c of place.crew ?? []) {
    if (c.user_id === caller.userId) continue;
    await notify([c.user_id], {
      ...message,
      title: (w) => w('john.crew.pushAdded', { who, john: place.name, points: shareLabel(Number(c.points), w) }),
      body: (w) => w('john.crew.pushAddedBody'),
    });
  }
  const leftOff = (absent ?? []).map((a) => a.user_id);
  if (leftOff.length > 0) {
    await notify(leftOff, { ...message, title: (w) => w('john.crew.pushLeftOff', { who, john: place.name }), body: (w) => w('john.crew.pushLeftOffBody') });
  }
  return { people };
}
