import { dateInWeek, monthIndex, weekIndex, weekWindow, type Category, type IsoDow, type WeekWindow } from "@app/core";
import { expect } from "vitest";

import { dealWeek, loadHouse } from "@/lib/engine/tick";

import { adminClient, signedInUser, type Actor } from "./clients";
import { track } from "./scope";

export const ZONE = "Europe/London";

/** When everyone in a test house moved in: long before any week a test deals. */
export const SINCE = "2020-01-01T00:00:00Z";

export interface House {
  id: string;
  code: string;
  admin: Actor;
  members: Actor[];
  /** Everyone, admin first, in join order. */
  everyone: Actor[];
}

/** A house set up the way the app does it: create_house, then join_house by code. A family's first name is its parent. */
export async function makeHouse(names: string[] = ["Ava", "Ben", "Cal"], kind: "housemates" | "family" = "housemates"): Promise<House> {
  const [first, ...rest] = names;
  const admin = await signedInUser(first);
  const { data: id, error } = await admin.db.rpc("create_house", {
    p_name: `${first}'s house`,
    p_timezone: ZONE,
    p_currency: "GBP",
    p_week_starts: 1,
    ...(kind === "family" ? { p_kind: "family" } : {}),
  });
  if (error) throw error;
  track.house(id!);
  const { data: house } = await adminClient().from("houses").select("join_code").eq("id", id!).single();
  const members: Actor[] = [];
  for (const name of rest) {
    const m = await signedInUser(name);
    const { error: joinError } = await m.db.rpc("join_house", { p_code: house!.join_code });
    if (joinError) throw joinError;
    members.push(m);
  }
  // Everyone has lived here since before any week a test deals: the deal leaves out someone who moved in after
  // a week was dealt (they start the next Monday), and tests deal weeks in the past.
  for (const [i, a] of [admin, ...members].entries()) {
    const { error: backdate } = await adminClient()
      .from("members")
      .update({ joined_at: new Date(Date.parse(SINCE) + i * 1000).toISOString() })
      .eq("house_id", id!)
      .eq("user_id", a.userId);
    if (backdate) throw backdate;
  }
  return { id: id!, code: house!.join_code, admin, members, everyone: [admin, ...members] };
}

export interface JohnSpec {
  name: string;
  points?: number;
  category?: Category;
  dueDow?: IsoDow;
  dueTime?: string;
  everyWeeks?: number;
  /** Every N months on the Nth of its due day in the month, counting from the month its date in the anchor week falls in. */
  monthly?: { everyMonths: number; weekOfMonth: number };
  needsPhoto?: boolean;
  /** Only this group shares it. */
  groupId?: string;
  /** On call: flagged when it needs doing, with this window. */
  onCall?: { respondHours?: number; perWeek?: number };
  /** Done by: how many do it together (1 to 6), or 0 for everyone home. */
  crew?: number;
  /** Always dealt, always on its own day, whatever the budget. */
  keepDay?: boolean;
}

export async function addJohns(houseId: string, specs: JohnSpec[], anchor: WeekWindow) {
  const { data, error } = await adminClient()
    .from("johns")
    .insert(
      specs.map((s) => ({
        house_id: houseId,
        name: s.name,
        points: s.points ?? 2,
        category: s.category ?? "other",
        due_dow: s.dueDow ?? 7,
        due_time: s.dueTime ?? "21:00",
        every_weeks: s.everyWeeks ?? 1,
        every_months: s.monthly?.everyMonths ?? null,
        week_of_month: s.monthly?.weekOfMonth ?? null,
        anchor_month: s.monthly ? monthIndex(dateInWeek(anchor.startsOn, 1, s.dueDow ?? 7)) : null,
        needs_photo: s.needsPhoto ?? false,
        group_id: s.groupId ?? null,
        anchor_week: weekIndex(anchor.startsOn),
        // Every row names every column: a bulk insert fills a column one row
        // leaves out with null, not its default.
        kind: s.onCall ? "on_call" : "day",
        respond_hours: s.onCall?.respondHours ?? 12,
        per_week: s.onCall?.perWeek ?? 2,
        crew: s.crew ?? 1,
        keep_day: s.keepDay ?? false,
      })),
    )
    .select("id, name");
  if (error) throw error;
  return data!;
}

/** Deal a week through the engine, as the clock would. */
export async function deal(houseId: string, week: WeekWindow, now: Date) {
  const db = adminClient();
  const { house, members } = await loadHouse(db, houseId);
  const { weekId } = await dealWeek(db, house, members, week, now, false);
  expect(weekId).toBeTruthy();
  const { data } = await db
    .from("assignments")
    .select("*")
    .eq("week_id", weekId!)
    .order("due_at");
  return { weekId: weekId!, assignments: data! };
}

/** The current real week, which is the only one the housemate functions will accept ticks in. */
export function thisWeek(now = new Date()) {
  return weekWindow(now, ZONE, 1);
}

/** A week safely in the past (the functions will refuse ticks in it). */
export function weeksAgo(n: number, now = new Date()) {
  return weekWindow(new Date(now.getTime() - n * 7 * 86_400_000), ZONE, 1);
}

/** Read a row back past RLS: the only honest proof a write was blocked. */
export async function reread<T extends string>(table: T, id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await adminClient().from(table as any).select("*").eq("id", id).single();
  return data as unknown as Record<string, unknown>;
}

export function actorFor(house: House, userId: string): Actor {
  return house.everyone.find((a) => a.userId === userId)!;
}

export function someoneElse(house: House, userId: string): Actor {
  return house.everyone.find((a) => a.userId !== userId)!;
}
