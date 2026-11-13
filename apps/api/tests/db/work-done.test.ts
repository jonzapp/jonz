import { nextWeek } from "@app/core";
import { describe, expect, it } from "vitest";

import { loadBalances } from "@/lib/engine/tick";
import { adminClient, signedInUser } from "@/tests/support/clients";
import { addJohns, deal, makeHouse, someoneElse, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";

/**
 * Balances count the work done, not what was handed out: a missed John
 * comes back to whoever missed it, and a cover counts for the coverer. They
 * remember every week, however long ago (house_balances).
 */

const db = adminClient();

async function oneJohnLastWeek() {
  const house = await makeHouse(["Ava", "Ben"]);
  const week = weeksAgo(1);
  await addJohns(house.id, [{ name: "Bathroom", points: 4 }], week);
  const { assignments } = await deal(house.id, week, week.startsAt);
  const a = assignments[0];
  const other = house.everyone.find((x) => x.userId !== a.user_id)!;
  const balances = async () =>
    (await loadBalances(db, house.id, nextWeek(week, ZONE, 1).startsOn, house.everyone.map((x) => x.userId))).balances;
  return { house, a, other, balances };
}

describe("balances count work done", () => {
  it("leaves a missed John with whoever missed it", async () => {
    const { a, other, balances } = await oneJohnLastWeek();
    await db.from("assignments").update({ outcome: "missed", settled_at: rightNow().toISOString() }).eq("id", a.id);
    const b = await balances();
    expect([b.get(a.user_id), b.get(other.userId)]).toEqual([-2, -2]);
  });

  it("counts a cover for whoever covered it", async () => {
    const { a, other, balances } = await oneJohnLastWeek();
    await db
      .from("assignments")
      .update({ outcome: "covered", settled_at: rightNow().toISOString(), covered_by: other.userId, done_at: rightNow().toISOString() })
      .eq("id", a.id);
    const b = await balances();
    expect([b.get(a.user_id), b.get(other.userId)]).toEqual([-2, 2]);
  });
});

describe("a skipped John", () => {
  it("counts as neither owed nor done: it comes out of the week", async () => {
    const { a, other, balances } = await oneJohnLastWeek();
    await db.from("assignments").update({ outcome: "excused", excused: true, settled_at: rightNow().toISOString() }).eq("id", a.id);
    const b = await balances();
    expect([b.get(a.user_id), b.get(other.userId)]).toEqual([0, 0]);
  });
});

describe("balances remember every week", () => {
  it("still counts a John from half a year ago", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = weeksAgo(26);
    await addJohns(house.id, [{ name: "Bathroom", points: 4 }], week);
    const { assignments } = await deal(house.id, week, week.startsAt);
    const a = assignments[0];
    const other = someoneElse(house, a.user_id);
    await db.from("assignments").update({ outcome: "missed", settled_at: rightNow().toISOString() }).eq("id", a.id);
    const { balances } = await loadBalances(db, house.id, thisWeek().startsOn, house.everyone.map((x) => x.userId));
    expect([balances.get(a.user_id), balances.get(other.userId)]).toEqual([-2, -2]);
  });

  it("is read by housemates through their own session, and by nobody else", async () => {
    const { house, a, other } = await oneJohnLastWeek();
    const before = thisWeek().startsOn;
    const mine = await other.db.rpc("house_balances", { p_house: house.id, p_before: before });
    expect(mine.error).toBeNull();
    expect(mine.data!.map((r) => [r.user_id, Number(r.owed), Number(r.credited)]).sort()).toEqual(
      [
        [a.user_id, 2, 4],
        [other.userId, 2, 0],
      ].sort(),
    );
    const outsider = await signedInUser("Nosy");
    const theirs = await outsider.db.rpc("house_balances", { p_house: house.id, p_before: before });
    expect(theirs.data ?? []).toEqual([]);
  });
});
