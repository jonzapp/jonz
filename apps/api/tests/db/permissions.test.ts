import { OWNER_PERMISSIONS, OWNER_ROLE_PERMISSIONS, OWNER_ROLES, PERMISSIONS, ROLE_PERMISSIONS, weekIndex } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { addJohns, makeHouse, thisWeek } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";

/**
 * Who can do what (supabase/migrations/20270112090000_baseline.sql): the
 * database's list matches packages/core's, can() and my_permissions answer
 * for the person asking, and the moves that were admin-only still are,
 * now through the list. A blocked write is proven by reading back.
 */

const db = adminClient();

describe("the permissions list", () => {
  it("is the same in the database as in packages/core", async () => {
    const { data: names } = await db.from("permissions").select("name, about, scope").order("name");
    const about = (scope: string) => Object.fromEntries(names!.filter((p) => p.scope === scope).map((p) => [p.name, p.about]));
    expect(about("house")).toEqual(PERMISSIONS);
    expect(about("app")).toEqual(OWNER_PERMISSIONS);
    const { data: rows } = await db.from("role_permissions").select("role, permission");
    for (const role of ["admin", "member"] as const) {
      const theirs = rows!.filter((r) => r.role === role).map((r) => r.permission).sort();
      expect(theirs, role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
    const { data: appRows } = await db.from("app_role_permissions").select("role, permission");
    for (const role of OWNER_ROLES) {
      const theirs = appRows!.filter((r) => r.role === role).map((r) => r.permission).sort();
      expect(theirs, role).toEqual([...OWNER_ROLE_PERMISSIONS[role]].sort());
    }
  });

  it("can be read by anyone signed in, and changed by nobody", async () => {
    const someone = await signedInUser("Reader");
    const { data } = await someone.db.from("role_permissions").select("permission").eq("role", "member");
    expect(data!.length).toBe(ROLE_PERMISSIONS.member.length);
    await someone.db.from("role_permissions").insert({ role: "member", permission: "johns:write" });
    const { data: after } = await db.from("role_permissions").select("permission").eq("role", "member").eq("permission", "johns:write");
    expect(after).toEqual([]);
  });
});

describe("can and my_permissions", () => {
  it("answer for the person asking, by their role in the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expect((await house.admin.db.rpc("can", { h: house.id, perm: "johns:write" })).data).toBe(true);
    expect((await ben.db.rpc("can", { h: house.id, perm: "johns:write" })).data).toBe(false);
    expect((await ben.db.rpc("can", { h: house.id, perm: "away:write_own" })).data).toBe(true);
    const { data: mine } = await ben.db.rpc("my_permissions", { h: house.id });
    expect([...mine!].sort()).toEqual([...ROLE_PERMISSIONS.member].sort());
  });

  it("say nothing outside the house", async () => {
    const house = await makeHouse(["Ava"]);
    const outsider = await signedInUser("Nosy");
    expect((await outsider.db.rpc("can", { h: house.id, perm: "house:read" })).data).toBe(false);
    expect((await outsider.db.rpc("my_permissions", { h: house.id })).data).toEqual([]);
  });

  it("follow a hand-over at once", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectOk(await house.admin.db.rpc("hand_over", { p_house: house.id, p_to: ben.userId }));
    expect((await ben.db.rpc("can", { h: house.id, perm: "johns:write" })).data).toBe(true);
    expect((await house.admin.db.rpc("can", { h: house.id, perm: "johns:write" })).data).toBe(false);
  });

  it("only the server may ask about someone else", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectDenied(await ben.db.rpc("user_can", { h: house.id, who: house.admin.userId, perm: "johns:write" }));
    expect((await db.rpc("user_can", { h: house.id, who: house.admin.userId, perm: "johns:write" })).data).toBe(true);
  });
});

describe("the John list", () => {
  // A week far from today, so nothing here depends on the clock.
  const week = thisWeek(new Date("2026-03-02T12:00:00Z"));
  const row = (houseId: string, name: string) => ({
    house_id: houseId,
    name,
    points: 1,
    every_weeks: 1,
    due_dow: 4,
    due_time: "20:00",
    anchor_week: weekIndex(week.startsOn),
  });
  async function aJohn(houseId: string) {
    const [john] = await addJohns(houseId, [{ name: "Bins out", points: 1 }], week);
    return john.id;
  }

  it("an admin adds, changes and takes Johns off", async () => {
    const house = await makeHouse(["Ava"]);
    expectOk(await house.admin.db.from("johns").insert(row(house.id, "Kitchen")));
    const id = await aJohn(house.id);
    expectOk(await house.admin.db.from("johns").update({ points: 2 }).eq("id", id));
    expectOk(await house.admin.db.from("johns").update({ archived_at: rightNow().toISOString() }).eq("id", id));
    const { data } = await db.from("johns").select("points, archived_at").eq("id", id).single();
    expect(data!.points).toBe(2);
    expect(data!.archived_at).not.toBeNull();
  });

  it("a member can't add, change or take one off", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    await ben.db.from("johns").insert(row(house.id, "Sneaky"));
    const id = await aJohn(house.id);
    await ben.db.from("johns").update({ points: 9 }).eq("id", id);
    await ben.db.from("johns").update({ archived_at: rightNow().toISOString() }).eq("id", id);
    const { data: list } = await db.from("johns").select("name, points, archived_at").eq("house_id", house.id);
    expect(list).toEqual([{ name: "Bins out", points: 1, archived_at: null }]);
  });

  it("a member can't change the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    await ben.db.from("houses").update({ name: "Ben's now" }).eq("id", house.id);
    const { data } = await db.from("houses").select("name").eq("id", house.id).single();
    expect(data!.name).toBe("Ava's house");
  });
});

describe("admin moves, through the list", () => {
  it("a member can't make groups, reset the code or change roles", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectDenied(await ben.db.rpc("save_group", { p_house: house.id, p_group: null as unknown as string, p_name: "Upstairs", p_members: [ben.userId] }));
    expectDenied(await ben.db.rpc("reset_join_code", { p_house: house.id }));
    expectDenied(await ben.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
    expectDenied(await ben.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }));
    const { data: members } = await db.from("members").select("user_id, role").eq("house_id", house.id).order("joined_at");
    expect(members!.map((m) => m.role)).toEqual(["admin", "member"]);
  });

  it("an admin still can", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectOk(await house.admin.db.rpc("save_group", { p_house: house.id, p_group: null as unknown as string, p_name: "Upstairs", p_members: [ben.userId] }));
    expectOk(await house.admin.db.rpc("reset_join_code", { p_house: house.id }));
    expectOk(await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
  });
});
