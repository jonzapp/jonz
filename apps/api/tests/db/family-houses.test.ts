import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, ZONE } from "@/tests/support/factories";
import { track } from "@/tests/support/scope";

/**
 * Family houses, step 1 (docs/specs/family-houses.md): the kind is picked
 * when a house starts, a family has no stake and can't be given one, a move
 * keeps the old house's kind, and a join link says which kind it opens.
 */

const db = adminClient();

async function startFamily(name = "Sam") {
  const parent = await signedInUser(name);
  const started = await parent.db.rpc("create_house", {
    p_name: "The Parks",
    p_timezone: ZONE,
    p_currency: "USD",
    p_week_starts: 1,
    p_kind: "family",
  });
  expectOk(started);
  track.house(started.data!);
  return { parent, id: started.data! };
}

describe("create_house with a kind", () => {
  it("starts a family with no stake and no forfeits, and you as its parent", async () => {
    const { parent, id } = await startFamily();
    const { data: house } = await db.from("houses").select("kind, stake_minor, late_forfeit_minor, missed_forfeit_minor").eq("id", id).single();
    expect(house).toEqual({ kind: "family", stake_minor: 0, late_forfeit_minor: 0, missed_forfeit_minor: 0 });
    const { data: me } = await db.from("members").select("role").eq("house_id", id).eq("user_id", parent.userId).single();
    expect(me!.role).toBe("admin");
  });

  it("starts housemates as before when the kind isn't said", async () => {
    const house = await makeHouse(["Ava"]);
    const { data } = await db.from("houses").select("kind, stake_minor, late_forfeit_minor, missed_forfeit_minor").eq("id", house.id).single();
    expect(data).toEqual({ kind: "housemates", stake_minor: 2000, late_forfeit_minor: 100, missed_forfeit_minor: 300 });
  });

  it("refuses a kind it doesn't know", async () => {
    const who = await signedInUser("Odd");
    expectRule(
      await who.db.rpc("create_house", { p_name: "Odd", p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1, p_kind: "commune" }),
      "bad_kind",
    );
  });
});

describe("a family's money", () => {
  it("can't be given a stake or a forfeit, even by its parent", async () => {
    const { parent, id } = await startFamily("Alex");
    for (const change of [{ stake_minor: 500 }, { late_forfeit_minor: 50 }, { missed_forfeit_minor: 100 }]) {
      const res = await parent.db.from("houses").update(change).eq("id", id).select("id");
      expect(res.error?.message ?? "").toContain("houses_family_no_stake");
    }
    // Everything else a parent sets as an admin does.
    expectOk(await parent.db.from("houses").update({ cover_grace_hours: 6 }).eq("id", id).select("id"));
  });

  it("can't be made a family while it has a stake", async () => {
    const house = await makeHouse(["Ava"]);
    const res = await db.from("houses").update({ kind: "family" }).eq("id", house.id);
    expect(res.error?.message ?? "").toContain("houses_family_no_stake");
  });

  it("isn't a kind a parent can change by hand", async () => {
    const { parent, id } = await startFamily("Kim");
    const res = await parent.db.from("houses").update({ kind: "housemates" }).eq("id", id).select("id");
    expect(res.error).not.toBeNull();
    const { data } = await db.from("houses").select("kind").eq("id", id).single();
    expect(data!.kind).toBe("family");
  });
});

describe("moving on from a family", () => {
  it("starts the next house as a family too", async () => {
    const { id } = await startFamily("Jo");
    // A grown-up kid moves out and starts a place of their own.
    const kid = await signedInUser("Lee");
    const { data: house } = await db.from("houses").select("join_code").eq("id", id).single();
    expectOk(await kid.db.rpc("join_house", { p_code: house!.join_code }));
    expectOk(await kid.db.rpc("remove_member", { p_house: id, p_user: kid.userId }));

    const next = await kid.db.rpc("start_house_from", {
      p_from: id,
      p_name: "The Parks, new place",
      p_timezone: ZONE,
      p_currency: "USD",
      p_week_starts: 1,
    });
    expectOk(next);
    track.house(next.data!);
    const { data } = await db.from("houses").select("kind, stake_minor").eq("id", next.data!).single();
    expect(data).toEqual({ kind: "family", stake_minor: 0 });
  });
});

describe("house_by_code", () => {
  it("says which kind of house a join link opens", async () => {
    const { id } = await startFamily("Pat");
    const { data: house } = await db.from("houses").select("join_code").eq("id", id).single();
    const visitor = await signedInUser("Maya");
    const { data } = await visitor.db.rpc("house_by_code", { p_code: house!.join_code });
    expect(data).toEqual([{ id, name: "The Parks", members: 1, kind: "family" }]);
  });
});
