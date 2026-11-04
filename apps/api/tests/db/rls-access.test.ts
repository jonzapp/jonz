import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, visitor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek } from "@/tests/support/factories";

/**
 * Who can see and touch a house. RLS is the only real enforcement: the app's
 * own checks are UX. Every blocked write is proven by reading the row back
 * through the service role, never by trusting `error === null`.
 */

async function codeOf(houseId: string) {
  const { data } = await adminClient().from("houses").select("join_code").eq("id", houseId).single();
  return data!.join_code;
}

const TABLES = [
  "profiles", "houses", "members", "johns", "weeks", "assignments", "disputes",
  "dispute_votes", "ledger", "month_closes", "events", "reactions", "push_subscriptions",
] as const;

describe("a signed-out visitor", () => {
  it("is granted no table at all", async () => {
    const anon = visitor();
    for (const table of TABLES) {
      expectDenied(await anon.from(table).select("*").limit(1));
    }
  });

  it("cannot look a join code up", async () => {
    const house = await makeHouse(["Ava"]);
    expectDenied(await visitor().rpc("house_by_code", { p_code: house.code }));
  });
});

describe("someone outside the house", () => {
  it("sees none of it", async () => {
    const house = await makeHouse();
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    await deal(house.id, thisWeek(), new Date());
    const outsider = await signedInUser("Nosy");
    for (const table of ["houses", "members", "johns", "weeks", "assignments", "events", "ledger"] as const) {
      const { data, error } = await outsider.db.from(table).select("*");
      expect(error).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: profiles } = await outsider.db.from("profiles").select("id");
    expect(profiles!.map((p) => p.id)).toEqual([outsider.userId]);
  });

  it("can read the house name from a code, and join with it", async () => {
    const house = await makeHouse(["Ava"]);
    const newcomer = await signedInUser("Dee");
    const { data } = await newcomer.db.rpc("house_by_code", { p_code: house.code.toLowerCase() });
    expect(data).toEqual([{ id: house.id, name: "Ava's house", members: 1, kind: "housemates" }]);
    expectOk(await newcomer.db.rpc("join_house", { p_code: house.code }));
    const { data: seen } = await newcomer.db.from("members").select("user_id").eq("house_id", house.id);
    expect(seen).toHaveLength(2);
  });

  it("gets nothing for a wrong code", async () => {
    const someone = await signedInUser("Dee");
    expectRule(await someone.db.rpc("join_house", { p_code: "NOPE1234" }), "unknown_code");
  });
});

describe("a housemate", () => {
  it("sees housemates' names", async () => {
    const house = await makeHouse();
    const { data } = await house.members[0].db.from("profiles").select("display_name").order("display_name");
    expect(data!.map((p) => p.display_name)).toEqual(["Ava", "Ben", "Cal"]);
  });

  it("belongs to one house at a time", async () => {
    const a = await makeHouse(["Ava"]);
    const b = await makeHouse(["Ben"]);
    expectRule(await b.admin.db.rpc("join_house", { p_code: a.code }), "already_in_house");
    expectRule(
      await a.admin.db.rpc("create_house", {
        p_name: "Second",
        p_timezone: "Europe/London",
        p_currency: "GBP",
        p_week_starts: 1,
      }),
      "already_in_house",
    );
  });

  it("cannot write the tables directly", async () => {
    const house = await makeHouse();
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const mine = assignments.find((a) => a.user_id === house.members[0].userId) ?? assignments[0];
    const me = house.everyone.find((a) => a.userId === mine.user_id)!;

    expectDenied(await me.db.from("assignments").update({ done_at: new Date().toISOString() }).eq("id", mine.id));
    expectDenied(await me.db.from("assignments").delete().eq("id", mine.id));
    expectDenied(
      await me.db.from("ledger").insert({
        house_id: house.id,
        user_id: me.userId,
        kind: "share",
        amount_minor: 500,
        month: "2026-10",
      }),
    );
    expectDenied(await me.db.from("members").update({ immunity_tokens: 2 }).eq("user_id", me.userId));
    expectDenied(await me.db.from("events").insert({ house_id: house.id, kind: "done" }));
    expectDenied(await me.db.from("weeks").delete().eq("house_id", house.id));

    expect((await reread("assignments", mine.id)).done_at).toBeNull();
  });

  it("cannot call the engine's functions", async () => {
    const house = await makeHouse(["Ava"]);
    const db = house.admin.db;
    expectDenied(
      await db.rpc("deal_week", {
        p_house: house.id,
        p_starts_on: "2026-10-05",
        p_starts_at: "2026-10-04T23:00:00Z",
        p_ends_at: "2026-10-11T23:00:00Z",
        p_assignments: [],
        p_shares: [],
      }),
    );
    expectDenied(await db.rpc("settle_assignments", { p_items: [] }));
    expectDenied(await db.rpc("close_week", { p_week: house.id, p_members: [] }));
    expectDenied(await db.rpc("close_month", { p_house: house.id, p_month: "2026-09", p_entries: [] }));
    expectDenied(await db.rpc("resolve_dispute", { p_dispute: house.id, p_resolution: "upheld" }));
  });

  it("cannot change the house settings unless an admin", async () => {
    const house = await makeHouse();
    const member = house.members[0];
    const res = await member.db.from("houses").update({ stake_minor: 1 }).eq("id", house.id);
    expect(res.error).toBeNull();
    expect((await reread("houses", house.id)).stake_minor).toBe(2000);

    expectOk(await house.admin.db.from("houses").update({ stake_minor: 1500 }).eq("id", house.id));
    expect((await reread("houses", house.id)).stake_minor).toBe(1500);
  });

  it("cannot set the clock's columns even as an admin", async () => {
    const house = await makeHouse(["Ava"]);
    expectDenied(
      await house.admin.db.from("houses").update({ first_dealt_at: new Date().toISOString() }).eq("id", house.id),
    );
    expectDenied(await house.admin.db.from("houses").update({ join_code: "AAAAAAAA" }).eq("id", house.id));
  });

  it("rejects a time zone that does not exist", async () => {
    const house = await makeHouse(["Ava"]);
    const res = await house.admin.db.from("houses").update({ timezone: "Mars/Olympus" }).eq("id", house.id);
    expectRule(res, "unknown_timezone");
  });

  it("can only add Johns as an admin", async () => {
    const house = await makeHouse();
    const row = { house_id: house.id, name: "Mop", anchor_week: 0 };
    expectDenied(await house.members[0].db.from("johns").insert(row));
    expectOk(await house.admin.db.from("johns").insert(row));
  });
});

describe("roles", () => {
  it("lets admins promote, and never strands a house without one", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    expectDenied(await ben.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
    expectRule(
      await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: house.admin.userId, p_role: "member" }),
      "last_admin",
    );
    expectOk(await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
    expectOk(
      await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: house.admin.userId, p_role: "member" }),
    );
  });

  it("lets anyone leave, but only admins remove others", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    expectDenied(await ben.db.rpc("remove_member", { p_house: house.id, p_user: cal.userId }));
    expectRule(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }), "last_admin");
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: cal.userId }));
    const { data } = await adminClient().from("members").select("user_id").eq("house_id", house.id);
    expect(data!.map((m) => m.user_id)).toEqual([house.admin.userId]);
    // The last one out can go too. The house stays, history and all, but closed (below).
    const { data: before } = await adminClient().from("houses").select("join_code").eq("id", house.id).single();
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }));
    const { data: left } = await adminClient().from("members").select("user_id").eq("house_id", house.id);
    expect(left).toEqual([]);
    const { data: empty } = await adminClient().from("houses").select("join_code").eq("id", house.id).single();
    expect(empty!.join_code).toBe(before!.join_code);
  });

  it("changes the code when an admin removes someone, so they can't walk back in", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    // Leaving of your own accord keeps the code: the rest of the house's link still works.
    expectOk(await cal.db.rpc("remove_member", { p_house: house.id, p_user: cal.userId }));
    expect(await codeOf(house.id)).toBe(house.code);

    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    const fresh = await codeOf(house.id);
    expect(fresh).not.toBe(house.code);
    expect(fresh).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    const { data: peek } = await ben.db.rpc("house_by_code", { p_code: house.code });
    expect(peek).toEqual([]);
    expectRule(await ben.db.rpc("join_house", { p_code: house.code }), "unknown_code");
    // Someone who leaves can still come back with the house's link as it is now.
    expectOk(await cal.db.rpc("join_house", { p_code: fresh }));
  });

  it("gives an admin, and only an admin, a new code", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectDenied(await ben.db.rpc("reset_join_code", { p_house: house.id }));
    expectDenied(await (await signedInUser("Nosy")).db.rpc("reset_join_code", { p_house: house.id }));
    expectDenied(await visitor().rpc("reset_join_code", { p_house: house.id }));
    expect(await codeOf(house.id)).toBe(house.code);

    const { data: code, error } = await house.admin.db.rpc("reset_join_code", { p_house: house.id });
    expect(error).toBeNull();
    expect(code).not.toBe(house.code);
    expect(await codeOf(house.id)).toBe(code);
    expectRule(await (await signedInUser("Dee")).db.rpc("join_house", { p_code: house.code }), "unknown_code");
  });

  it("closes a house once nobody is left: its code opens nothing, for a newcomer or the last one out", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }));

    const newcomer = await signedInUser("Dee");
    for (const who of [newcomer, house.admin, ben]) {
      const { data, error } = await who.db.rpc("house_by_code", { p_code: house.code });
      expect(error).toBeNull();
      expect(data, who.name).toEqual([]);
      expectRule(await who.db.rpc("join_house", { p_code: house.code }), "unknown_code");
    }
    const { data: members } = await adminClient().from("members").select("user_id").eq("house_id", house.id);
    expect(members).toEqual([]);
    // Closed, not gone: the house and what happened in it are still there.
    const { data: events } = await adminClient().from("events").select("kind").eq("house_id", house.id);
    expect(events!.map((e) => e.kind)).toContain("joined");
  });

  it("never lets a newcomer in alone as the last one leaves", async () => {
    // A race, run a few times: whichever goes first, the house ends up empty and
    // closed (the join is refused) or with both in and an admin still there (the
    // leave is refused). Never the newcomer alone, as a plain member.
    for (let round = 0; round < 6; round++) {
      const house = await makeHouse([`Ava ${round}`]);
      const newcomer = await signedInUser(`Dee ${round}`);
      const [leave, join] = await Promise.all([
        house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }),
        newcomer.db.rpc("join_house", { p_code: house.code }),
      ]);
      const { data: members } = await adminClient().from("members").select("user_id, role").eq("house_id", house.id);
      if (leave.error) {
        expectRule(leave, "last_admin");
        expectOk(join);
        expect(members).toHaveLength(2);
        expect(members).toContainEqual({ user_id: house.admin.userId, role: "admin" });
      } else {
        expectRule(join, "unknown_code");
        expect(members).toEqual([]);
      }
    }
  });

  it("keeps an admin when the only two step down at once", async () => {
    for (let round = 0; round < 6; round++) {
      const house = await makeHouse([`Ava ${round}`, `Ben ${round}`, `Cal ${round}`]);
      const [ben] = house.members;
      expectOk(await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
      const results = await Promise.all([
        house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }),
        ben.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "member" }),
      ]);
      expect(results.filter((r) => r.error)).toHaveLength(1);
      for (const r of results.filter((r) => r.error)) expectRule(r, "last_admin");
      const { data: admins } = await adminClient()
        .from("members")
        .select("user_id")
        .eq("house_id", house.id)
        .eq("role", "admin");
      expect(admins).toHaveLength(1);
    }
  });
});

describe("a push subscription", () => {
  it("has to be a browser's push service, so the API never posts anywhere else", async () => {
    const me = await signedInUser("Ava");
    const device = (endpoint: string) => ({ user_id: me.userId, endpoint, p256dh: "p256dh", auth: "auth" });
    for (const endpoint of [
      "https://evil.example/hook",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      const { error } = await me.db.from("push_subscriptions").insert(device(endpoint));
      expect(error?.code, endpoint).toBe("23514");
    }
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGxyz",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expectOk(await me.db.from("push_subscriptions").insert(device(endpoint)));
    }
  });
});
