import { passFreeUntil } from "@app/core";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { openBilling, startCheckout } from "@/lib/moves/pass";
import { applyPassEvent } from "@/lib/pass/events";
import type { CheckoutParams, PassStripe, SubscriptionView } from "@/lib/pass/stripe";
import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * Buying the House Pass on the web, against the local stack: Checkout as a
 * housemate, then Stripe's events carried to the house. Stripe itself is a
 * stand-in that records what it was asked, and answers subscriptions from a
 * table the test fills, the way Stripe would on a fresh read.
 */

const db = adminClient();
const APP = "https://jonz.app";
const now = () => rightNow();
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const DAY = 86_400_000;

function fakeStripe() {
  const subs: Record<string, SubscriptionView> = {};
  const calls = { checkout: [] as CheckoutParams[], portal: [] as string[], stopped: [] as string[] };
  const stripe: PassStripe = {
    priceId: async (key) => `price_${key}`,
    checkout: async (p) => {
      calls.checkout.push(p);
      return "https://checkout.stripe.com/c/pay/cs_test_1";
    },
    portal: async (customer) => {
      calls.portal.push(customer);
      return "https://billing.stripe.com/p/session/test_1";
    },
    subscription: async (id) => subs[id],
    stopRenewing: async (id) => {
      calls.stopped.push(id);
    },
    resumeRenewing: async () => {},
  };
  return { stripe, subs, calls };
}

function sub(house: House, id: string, status: string, periodEnd: Date, over: Partial<SubscriptionView> = {}): SubscriptionView {
  return {
    id,
    status,
    customer: "cus_test_1",
    metadata: { house_id: house.id, plan: "yearly", buyer: house.admin.userId },
    lookupKey: "pass_yearly",
    periodEnd: secs(periodEnd),
    endedAt: null,
    ...over,
  };
}

const subscriptionEvent = (id: string, type = "customer.subscription.updated") =>
  ({ type, data: { object: { id } } }) as unknown as Stripe.Event;

const checkoutEvent = (object: Record<string, unknown>) =>
  ({ type: "checkout.session.completed", data: { object } }) as unknown as Stripe.Event;

async function passOfHouse(id: string) {
  const { data } = await db.from("houses").select("created_at, pass_plan, pass_ends_at, pass_bought_by").eq("id", id).single();
  return data!;
}

async function billingOf(id: string) {
  const { data } = await db.from("house_pass_billing").select("stripe_customer_id, stripe_subscription_id").eq("house_id", id).maybeSingle();
  return data;
}

const caller = (actor: Actor) => ({ db: actor.db, userId: actor.userId, email: `${actor.name}@test.local` });

describe("Checkout", () => {
  it("sends a housemate on the free month to Stripe for a plan, first charging when the free month ends", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { stripe, calls } = fakeStripe();
    const answer = await startCheckout(caller(house.members[0]), stripe, house.id, "yearly", APP, "local", now());
    expect(answer).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });

    const row = await passOfHouse(house.id);
    expect(calls.checkout[0]).toMatchObject({
      mode: "subscription",
      price: "price_pass_yearly",
      currency: "gbp",
      email: "Ben@test.local",
      metadata: { house_id: house.id, plan: "yearly", buyer: house.members[0].userId, stage: "local" },
      trialEnd: secs(new Date(row.pass_ends_at!)),
      successUrl: `${APP}/house/pass?bought=1`,
      cancelUrl: `${APP}/house/pass`,
    });
    // Nothing changes until Stripe says it's paid.
    expect(row.pass_plan).toBe("trial");
  });

  it("doesn't sell Founding any more", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, calls } = fakeStripe();
    expect(await startCheckout(caller(house.admin), stripe, house.id, "founding", APP, "local", now())).toMatchObject({ status: 409 });
    expect(calls.checkout).toHaveLength(0);
  });

  it("sells nothing to someone outside the house, or to a house given the Pass for good", async () => {
    const house = await makeHouse(["Ava"]);
    const stranger = await signedInUser("Zed");
    const { stripe, calls } = fakeStripe();
    expect(await startCheckout(caller(stranger), stripe, house.id, "yearly", APP, "local", now())).toMatchObject({ status: 403 });

    await db.from("houses").update({ pass_plan: "founding", pass_ends_at: null }).eq("id", house.id);
    expect(await startCheckout(caller(house.admin), stripe, house.id, "yearly", APP, "local", now())).toMatchObject({ status: 409 });
    expect(calls.checkout).toHaveLength(0);
  });

  it("sells the Family Pass to a parent, never a kid", async () => {
    const house = await makeHouse(["Sam", "Leo"], "family");
    const [sam, leo] = house.everyone;
    const { stripe, calls } = fakeStripe();
    expect(await startCheckout(caller(leo), stripe, house.id, "yearly", APP, "local", now())).toMatchObject({ status: 403 });
    expect(calls.checkout).toHaveLength(0);
    expect(await startCheckout(caller(sam), stripe, house.id, "yearly", APP, "local", now())).toHaveProperty("url");
  });
});

describe("Stripe's events", () => {
  it("gives the house the Pass to the end of a live subscription's period, and keeps the Stripe ids from housemates", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { stripe, subs } = fakeStripe();
    const end = fromNow(365 * DAY);
    subs.sub_1 = sub(house, "sub_1", "active", end);

    const done = await applyPassEvent(db, stripe, checkoutEvent({ mode: "subscription", subscription: "sub_1" }), now(), "local");
    expect(done).toBe("subscription");
    const row = await passOfHouse(house.id);
    expect(row.pass_plan).toBe("yearly");
    expect(Date.parse(row.pass_ends_at!)).toBe(secs(end) * 1000);
    expect(row.pass_bought_by).toBe(house.admin.userId);
    expect(await billingOf(house.id)).toEqual({ stripe_customer_id: "cus_test_1", stripe_subscription_id: "sub_1" });

    expectDenied(await house.admin.db.from("house_pass_billing").select("*").eq("house_id", house.id));
    expectDenied(await house.members[0].db.from("house_pass_billing").insert({ house_id: house.id, stripe_customer_id: "cus_x" }));
  });

  it("waits while a first payment goes through", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, subs } = fakeStripe();
    subs.sub_1 = sub(house, "sub_1", "incomplete", fromNow(30 * DAY));
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1", "customer.subscription.created"), now(), "local")).toBe("ignored");
    expect((await passOfHouse(house.id)).pass_plan).toBe("trial");
    expect(await billingOf(house.id)).toBeNull();
  });

  it("gives back the rest of the free month to a plan cancelled during it", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, subs } = fakeStripe();
    const created = new Date((await passOfHouse(house.id)).created_at);
    subs.sub_1 = sub(house, "sub_1", "trialing", passFreeUntil(created));
    await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "local");
    expect((await passOfHouse(house.id)).pass_plan).toBe("yearly");

    subs.sub_1 = { ...subs.sub_1, status: "canceled", endedAt: secs(rightNow()) };
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1", "customer.subscription.deleted"), now(), "local")).toBe("subscription");
    const row = await passOfHouse(house.id);
    expect(row.pass_plan).toBe("trial");
    expect(Date.parse(row.pass_ends_at!)).toBe(passFreeUntil(created).getTime());
    expect(row.pass_bought_by).toBeNull();
    expect((await billingOf(house.id))!.stripe_subscription_id).toBeNull();
  });

  it("lets an old subscription end without touching the house's new one", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, subs } = fakeStripe();
    const end = fromNow(30 * DAY);
    subs.sub_new = sub(house, "sub_new", "active", end, { lookupKey: "pass_monthly" });
    await applyPassEvent(db, stripe, subscriptionEvent("sub_new"), now(), "local");

    subs.sub_old = sub(house, "sub_old", "canceled", rightNow(), { endedAt: secs(rightNow()) });
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_old", "customer.subscription.deleted"), now(), "local")).toBe("ignored");
    const row = await passOfHouse(house.id);
    expect(row.pass_plan).toBe("monthly");
    expect(Date.parse(row.pass_ends_at!)).toBe(secs(end) * 1000);
  });

  it("makes a house Founding for good, and stops the plan it was paying for renewing", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { stripe, subs, calls } = fakeStripe();
    subs.sub_1 = sub(house, "sub_1", "active", fromNow(30 * DAY));
    await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "local");

    const paid = checkoutEvent({
      mode: "payment",
      payment_status: "paid",
      customer: "cus_test_2",
      metadata: { house_id: house.id, plan: "founding", buyer: house.members[0].userId },
    });
    expect(await applyPassEvent(db, stripe, paid, now(), "local")).toBe("founding");
    expect(calls.stopped).toEqual(["sub_1"]);
    expect(await passOfHouse(house.id)).toMatchObject({ pass_plan: "founding", pass_ends_at: null, pass_bought_by: house.members[0].userId });

    // The old plan running out later changes nothing.
    subs.sub_1 = { ...subs.sub_1, status: "canceled", endedAt: secs(rightNow()) };
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1", "customer.subscription.deleted"), now(), "local")).toBe("ignored");
    expect((await passOfHouse(house.id)).pass_plan).toBe("founding");
  });

  it("ignores a payment still going through, and other prices", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, subs } = fakeStripe();
    const unpaid = checkoutEvent({ mode: "payment", payment_status: "unpaid", customer: "cus_1", metadata: { house_id: house.id } });
    expect(await applyPassEvent(db, stripe, unpaid, now(), "local")).toBe("ignored");
    subs.sub_1 = sub(house, "sub_1", "active", fromNow(30 * DAY), { lookupKey: "something_else" });
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "local")).toBe("ignored");
    expect((await passOfHouse(house.id)).pass_plan).toBe("trial");
  });

  it("leaves a purchase made on another stage to that stage's webhook", async () => {
    const house = await makeHouse(["Ava"]);
    const { stripe, subs } = fakeStripe();
    const end = fromNow(365 * DAY);
    subs.sub_1 = sub(house, "sub_1", "active", end, { metadata: { house_id: house.id, plan: "yearly", stage: "staging" } });
    const session = checkoutEvent({ mode: "subscription", subscription: "sub_1", metadata: { house_id: house.id, stage: "staging" } });
    expect(await applyPassEvent(db, stripe, session, now(), "production")).toBe("ignored");
    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "production")).toBe("ignored");
    expect((await passOfHouse(house.id)).pass_plan).toBe("trial");

    expect(await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "staging")).toBe("subscription");
  });
});

describe("Manage plan", () => {
  it("opens Stripe's billing page for the buyer alone", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { stripe, subs, calls } = fakeStripe();
    expect(await openBilling(caller(house.admin), stripe, house.id, APP)).toMatchObject({ status: 403 });

    subs.sub_1 = sub(house, "sub_1", "active", fromNow(30 * DAY));
    await applyPassEvent(db, stripe, subscriptionEvent("sub_1"), now(), "local");
    expect(await openBilling(caller(house.admin), stripe, house.id, APP)).toEqual({ url: "https://billing.stripe.com/p/session/test_1" });
    expect(calls.portal).toEqual(["cus_test_1"]);
    expect(await openBilling(caller(house.members[0]), stripe, house.id, APP)).toMatchObject({ status: 403 });
  });
});

describe("POST /api/stripe/webhook", () => {
  const SECRET = "whsec_test_not_a_secret";
  const saved = { key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };
  const sdk = new Stripe("sk_test_not_a_key");

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_not_a_key";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = saved.key;
    process.env.STRIPE_WEBHOOK_SECRET = saved.secret;
  });

  const post = (payload: string, signature: string) =>
    webhook(new Request("http://localhost:3205/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));

  it("takes only what Stripe signed", async () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });
    expect((await post(payload, "t=1,v1=forged")).status).toBe(400);

    const signature = await sdk.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET });
    const res = await post(payload, signature);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, done: "ignored" });
  });

  it("is closed without Stripe set up", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post("{}", "t=1,v1=x")).status).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
});
