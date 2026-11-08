import "server-only";

import { firstName, rulesOf, STEADY_COPY, type SwapAskRequest } from "@app/core";

import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Asking to swap a John you'd rather not needs a server for one thing:
// telling the person asked. The ask itself is the caller's own call to
// offer_swap, which decides whether it may be asked
// (supabase/migrations/20261103090000_steady_weeks.sql).

/** Ask to swap; the person asked hears "Glyn asks to swap: their Garbage for your Kitchen". */
export async function askSwap(caller: Caller, { mine, theirs }: SwapAskRequest): Promise<{ refusal: Refusal } | { offerId: string }> {
  const { data: offerId, error } = await caller.db.rpc("offer_swap", { p_mine: mine, p_theirs: theirs });
  if (error) return { refusal: error };

  // Read through the caller's own session, so this can only reach their house.
  const [{ data: offer }, { data: johns }, { data: me }] = await Promise.all([
    caller.db.from("swap_offers").select("asked_user_id").eq("id", offerId).single(),
    caller.db
      .from("assignments")
      .select(
        "id, name, houses(timezone, currency, week_starts, stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours, cover_grace_hours, late_hours, deal_mode, deal_budget)",
      )
      .in("id", [mine, theirs]),
    caller.db.from("profiles").select("display_name").eq("id", caller.userId).single(),
  ]);
  const notify = pushNotifier(createAdminClient());
  const given = johns?.find((j) => j.id === mine);
  const taken = johns?.find((j) => j.id === theirs);
  if (!offer || !given?.houses || !taken || !notify) return { offerId };

  await notify([offer.asked_user_id], {
    url: "/today",
    kind: "checks",
    zone: rulesOf(given.houses).timezone,
    tag: `swap:${offerId}`,
    title: STEADY_COPY.pushTitle(firstName(me?.display_name ?? "A housemate")),
    body: STEADY_COPY.pushBody(given.name, taken.name),
  });
  return { offerId };
}
