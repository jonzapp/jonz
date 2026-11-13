import { addDaysTo, localDate } from "@app/core";
import { describe, expect, it } from "vitest";

import { bookAway } from "@/lib/moves/away";
import { adminClient } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * Fair time away and swaps (20261129090000_fair_away.sql,
 * docs/specs/fair-away.md): a trip booked from today hands on what you can't
 * do before you go, and cancelling or undoing it hands back whatever is
 * still open; the Wall post stays and says it was cancelled; a swap token
 * trades only Johns not yet due.
 *
 * Every time is relative to the moment the test runs; a trip starts today in
 * the house's zone and its John is due 6 hours from now, inside it whenever
 * the suite runs.
 */

const HOUR = 3_600_000;
const db = adminClient();

/** One John, held by the first person, due 6 hours from now. */
async function dueSoon(names: string[]) {
  const house = await makeHouse(names);
  await addJohns(house.id, [{ name: "Bins", points: 5 }], thisWeek());
  const { assignments } = await deal(house.id, thisWeek(), rightNow());
  const a = assignments[0];
  const owner = house.everyone[0];
  expectOk(
    await db
      .from("assignments")
      .update({ user_id: owner.userId, due_at: fromNow(6 * HOUR).toISOString() })
      .eq("id", a.id),
  );
  const today = localDate(rightNow(), ZONE);
  return { house, a, owner, today, trip: { from: today, to: addDaysTo(today, 2) } };
}

async function tripOf(userId: string, from: string) {
  const { data } = await db.from("away_periods").select("id").eq("user_id", userId).eq("starts_on", from).single();
  return data!.id;
}

async function awayPost(houseId: string) {
  const { data } = await db.from("events").select("data").eq("house_id", houseId).eq("kind", "away");
  return data ?? [];
}

describe("a trip booked from today", () => {
  it("hands its John on, and cancelling hands it back with the Wall post kept", async () => {
    const { house, a, owner, trip } = await dueSoon(["Ava", "Ben"]);
    const ben = house.everyone[1];
    const booked = await bookAway({ db: owner.db, userId: owner.userId }, trip, rightNow());
    expect(booked).toEqual({ before: 0, handed: 1, skipped: 0 });
    const handed = await reread("assignments", a.id);
    expect([handed.user_id, handed.handed_from_user_id]).toEqual([ben.userId, owner.userId]);

    expectOk(await owner.db.rpc("cancel_away", { p_away: await tripOf(owner.userId, trip.from) }));
    const back = await reread("assignments", a.id);
    expect([back.user_id, back.handed_from_user_id, back.handed_by_away_period_id, back.excused]).toEqual([owner.userId, null, null, false]);
    const [post] = await awayPost(house.id);
    expect(post.data).toMatchObject({ handed: 1, cancelled: true });
  });

  it("skips its John with nobody home, and cancelling un-skips it", async () => {
    const { a, owner, trip } = await dueSoon(["Ava"]);
    expectOk(await owner.db.rpc("set_away", { p_starts: trip.from, p_ends: trip.to }));
    expect((await reread("assignments", a.id)).excused).toBe(true);
    expectOk(await owner.db.rpc("cancel_away", { p_away: await tripOf(owner.userId, trip.from) }));
    const back = await reread("assignments", a.id);
    expect([back.user_id, back.excused]).toEqual([owner.userId, false]);
  });

  it("hands it back when the trip is undone, too", async () => {
    const { house, a, owner, trip } = await dueSoon(["Ava", "Ben"]);
    expectOk(await owner.db.rpc("set_away", { p_starts: trip.from, p_ends: trip.to }));
    const { data: action } = await db.from("house_actions").select("id").eq("house_id", house.id).eq("kind", "away").single();
    expectOk(await owner.db.rpc("undo_action", { p_action: action!.id }));
    expect((await reread("assignments", a.id)).user_id).toBe(owner.userId);
    const [post] = await awayPost(house.id);
    expect(post.data).toMatchObject({ cancelled: true });
  });

  it("leaves a John the housemate already ticked with them", async () => {
    const { house, a, owner, trip } = await dueSoon(["Ava", "Ben"]);
    const ben = actorFor(house, house.everyone[1].userId);
    expectOk(await owner.db.rpc("set_away", { p_starts: trip.from, p_ends: trip.to }));
    expectOk(await ben.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await owner.db.rpc("cancel_away", { p_away: await tripOf(owner.userId, trip.from) }));
    expect((await reread("assignments", a.id)).user_id).toBe(ben.userId);
  });
});

describe("a swap token", () => {
  async function twoJohns() {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await addJohns(house.id, [{ name: "Bins", points: 2 }, { name: "Bathroom", points: 4 }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), rightNow());
    const [mine, theirs] = assignments;
    for (const x of assignments) {
      expectOk(await db.from("assignments").update({ due_at: fromNow(10 * HOUR).toISOString() }).eq("id", x.id));
    }
    const me = actorFor(house, mine.user_id);
    expectOk(await db.from("members").update({ swap_tokens: 1 }).eq("user_id", me.userId));
    return { mine, theirs, me };
  }

  it("can't trade away a John already overdue", async () => {
    const { mine, theirs, me } = await twoJohns();
    expectOk(await db.from("assignments").update({ due_at: fromNow(-20 * HOUR).toISOString() }).eq("id", mine.id));
    expectRule(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }), "swap_due");
  });

  it("can't take a housemate's John already overdue", async () => {
    const { mine, theirs, me } = await twoJohns();
    expectOk(await db.from("assignments").update({ due_at: fromNow(-HOUR).toISOString() }).eq("id", theirs.id));
    expectRule(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }), "swap_due");
  });

  it("trades two Johns not yet due", async () => {
    const { mine, theirs, me } = await twoJohns();
    expectOk(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }));
    expect((await reread("assignments", theirs.id)).user_id).toBe(me.userId);
  });
});
