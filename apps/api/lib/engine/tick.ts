
import { tellHouse } from "./tell";
import { closeMonths, closeWeeks } from "./close";
import { ensureCurrentWeek } from "./deal-week";
import { remindMovers, sendReminders } from "./remind";
import { askParents, decideDisputes, settleDue } from "./settle";
import { loadHouse, must, type Db, type Notify, type TickSummary } from "./shared";

/**
 * The engine: everything the clock does to a house.
 *
 * It decides with the pure rules in @app/core and applies each decision
 * through one service-role SQL function that refuses to apply it twice
 * (supabase/migrations/*_init.sql). So the tick is safe to run as often as
 * anyone likes, from pg_cron, from a page load (lib/engine/fresh.ts) or from
 * two of those at once.
 *
 * It takes the client and the time as arguments and imports nothing that
 * only runs on a server, which is what lets tests/db drive it directly.
 */

export async function tickHouse(
  db: Db,
  houseId: string,
  now: Date, notify?: Notify,
): Promise<TickSummary> {
  const { house, members } = await loadHouse(db, houseId);
  const summary: TickSummary = {
    dealt: null,
    disputes: 0,
    settled: 0,
    weeksClosed: 0,
    monthsClosed: [],
    reminders: 0,
  };

  if (house.first_dealt_at) {
    summary.dealt = await ensureCurrentWeek(db, house, members, now, notify);
  }
  summary.disputes = await decideDisputes(db, house, members, now);
  summary.settled = await settleDue(db, house, now, notify);
  if (notify && house.kind === "family") await askParents(db, house, members, now, notify);
  summary.weeksClosed = await closeWeeks(db, house, members, now);
  summary.monthsClosed = await closeMonths(db, house, members, now);
  // A switch to a family that waited for this month to be settled (Rules' Who lives here).
  if (house.next_kind) summary.kindChanged = must(await db.rpc("apply_next_kind", { p_house: house.id, p_now: now.toISOString() }), "next kind");
  if (notify) summary.reminders = await sendReminders(db, house, now, notify);
  if (notify) await tellHouse(db, house, members.map((m) => m.user_id), now, notify);

  must(await db.from("houses").update({ ticked_at: now.toISOString() }).eq("id", house.id), "ticked_at");
  return summary;
}

/**
 * Every house the clock has work in, one after another. One bad house never
 * stops the rest. Then the one reminder to anyone who moved out and hasn't
 * started or joined a house since (it belongs to no house).
 */
export async function tickAll(db: Db, now: Date, notify?: Notify) {
  const houses = must(await db.from("houses").select("id"), "houses");
  const results: { houseId: string; summary?: TickSummary; error?: string }[] = [];
  for (const h of houses) {
    try {
      results.push({ houseId: h.id, summary: await tickHouse(db, h.id, now, notify) });
    } catch (e) {
      results.push({ houseId: h.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (notify) {
    try {
      await remindMovers(db, now, notify);
    } catch (e) {
      results.push({ houseId: "moved_on", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

