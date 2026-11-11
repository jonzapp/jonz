import { PASS_TRIAL_DAYS, hasPass, passOf } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, thisWeek } from "@/tests/support/factories";

/**
 * The House Pass lives on the house. Every new house starts its free month,
 * housemates can read the Pass, and nobody but the service role (the store
 * webhook, later) can write it, admins included.
 */

describe("the House Pass", () => {
  it("starts a free month for every new house", async () => {
    const before = Date.now();
    const house = await makeHouse(["Ava"]);
    const { data: row } = await adminClient()
      .from("houses")
      .select("pass_plan, pass_ends_at, pass_bought_by")
      .eq("id", house.id)
      .single();
    expect(row!.pass_plan).toBe("trial");
    expect(row!.pass_bought_by).toBeNull();
    const until = Date.parse(row!.pass_ends_at!);
    const days = (until - before) / 86_400_000;
    expect(days).toBeGreaterThan(PASS_TRIAL_DAYS - 0.01);
    expect(days).toBeLessThan(PASS_TRIAL_DAYS + 0.01);
    expect(hasPass(passOf(row!), new Date())).toBe(true);
  });

  it("is read by everyone in the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { data } = await house.members[0].db.from("houses").select("pass_plan, pass_ends_at").eq("id", house.id).single();
    expect(data!.pass_plan).toBe("trial");
  });

  it("cannot be written by a housemate, even an admin", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const forever = { pass_plan: "founding", pass_ends_at: null };
    expectDenied(await house.admin.db.from("houses").update(forever).eq("id", house.id));
    expectDenied(await house.members[0].db.from("houses").update(forever).eq("id", house.id));
    expectDenied(await house.admin.db.from("houses").update({ pass_bought_by: house.admin.userId }).eq("id", house.id));
    expect((await reread("houses", house.id)).pass_plan).toBe("trial");
  });

  it("keeps its shape: only a Founding house has no end", async () => {
    const house = await makeHouse(["Ava"]);
    const db = adminClient();
    expect((await db.from("houses").update({ pass_plan: "yearly", pass_ends_at: null }).eq("id", house.id)).error).not.toBeNull();
    expect(
      (await db.from("houses").update({ pass_plan: "founding", pass_ends_at: new Date().toISOString() }).eq("id", house.id)).error,
    ).not.toBeNull();
    expect((await db.from("houses").update({ pass_plan: "gold" }).eq("id", house.id)).error).not.toBeNull();
    expect((await db.from("houses").update({ pass_plan: "founding", pass_ends_at: null }).eq("id", house.id)).error).toBeNull();
  });
});

/**
 * Without the Pass (20270106090000_pass_on.sql): a photo John ticks without
 * a photo, and History reads the last four weeks only. Each test ends the
 * house's free month a day before the database's own now, so it holds
 * whatever the date.
 */
describe("without the House Pass", () => {
  const DAY = 86_400_000;

  async function endPass(houseId: string) {
    const ended = new Date(Date.now() - DAY).toISOString();
    expectOk(await adminClient().from("houses").update({ pass_plan: "trial", pass_ends_at: ended }).eq("id", houseId).select("id"));
  }

  async function photoJohn() {
    const house = await makeHouse(["Ava"]);
    await addJohns(house.id, [{ name: "Oven", points: 5, needsPhoto: true } as never], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    return { house, a: assignments[0] };
  }

  it("still asks for a photo on a photo John while the house has the Pass", async () => {
    const { house, a } = await photoJohn();
    expectRule(await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }), "photo_required");
  });

  it("ticks a photo John without one once the Pass has ended", async () => {
    const { house, a } = await photoJohn();
    await endPass(house.id);
    expectOk(await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();
  });

  it("shows History's last four weeks, and older moves only with the Pass", async () => {
    const { house, a } = await photoJohn();
    const me = actorFor(house, a.user_id);
    expectOk(await me.db.rpc("mark_done", { p_assignment: a.id, p_photo_path: `${house.id}/${a.id}/x.jpg` }));
    const db = adminClient();
    const { data: moves } = await db.from("house_actions").select("id").eq("house_id", house.id);
    expect(moves!.length).toBeGreaterThan(0);
    const old = moves![0].id;
    expectOk(await db.from("house_actions").update({ created_at: new Date(Date.now() - 40 * DAY).toISOString() }).eq("id", old).select("id"));
    const read = async () => ((await me.db.rpc("house_history", { p_house: house.id })).data ?? []).map((r: { id: string }) => r.id);

    expect(await read()).toContain(old);
    await endPass(house.id);
    const without = await read();
    expect(without).not.toContain(old);
    expect(without.length).toBe(moves!.length - 1);
    expectOk(await db.from("houses").update({ pass_plan: "founding", pass_ends_at: null }).eq("id", house.id).select("id"));
    expect(await read()).toContain(old);
  });
});
