import type { AdminClient } from "@/lib/supabase/admin";

import type { PassStripe } from "./stripe";

/** How long a Pass its buyer carries waits for a house before it stops renewing. */
const CARRY_DAYS = 30;

/**
 * The clock's part in the Pass moving with its buyer
 * (supabase/migrations/*_pass_moves.sql): a Pass left with the house its
 * buyer left, or carried for more than CARRY_DAYS without finding a house,
 * runs to the end of what was paid and stops renewing, so nobody is charged
 * for a house they've left. Each is told to Stripe once. Returns how many.
 */
export async function stopCarriedPasses(db: AdminClient, stripe: PassStripe, now: Date): Promise<number> {
  const { data: rows, error } = await db
    .from("moving_pass_billing")
    .select("move_id, stripe_subscription_id, moves!inner(pass_state, left_at, pass_stopped_at)")
    .not("stripe_subscription_id", "is", null)
    .is("moves.pass_stopped_at", null)
    .in("moves.pass_state", ["left", "waiting"]);
  if (error) throw new Error(`Couldn't read the moving House Passes: ${error.message}`);
  const waitedSince = now.getTime() - CARRY_DAYS * 86_400_000;
  let stopped = 0;
  for (const row of rows ?? []) {
    const move = row.moves;
    const due = move.pass_state === "left" || new Date(move.left_at).getTime() < waitedSince;
    if (!due || !row.stripe_subscription_id) continue;
    await stripe.stopRenewing(row.stripe_subscription_id);
    const { error: written } = await db
      .from("moves")
      .update({
        pass_stopped_at: now.toISOString(),
        ...(move.pass_state === "waiting" ? { pass_state: "lapsed" } : {}),
      })
      .eq("id", row.move_id);
    if (written) throw new Error(`Couldn't write the moving House Pass: ${written.message}`);
    stopped += 1;
  }
  return stopped;
}
