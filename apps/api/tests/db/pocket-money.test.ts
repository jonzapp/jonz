import { monthOf, nextWeek } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";

/**
 * Pocket money and Pay day, family step 3 (docs/specs/family-houses.md): a
 * kid's John earns what it says once their tick stands, up to the family's
 * monthly cap, and after the month a parent taps Paid. Parents' own Johns
 * earn nothing. Housemates don't change.
 *
 * Every John here is dealt next week and settled with a pretend time past
 * that week's end. Pay day is tested on months far in the past or future,
 * so nothing hangs on when the suite runs.
 */

const HOUR = 3_600_000;
const db = adminClient();
const WEEK = nextWeek(thisWeek(), ZONE, 1);
const LATER = new Date(WEEK.endsAt.getTime() + 2 * 24 * HOUR);

/** A family (Sam the parent, Leo and Maya the kids) with these Johns, all dealt to `to`. */
async function family(johns: { name: string; pay: number }[], to: "Sam" | "Leo" | "Maya" = "Leo") {
  const house = await makeHouse(["Sam", "Leo", "Maya"], "family");
  const [sam, leo, maya] = house.everyone;
  await addJohns(house.id, johns, WEEK);
  const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
  const holder = { Sam: sam, Leo: leo, Maya: maya }[to];
  for (const a of assignments) {
    expectOk(await db.from("assignments").update({ user_id: holder.userId }).eq("id", a.id).select("id"));
  }
  return { house, sam, leo, maya, assignments };
}

async function earnings(houseId: string) {
  const { data } = await db.from("pocket_earnings").select("user_id, month, amount_minor").eq("house_id", houseId);
  return data!;
}

describe("a family's pocket money", () => {
  it("starts at up to £10 a month each", async () => {
    const house = await makeHouse(["Sam", "Leo"], "family");
    const { data } = await db.from("houses").select("pocket_cap_minor").eq("id", house.id).single();
    expect(data!.pocket_cap_minor).toBe(1000);
    const mates = await makeHouse(["Ava", "Ben"]);
    const { data: theirs } = await db.from("houses").select("pocket_cap_minor").eq("id", mates.id).single();
    expect(theirs!.pocket_cap_minor).toBe(0);
  });

  it("is earned once a kid's tick stands, in the month it was due", async () => {
    const { house, sam, leo, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    const a = assignments[0];
    expect(a.pay_minor).toBe(20);
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    await tickHouse(db, house.id, LATER);
    // Still waiting for an OK: nothing earned yet.
    expect(await earnings(house.id)).toEqual([]);
    expectOk(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }));
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", a.id)).outcome).toBe("done");
    expect(await earnings(house.id)).toEqual([
      { user_id: leo.userId, month: monthOf(new Date(a.due_at), ZONE), amount_minor: 20 },
    ]);
  });

  it("stops at the monthly cap", async () => {
    const { house, sam, leo, assignments } = await family([
      { name: "Feed the fish", pay: 80 },
      { name: "Tidy your room", pay: 80 },
    ]);
    expectOk(await sam.db.from("houses").update({ pocket_cap_minor: 100 }).eq("id", house.id).select("id"));
    for (const a of assignments) {
      expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
      expectOk(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }));
    }
    await tickHouse(db, house.id, LATER);
    const rows = await earnings(house.id);
    expect(rows.map((r) => r.amount_minor).sort((x, y) => x - y)).toEqual([20, 80]);
  });

  it("isn't earned by a parent's own John", async () => {
    const { house, sam, assignments } = await family([{ name: "Cook tea", pay: 50 }], "Sam");
    expectOk(await sam.db.rpc("mark_done", { p_assignment: assignments[0].id }));
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", assignments[0].id)).outcome).toBe("done");
    expect(await earnings(house.id)).toEqual([]);
  });

  it("isn't earned when a tick is sent back, or a John is missed", async () => {
    const { house, sam, leo, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    const a = assignments[0];
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: false }));
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", a.id)).outcome).toBe("missed");
    expect(await earnings(house.id)).toEqual([]);
  });

  it("follows a parent's change to what a John earns, for the week still open", async () => {
    const { house, sam, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    const a = assignments[0];
    const johnId = a.john_id!;
    expectOk(await sam.db.from("johns").update({ pay_minor: 30 }).eq("id", johnId).select("id"));
    expect((await reread("assignments", a.id)).pay_minor).toBe(30);
    // Only a parent can change it: a kid's write reaches nothing.
    const kid = house.everyone[1];
    const { data } = await kid.db.from("johns").update({ pay_minor: 500 }).eq("id", johnId).select("id");
    expect(data).toEqual([]);
  });

  it("is never earned by housemates", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins", pay: 50 }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    expect(assignments[0].pay_minor).toBe(0);
  });
});

describe("Pay day", () => {
  const PAST = "2020-01";

  async function earned(house: { id: string }, kid: { userId: string }, assignmentId: string, amount: number) {
    expectOk(
      await db
        .from("pocket_earnings")
        .insert({ assignment_id: assignmentId, house_id: house.id, user_id: kid.userId, month: PAST, amount_minor: amount })
        .select("assignment_id"),
    );
  }

  it("pays a kid what they earned in a month that's over, once", async () => {
    const { house, sam, leo, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    await earned(house, leo, assignments[0].id, 650);
    const res = await sam.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: PAST });
    expect(res.data).toBe(650);
    const { data: pays } = await db.from("pocket_pays").select("user_id, month, amount_minor, paid_by").eq("house_id", house.id);
    expect(pays).toEqual([{ user_id: leo.userId, month: PAST, amount_minor: 650, paid_by: sam.userId }]);
    const { data: wall } = await db.from("events").select("user_id, data").eq("house_id", house.id).eq("kind", "pocket_paid");
    expect(wall).toEqual([{ user_id: sam.userId, data: { to: leo.userId, amount: 650, month: PAST } }]);
    expectRule(await sam.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: PAST }), "nothing_to_pay");
  });

  it("waits for the month to end", async () => {
    const { house, sam, leo } = await family([{ name: "Feed the fish", pay: 20 }]);
    expectRule(await sam.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: "2999-01" }), "not_pay_day_yet");
  });

  it("is a parent's to say", async () => {
    const { house, leo, maya, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    await earned(house, leo, assignments[0].id, 100);
    expectRule(await maya.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: PAST }), "parents_only");
    expectRule(await leo.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: PAST }), "parents_only");
    const other = await makeHouse(["Pat"], "family");
    expectDenied(await other.admin.db.rpc("pay_pocket_money", { p_house: house.id, p_kid: leo.userId, p_month: PAST }));
  });

  it("can't be written by anyone but the clock and Paid", async () => {
    const { house, sam, leo, assignments } = await family([{ name: "Feed the fish", pay: 20 }]);
    const res = await sam.db
      .from("pocket_earnings")
      .insert({ assignment_id: assignments[0].id, house_id: house.id, user_id: leo.userId, month: PAST, amount_minor: 1000 });
    expect(res.error).not.toBeNull();
    const pay = await sam.db
      .from("pocket_pays")
      .insert({ house_id: house.id, user_id: leo.userId, month: PAST, amount_minor: 1000 });
    expect(pay.error).not.toBeNull();
  });
});
