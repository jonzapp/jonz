import "server-only";

import { votersOn, type Database, wordsFor } from "@app/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { tickHouse } from "@/lib/engine/tick";
import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// Pushes and server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

// The two moves on a dispute that need a server. Each is the caller's own
// call to the SQL function that owns the rule, which decides exactly as it
// would anywhere else, then what only the service role can do: tell the
// house, and decide at once when the votes already say. The web's server
// actions and the API's routes both call these, so the two can't drift.

/** Whoever is moving: a client acting as them (cookie session or bearer token) and their id. */
export interface Caller {
  db: SupabaseClient<Database>;
  userId: string;
}

/** The database's refusal, for `humanError` (and, in a route, a status). */
export interface Refusal {
  message?: string;
  code?: string;
}

/**
 * Dispute a housemate's tick. The ticker and everyone who votes hear about
 * it, and the house is ticked, which decides it at once when the raiser's
 * vote is already a majority. With only one voter it waits for the vote to
 * close, so whoever ticked it can answer with a photo (answer_dispute).
 */
export async function raiseDispute(caller: Caller, assignmentId: string, reason: string, now: Date): Promise<Refusal | null> {
  const { data: disputeId, error } = await caller.db.rpc("raise_dispute", { p_assignment: assignmentId, p_reason: reason });
  if (error) return error;

  // Who to tell is read through the caller's own session, so this can only
  // reach their house. Whose tick it is: the coverer's, for a cover.
  const { data: a } = await caller.db
    .from("assignments")
    .select("house_id, user_id, covered_by, name, houses(timezone)")
    .eq("id", assignmentId)
    .single();
  if (!a) return null;
  const admin = createAdminClient();
  const notify = pushNotifier(admin);
  if (notify) {
    const ticker = a.covered_by ?? a.user_id;
    const zone = a.houses?.timezone ?? "UTC";
    const { data: members } = await caller.db.from("members").select("user_id").eq("house_id", a.house_id);
    const voters = votersOn((members ?? []).map((m) => m.user_id), { userId: a.user_id, coveredBy: a.covered_by }).filter(
      (id) => id !== caller.userId,
    );
    await notify([ticker], { title: words('house.notify.disputedTitle', { john: a.name }), body: reason, url: "/week", kind: "checks", zone });
    await notify(voters, {
      title: words('house.notify.voteTitle', { john: a.name }),
      body: reason,
      url: "/week",
      kind: "checks",
      zone,
      act: { disputeId },
      tag: `dispute:${disputeId}`,
    });
  }
  await tickHouse(admin, a.house_id, now);
  return null;
}

/** Vote on a dispute, and decide it now if this vote made a majority, rather than on the next tick. */
export async function castVote(caller: Caller, disputeId: string, uphold: boolean, now: Date): Promise<Refusal | null> {
  const { error } = await caller.db.rpc("cast_vote", { p_dispute: disputeId, p_uphold: uphold });
  if (error) return error;

  // The house is the one the caller just voted in, read through RLS.
  const { data: d } = await caller.db.from("disputes").select("house_id").eq("id", disputeId).single();
  if (d) await tickHouse(createAdminClient(), d.house_id, now);
  return null;
}
