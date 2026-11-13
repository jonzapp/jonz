import { addDaysTo, localDate } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * The same time to be done late whatever the day (houses.late_hours, stored
 * on each John as closes_at), a cover window that always opens before the
 * John is missed, and time away at short notice handing Johns on instead of
 * making them overdue at once.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const db = adminClient();

/** A John dealt in `week`, due `hoursAgo` hours ago. */
async function johnDue(hoursAgo: number, names = ["Ava", "Ben", "Cal"], week = thisWeek()) {
  const house = await makeHouse(names);
  await addJohns(house.id, [{ name: "Bins" }], week);
  const { assignments } = await deal(house.id, week, week.startsAt);
  const a = assignments[0];
  await db.from("assignments").update({ due_at: fromNow(-hoursAgo * HOUR).toISOString() }).eq("id", a.id);
  return { house, a: await reread("assignments", a.id), owner: actorFor(house, a.user_id), coverer: someoneElse(house, a.user_id) };
}

describe("the late window", () => {
  it("closes each John the house's late window after it was due, and follows a moved due time", async () => {
    const { a } = await johnDue(2);
    const due = new Date(a.due_at as string).getTime();
    expect(new Date(a.closes_at as string).getTime()).toBe(due + DAY);
  });

  it("can still be done late after its week has ended", async () => {
    // Dealt last week, due two hours ago: the week is over, its late window isn't.
    const { house, a, owner } = await johnDue(2, ["Ava", "Ben"], weeksAgo(1));
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id as string }));
    await tickHouse(db, house.id, fromNow(2 * DAY));
    expect((await reread("assignments", a.id as string)).outcome).toBe("late");
  });

  it("turns missed once the window is up, and can't be ticked then", async () => {
    const { house, a, owner } = await johnDue(25);
    expectRule(await owner.db.rpc("mark_done", { p_assignment: a.id as string }), "week_closed");
    await tickHouse(db, house.id, rightNow());
    expect((await reread("assignments", a.id as string)).outcome).toBe("missed");
  });
});

describe("the cover window", () => {
  it("opens halfway to the miss when the grace would come after it", async () => {
    const { house, a, coverer } = await johnDue(1);
    // A two-hour late window and a three-hour grace: it opens after one hour.
    await db.from("houses").update({ late_hours: 2 }).eq("id", house.id);
    await db.from("assignments").update({ due_at: a.due_at as string }).eq("id", a.id as string);
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id as string }));
  });

  it("closes when the John is missed", async () => {
    const { a, coverer } = await johnDue(25);
    expectRule(await coverer.db.rpc("cover_john", { p_assignment: a.id as string }), "week_closed");
  });
});

describe("going away at short notice", () => {
  async function dueSoon(names: string[]) {
    const house = await makeHouse(names);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), rightNow());
    const a = assignments[0];
    const owner = house.everyone[0];
    await db
      .from("assignments")
      .update({ user_id: owner.userId, due_at: fromNow(6 * HOUR).toISOString() })
      .eq("id", a.id);
    return { house, a, owner };
  }

  it("hands a John due before you could do it to whoever is home", async () => {
    const { a, owner, house } = await dueSoon(["Ava", "Ben"]);
    const today = localDate(rightNow(), ZONE);
    const res = await owner.db.rpc("set_away", { p_starts: today, p_ends: addDaysTo(today, 2) });
    expectOk(res);
    expect(res.data).toBe(1);
    const row = await reread("assignments", a.id);
    expect(row.user_id).toBe(house.everyone[1].userId);
    expect(row.excused).toBe(false);
  });

  it("excuses it when nobody else is home", async () => {
    const { a, owner } = await dueSoon(["Ava"]);
    const today = localDate(rightNow(), ZONE);
    expectOk(await owner.db.rpc("set_away", { p_starts: today, p_ends: addDaysTo(today, 2) }));
    const row = await reread("assignments", a.id);
    expect([row.user_id, row.excused]).toEqual([owner.userId, true]);
  });
});
