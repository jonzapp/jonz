import { describe, expect, it } from "vitest";

import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";

/**
 * Switching a house between housemates and a family, from Rules
 * (docs/specs/family-houses.md, "Switching a house"). A house with money in
 * it becomes a family on the 1st, once its month is settled; one without
 * changes at once. Back to housemates is at once, unless a kid doesn't sign in.
 */

const db = adminClient();
const DAY = 24 * 3600 * 1000;

async function houseRow(id: string) {
  const { data } = await db
    .from("houses")
    .select("kind, next_kind, next_kind_on, stake_minor, late_forfeit_minor, missed_forfeit_minor, dispute_hours, pocket_cap_minor")
    .eq("id", id)
    .single();
  return data!;
}

async function wallKinds(id: string) {
  const { data } = await db.from("events").select("data").eq("house_id", id).eq("kind", "kind_changed").order("created_at");
  return (data ?? []).map((e) => e.data);
}

describe("set_house_kind", () => {
  it("waits for the 1st when the house has a stake, then the clock makes it a family", async () => {
    const house = await makeHouse(["Sam", "Alex"]);
    const res = await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" });
    expectOk(res);
    const on = res.data!;
    // The 1st of a month, within the next month.
    expect(on.endsWith("-01")).toBe(true);
    const until = Date.parse(`${on}T12:00:00Z`) - rightNow().getTime();
    expect(until).toBeGreaterThan(-DAY);
    expect(until).toBeLessThan(33 * DAY);

    // Nothing changes yet: the month is settled as usual first.
    expect(await houseRow(house.id)).toMatchObject({ kind: "housemates", next_kind: "family", next_kind_on: on, stake_minor: 2000 });
    expect(await wallKinds(house.id)).toEqual([{ kind: "family", on }]);

    const day = Date.parse(`${on}T12:00:00Z`);
    const month = new Date(day - DAY).toISOString().slice(0, 7);
    // On the day, before the month before it is closed: still waiting.
    expectOk(await db.rpc("apply_next_kind", { p_house: house.id, p_now: new Date(day).toISOString() }));
    expect((await houseRow(house.id)).kind).toBe("housemates");
    // The day before it: still waiting, closed or not.
    expectOk(await db.from("month_closes").insert({ house_id: house.id, month }));
    const early = await db.rpc("apply_next_kind", { p_house: house.id, p_now: new Date(day - DAY).toISOString() });
    expect(early.data).toBe(false);
    // Closed and the day has come: a family, with no money and no window.
    const applied = await db.rpc("apply_next_kind", { p_house: house.id, p_now: new Date(day).toISOString() });
    expect(applied.data).toBe(true);
    expect(await houseRow(house.id)).toEqual({
      kind: "family",
      next_kind: null,
      next_kind_on: null,
      stake_minor: 0,
      late_forfeit_minor: 0,
      missed_forfeit_minor: 0,
      dispute_hours: 0,
      pocket_cap_minor: 1000,
    });
    expect(await wallKinds(house.id)).toEqual([{ kind: "family", on }, { kind: "family" }]);
  });

  it("goes ahead a week after the day if that month never closes", async () => {
    const house = await makeHouse(["Kim"]);
    const on = (await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" })).data!;
    const day = Date.parse(`${on}T12:00:00Z`);
    expect((await db.rpc("apply_next_kind", { p_house: house.id, p_now: new Date(day + 6 * DAY).toISOString() })).data).toBe(false);
    expect((await db.rpc("apply_next_kind", { p_house: house.id, p_now: new Date(day + 7 * DAY).toISOString() })).data).toBe(true);
    expect((await houseRow(house.id)).kind).toBe("family");
  });

  it("changes at once when there's no money in it", async () => {
    const house = await makeHouse(["Lee", "Mo"]);
    expectOk(await db.from("houses").update({ stake_minor: 0, late_forfeit_minor: 0, missed_forfeit_minor: 0 }).eq("id", house.id));
    const res = await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" });
    expectOk(res);
    expect(res.data).toBeNull();
    expect(await houseRow(house.id)).toMatchObject({ kind: "family", next_kind: null, dispute_hours: 0, pocket_cap_minor: 1000 });
  });

  it("cancels a change that's waiting when you pick what the house is", async () => {
    const house = await makeHouse(["Ana"]);
    expectOk(await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" }));
    const kept = await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "housemates" });
    expectOk(kept);
    expect(kept.data).toBeNull();
    expect(await houseRow(house.id)).toMatchObject({ kind: "housemates", next_kind: null, next_kind_on: null, stake_minor: 2000 });
    expect((await wallKinds(house.id)).at(-1)).toEqual({ kind: "housemates", kept: true });
  });

  it("turns a family back into housemates at once, and lets waiting ticks stand", async () => {
    const house = await makeHouse(["Pat", "Jo"], "family");
    const { data: week } = await db
      .from("weeks")
      .insert({ house_id: house.id, starts_on: "2020-01-06", starts_at: "2020-01-06T00:00:00Z", ends_at: "2020-01-13T00:00:00Z" })
      .select("id")
      .single();
    const { data: a } = await db
      .from("assignments")
      .insert({
        week_id: week!.id,
        house_id: house.id,
        user_id: house.members[0].userId,
        name: "Feed the fish",
        category: "errands",
        points: 1,
        due_at: "2020-01-12T18:00:00Z",
        awaits_ok: true,
      })
      .select("id")
      .single();
    const res = await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "housemates" });
    expectOk(res);
    expect(await houseRow(house.id)).toMatchObject({ kind: "housemates", dispute_hours: 24, stake_minor: 0 });
    const { data: after } = await db.from("assignments").select("awaits_ok").eq("id", a!.id).single();
    expect(after!.awaits_ok).toBe(false);
  });

  it("keeps a family while a kid doesn't sign in", async () => {
    const house = await makeHouse(["Ray", "Zoe"], "family");
    expectOk(await db.from("members").update({ signs_in: false }).eq("house_id", house.id).eq("user_id", house.members[0].userId));
    expectRule(await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "housemates" }), "kids_without_sign_in");
    expect((await houseRow(house.id)).kind).toBe("family");
  });

  it("is for admins only, and only in your own house", async () => {
    const house = await makeHouse(["Una", "Vic"]);
    expectDenied(await house.members[0].db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" }));
    const other = await makeHouse(["Wes"]);
    expectDenied(await other.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "family" }));
    expectRule(await house.admin.db.rpc("set_house_kind", { p_house: house.id, p_kind: "commune" }), "bad_kind");
    expect((await houseRow(house.id)).kind).toBe("housemates");
  });

  it("isn't something anyone can call the clock's half of", async () => {
    const house = await makeHouse(["Xan"]);
    expectDenied(await house.admin.db.rpc("apply_next_kind", { p_house: house.id, p_now: rightNow().toISOString() }));
  });
});
