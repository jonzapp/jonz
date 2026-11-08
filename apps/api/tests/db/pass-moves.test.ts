import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { applyPassEvent } from "@/lib/pass/events";
import { stopCarriedPasses } from "@/lib/pass/moves";
import type { PassStripe, SubscriptionView } from "@/lib/pass/stripe";
import { adminClient, type Actor } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, ZONE, type House } from "@/tests/support/factories";
import { track } from "@/tests/support/scope";

/**
 * The Pass moves with the buyer (supabase/migrations/*_pass_moves.sql):
 * leaving takes it, the house left keeps 30 days, the next house gets it,
 * "leave it for the house" puts it back, and Stripe's renewals follow it.
 */

const db = adminClient();
const DAY = 86_400_000;
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

/** The house where Ben bought a yearly Pass, with Ava (admin) and Ben. */
async function bensPass(
  plan: "yearly" | "founding" = "yearly",
): Promise<{ house: House; ben: Actor; until: Date | null; sub: string }> {
  const house = await makeHouse(["Ava", "Ben"]);
  const ben = house.members[0];
  const until = plan === "founding" ? null : new Date(Date.now() + 200 * DAY);
  const sub = `sub_${house.id.slice(0, 8)}`;
  await db
    .from("houses")
    .update({ pass_plan: plan, pass_ends_at: until?.toISOString() ?? null, pass_bought_by: ben.userId })
    .eq("id", house.id);
  await db
    .from("house_pass_billing")
    .insert({ house_id: house.id, stripe_customer_id: "cus_ben", stripe_subscription_id: plan === "founding" ? null : sub });
  return { house, ben, until, sub };
}

async function leave(house: House, who: Actor) {
  expectOk(await who.db.rpc("remove_member", { p_house: house.id, p_user: who.userId }));
}

async function startHouse(who: Actor, name = `${who.name}'s new place`) {
  const { data, error } = await who.db.rpc("create_house", { p_name: name, p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1 });
  if (error) throw error;
  track.house(data!);
  return data!;
}

async function passOf(houseId: string) {
  const { data } = await db.from("houses").select("pass_plan, pass_ends_at, pass_bought_by").eq("id", houseId).single();
  return data!;
}

async function billingOf(houseId: string) {
  const { data } = await db.from("house_pass_billing").select("stripe_customer_id, stripe_subscription_id").eq("house_id", houseId).maybeSingle();
  return data;
}

async function moveOf(userId: string) {
  const { data } = await db
    .from("moves")
    .select("id, pass_plan, pass_ends_at, pass_state, pass_stopped_at")
    .eq("user_id", userId)
    .order("left_at", { ascending: false })
    .limit(1)
    .single();
  return data!;
}

function fakeStripe(subs: Record<string, SubscriptionView> = {}) {
  const stopped: string[] = [];
  const stripe: PassStripe = {
    priceId: async (key) => `price_${key}`,
    checkout: async () => "https://checkout.stripe.com/c/pay/cs_test_1",
    portal: async () => "https://billing.stripe.com/p/session/test_1",
    subscription: async (id) => subs[id],
    stopRenewing: async (id) => void stopped.push(id),
    resumeRenewing: async () => {},
  };
  return { stripe, stopped };
}

describe("the buyer leaving", () => {
  it("takes the Pass, leaves the house 30 days of extras, and tells the Wall", async () => {
    const { house, ben, until, sub } = await bensPass();
    await leave(house, ben);

    const old = await passOf(house.id);
    expect(old.pass_plan).toBe("trial");
    expect(old.pass_bought_by).toBeNull();
    const grace = Date.parse(old.pass_ends_at!);
    expect(grace).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(grace).toBeLessThan(Date.now() + 31 * DAY);
    expect(await billingOf(house.id)).toBeNull();

    const move = await moveOf(ben.userId);
    expect(move).toMatchObject({ pass_plan: "yearly", pass_state: "waiting" });
    expect(Date.parse(move.pass_ends_at!)).toBe(until!.getTime());
    const { data: bill } = await db.from("moving_pass_billing").select("stripe_customer_id, stripe_subscription_id").eq("move_id", move.id).single();
    expect(bill).toEqual({ stripe_customer_id: "cus_ben", stripe_subscription_id: sub });

    const { data: posts } = await db.from("events").select("data").eq("house_id", house.id).eq("kind", "moved_out");
    const said = posts![0].data as { who: string; pass_until: string };
    expect(said).toMatchObject({ who: "Ben", pass_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

    // The Moving on screen says so.
    const { data: offer } = await ben.db.rpc("moving_on");
    expect(offer![0]).toMatchObject({ pass_plan: "yearly", pass_state: "waiting", house_pass_until: said.pass_until });
  });

  it("puts it on the next house they start, Stripe ids and all", async () => {
    const { house, ben, until, sub } = await bensPass();
    await leave(house, ben);
    const next = await startHouse(ben);

    expect(await passOf(next)).toEqual({ pass_plan: "yearly", pass_ends_at: expect.any(String), pass_bought_by: ben.userId });
    expect(Date.parse((await passOf(next)).pass_ends_at!)).toBe(until!.getTime());
    expect(await billingOf(next)).toEqual({ stripe_customer_id: "cus_ben", stripe_subscription_id: sub });
    expect((await moveOf(ben.userId)).pass_state).toBe("moved");
  });

  it("waits while the house they join has a Pass of its own", async () => {
    const { house, ben } = await bensPass();
    const other = await makeHouse(["Cal"]);
    await db.from("houses").update({ pass_plan: "founding", pass_ends_at: null }).eq("id", other.id);
    await leave(house, ben);
    expectOk(await ben.db.rpc("join_house", { p_code: other.code }));

    expect((await passOf(other.id)).pass_bought_by).toBeNull();
    expect((await moveOf(ben.userId)).pass_state).toBe("waiting");
  });

  it("takes Founding they bought, but not Founding a house was given", async () => {
    const { house, ben } = await bensPass("founding");
    await leave(house, ben);
    const next = await startHouse(ben);
    expect(await passOf(next)).toEqual({ pass_plan: "founding", pass_ends_at: null, pass_bought_by: ben.userId });

    const given = await makeHouse(["Dee", "Eve"]);
    await db.from("houses").update({ pass_plan: "founding", pass_ends_at: null, pass_bought_by: null }).eq("id", given.id);
    await leave(given, given.members[0]);
    expect((await passOf(given.id)).pass_plan).toBe("founding");
  });

  it("moves a Pass at most once every 30 days", async () => {
    const { house, ben } = await bensPass();
    await leave(house, ben);
    const next = await startHouse(ben);
    const friend = await makeHouse(["Fay"]);
    // Ben hands next over to nobody: the last one out closes it, and the Pass stays there.
    await leave({ ...house, id: next }, ben);
    expectOk(await ben.db.rpc("join_house", { p_code: friend.code }));

    expect((await passOf(next)).pass_bought_by).toBe(ben.userId);
    expect((await passOf(friend.id)).pass_plan).toBe("trial");
  });

  it("stays with the house when an admin removes the buyer", async () => {
    const { house, ben } = await bensPass();
    await db.from("members").update({ moving_out_on: new Date().toISOString().slice(0, 10) }).eq("user_id", ben.userId);
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expect((await passOf(house.id)).pass_plan).toBe("yearly");
    expect((await moveOf(ben.userId)).pass_state).toBeNull();
  });
});

describe("leave_pass", () => {
  it("puts the Pass back on the house left, and the clock stops it renewing once", async () => {
    const { house, ben, until, sub } = await bensPass();
    await leave(house, ben);
    expectOk(await ben.db.rpc("leave_pass"));

    expect(await passOf(house.id)).toEqual({ pass_plan: "yearly", pass_ends_at: expect.any(String), pass_bought_by: ben.userId });
    expect(Date.parse((await passOf(house.id)).pass_ends_at!)).toBe(until!.getTime());
    expect(await billingOf(house.id)).toEqual({ stripe_customer_id: "cus_ben", stripe_subscription_id: sub });
    expect((await moveOf(ben.userId)).pass_state).toBe("left");

    const { stripe, stopped } = fakeStripe();
    await stopCarriedPasses(db, stripe, new Date());
    await stopCarriedPasses(db, stripe, new Date());
    expect(stopped.filter((s) => s === sub)).toHaveLength(1);

    // Nothing left to leave, and a new house doesn't get it.
    expectRule(await ben.db.rpc("leave_pass"), "no_pass_to_leave");
    const next = await startHouse(ben);
    expect((await passOf(next)).pass_plan).toBe("trial");
  });
});

describe("Stripe, while the Pass is on the move", () => {
  it("writes a renewal on the move, not on the house it was bought for", async () => {
    const { house, ben, sub } = await bensPass();
    await leave(house, ben);
    const renewed = new Date(Date.now() + 400 * DAY);
    const { stripe } = fakeStripe({
      [sub]: {
        id: sub,
        status: "active",
        customer: "cus_ben",
        metadata: { house_id: house.id, plan: "yearly", buyer: ben.userId },
        lookupKey: "pass_yearly",
        periodEnd: secs(renewed),
        endedAt: null,
      },
    });
    const event = { type: "customer.subscription.updated", data: { object: { id: sub } } } as unknown as Stripe.Event;
    expect(await applyPassEvent(db, stripe, event, new Date(), "local")).toBe("carried");
    expect((await passOf(house.id)).pass_plan).toBe("trial");
    expect(Date.parse((await moveOf(ben.userId)).pass_ends_at!)).toBe(secs(renewed) * 1000);

    // On the next house, its renewals land there.
    const next = await startHouse(ben);
    expect(await applyPassEvent(db, stripe, event, new Date(), "local")).toBe("subscription");
    expect(Date.parse((await passOf(next)).pass_ends_at!)).toBe(secs(renewed) * 1000);
    expect((await passOf(house.id)).pass_plan).toBe("trial");
  });

  it("stops a Pass renewing once it has waited 30 days for a house", async () => {
    const { house, ben, sub } = await bensPass();
    await leave(house, ben);
    const { stripe, stopped } = fakeStripe();
    expect(await stopCarriedPasses(db, stripe, new Date())).toBe(0);
    await stopCarriedPasses(db, stripe, new Date(Date.now() + 31 * DAY));
    expect(stopped).toContain(sub);
    expect((await moveOf(ben.userId)).pass_state).toBe("lapsed");
  });
});
