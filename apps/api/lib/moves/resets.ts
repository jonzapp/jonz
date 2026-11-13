import "server-only";

import {
  forfeitFor,
  passOf,
  hasPass,
  houseKind,
  resetWhat,
  type Words,
  ResetPreview,
  rulesOf,
  weekWindow,
  type ResetRequest,
} from "@app/core";

import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";
import { permitted } from "./permitted";
import { dealWeek } from "@/lib/engine/deal-week";
import { loadHouse } from "@/lib/engine/shared";

/**
 * An admin's reset (supabase/migrations/*_admin_resets.sql admin_reset):
 * without `apply`, what it would change, for the reset sheet; with it, the
 * change, a push to everyone it touched, and the action's id for Undo.
 *
 * admin_reset is the server's, so who is asking is checked here through the
 * caller's own session, and it checks again. What a late or missed John
 * costs comes from the house's rules and House Pass, as the clock's does.
 * A re-deal clears the week, then deals it again here (lib/engine/deal-week.ts),
 * and only this week can be dealt. The app (reset_house on /v1) and Ask Jonz
 * (lib/moves/ask-resets.ts) share it.
 */
export async function resetHouse(
  caller: Caller,
  request: ResetRequest,
  now: Date,
): Promise<{ refusal: Refusal } | { preview: ResetPreview } | { action: string }> {
  const refused = await permitted(caller, request.houseId, "history:write");
  if (refused) return { refusal: refused };
  const own = await ownResult(caller, request);
  if (own) return { refusal: own };
  const { data: me } = await caller.db
    .from("members")
    .select("profiles(display_name)")
    .eq("house_id", request.houseId)
    .eq("user_id", caller.userId)
    .single();

  const admin = createAdminClient();
  const { house, members } = await loadHouse(admin, request.houseId);
  const rules = rulesOf(house);
  const staked = hasPass(passOf(house), now);
  const forfeits = {
    late: staked ? forfeitFor("late", rules) : 0,
    missed: staked ? forfeitFor("missed", rules) : 0,
  };

  if (request.kind === "redeal") {
    const { data: week } = await admin.from("weeks").select("starts_on").eq("id", request.week ?? "").maybeSingle();
    if (!week || week.starts_on !== weekWindow(now, rules.timezone, rules.weekStarts).startsOn) {
      return { refusal: { code: "P0001", message: "not_this_week" } };
    }
  }

  const target = {
    week: request.week,
    user: request.user,
    assignment: request.assignment,
    outcome: request.outcome,
    month: request.month,
  };
  const { data, error } = await admin.rpc("admin_reset", {
    p_actor: caller.userId,
    p_house: request.houseId,
    p_kind: request.kind,
    p_target: target,
    p_forfeits: forfeits,
    p_apply: request.apply,
  });
  if (error) return { refusal: error };
  if (!request.apply) return { preview: ResetPreview.parse(data) };

  const done = data as { action: string; told: string[] };
  if (request.kind === "redeal") {
    try {
      await dealWeek(admin, house, members, weekWindow(now, rules.timezone, rules.weekStarts), now, true);
    } catch (e) {
      // The week is cleared and the clear is in History; the deal says why it couldn't follow.
      return { refusal: { message: e instanceof Error ? e.message : String(e) } };
    }
  }

  const notify = pushNotifier(admin);
  if (notify && done.told.length > 0) {
    const by = (me?.profiles as { display_name: string } | null)?.display_name;
    const { data: action } = await admin.from("house_actions").select("subject_user_id, data").eq("id", done.action).single();
    const data = (action?.data ?? {}) as Record<string, unknown>;
    const subjectId = action?.subject_user_id ?? null;
    const { data: subject } = subjectId
      ? await admin.from("profiles").select("display_name").eq("id", subjectId).maybeSingle()
      : { data: null };
    for (const userId of done.told) {
      // "Glyn reset your week", "Glyn marked Sam’s Bins done".
      const whose = (w: Words) => (userId === subjectId ? w("wall.feed.you") : (subject?.display_name ?? w("wall.feed.someone")));
      await notify([userId], {
        title: (w) => w("wall.history.line.reset", { who: by ?? w("wall.tell.anAdmin"), what: resetWhat(data, whose(w), w) }),
        body: (w) => w("wall.tell.openToSee"),
        houseKind: houseKind(house.kind),
        url: request.kind === "letoff" ? "/house/stake" : "/week",
        kind: "checks",
        zone: rules.timezone,
        tag: `reset:${done.action}`,
      });
    }
  }
  return { action: done.action };
}

/**
 * An admin can't change their own result (a John of theirs, or one they
 * covered) or reset their own week: another admin does, or the house
 * questions it. Someone alone in a house still can, as nobody else could.
 */
async function ownResult(caller: Caller, request: ResetRequest): Promise<Refusal | null> {
  let mine = false;
  if (request.kind === "result" && request.assignment) {
    const { data: a } = await caller.db
      .from("assignments")
      .select("user_id, covered_by")
      .eq("id", request.assignment)
      .eq("house_id", request.houseId)
      .maybeSingle();
    mine = !!a && (a.user_id === caller.userId || a.covered_by === caller.userId);
  } else if (request.kind === "person_week") {
    mine = request.user === caller.userId;
  }
  if (!mine) return null;
  const { count } = await caller.db
    .from("members")
    .select("user_id", { count: "exact", head: true })
    .eq("house_id", request.houseId);
  return (count ?? 0) > 1 ? { code: "42501", message: "own_result" } : null;
}
