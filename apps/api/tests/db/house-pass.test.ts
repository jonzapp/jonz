import { PASS_TRIAL_DAYS, hasPass, passOf } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient } from "@/tests/support/clients";
import { expectDenied } from "@/tests/support/expect";
import { makeHouse, reread } from "@/tests/support/factories";

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
