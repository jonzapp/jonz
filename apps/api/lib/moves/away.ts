import "server-only";

import { dueInLine, type AwayDraft, wordsFor } from "@app/core";

import { pushNotifier } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Pushes and server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

// Booking time away needs a server for one thing: telling whoever it hands a
// John to. The booking itself is the caller's own call to set_away, which
// decides everything (what moves to before you go, what goes to whom); this
// only reads what it handed on and pushes each housemate theirs.

/** What booking did to your Johns: made due before you go, handed to housemates, or skipped. */
export interface Booked {
  before: number;
  handed: number;
  skipped: number;
}

/**
 * Book time away for the caller. Each housemate handed one of their Johns
 * hears which, and when it's due. Answers what it did to the caller's Johns,
 * as the trip's Wall post says it.
 */
export async function bookAway(caller: Caller, draft: AwayDraft, now: Date): Promise<{ refusal: Refusal } | Booked> {
  const { data: moved, error } = await caller.db.rpc("set_away", {
    p_starts: draft.from,
    p_ends: draft.to,
    p_note: draft.note || undefined,
  });
  if (error) return { refusal: error };

  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("away_periods")
    .select("id, house_id")
    .eq("user_id", caller.userId)
    .eq("starts_on", draft.from)
    .single();
  const { data: post } = trip
    ? await admin.from("events").select("data").eq("kind", "away").eq("data->>away", trip.id).maybeSingle()
    : { data: null };
  const said = (post?.data ?? {}) as { handed?: number; excused?: number };
  const handedCount = said.handed ?? 0;
  const skipped = said.excused ?? 0;
  const booked: Booked = { before: Math.max(0, (moved ?? 0) - handedCount - skipped), handed: handedCount, skipped };
  if (!trip || handedCount === 0) return booked;
  const { data: handed } = await admin
    .from("assignments")
    .select("id, user_id, name, due_at, needs_photo")
    .eq("handed_by_away_period_id", trip.id)
    .neq("user_id", caller.userId);
  const notify = handed?.length ? pushNotifier(admin) : null;
  if (notify && handed) {
    const { data: me } = await admin.from("profiles").select("display_name").eq("id", caller.userId).single();
    const { data: house } = await admin.from("houses").select("timezone").eq("id", trip.house_id).single();
    const zone = house?.timezone ?? "UTC";
    for (const a of handed) {
      await notify([a.user_id], {
        title: words('house.away.handedTitle', { john: a.name }),
        body: words('house.away.handedBody', { name: me?.display_name ?? "Someone", due: dueInLine(new Date(a.due_at), now, zone) }),
        url: "/today",
        kind: "deal",
        zone,
        ...(a.needs_photo ? {} : { act: { assignmentId: a.id } }),
        tag: `john:${a.id}`,
      });
    }
  }
  return booked;
}
