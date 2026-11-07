import { randomUUID } from "node:crypto";

import { PromotionRequest, type PromotionRequest as Draft } from "@app/core";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";

import { startCheckout } from "@/lib/moves/pass";
import { emailPromotion, makePromotion, readOffer, retryPromotion, stopPromotion } from "@/lib/moves/promotions";
import { applyPassEvent } from "@/lib/pass/events";
import type { CheckoutParams, OfferCoupon, OfferStripe, PassStripe } from "@/lib/pass/stripe";
import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * Promotions (docs/specs/promotions.md), against the local stack: only the
 * owner, with their code, makes, lists, stops and emails them; money off is
 * set up in Stripe (a stand-in here) and handed to Checkout only after Jonz
 * has checked a named one is for the buyer's own email; each house and each
 * named person uses one once; a free Pass is given with no Stripe, as many
 * times as it allows and no more.
 *
 * Every time here is from now (a promotion ends a month on), so nothing
 * depends on the day the suite runs.
 */

const db = adminClient();
const APP = "https://jonz.app";
const MONTH = 30 * 86_400_000;

let owner: Actor;
let ownerNoCode: Actor;
let house: House;
let ava: Actor;
let ben: Actor;

beforeEach(async () => {
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
  house = await makeHouse(["Ava", "Ben"]);
  [ava, ben] = house.everyone;
});

const code = () => `T${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

function draft(over: Partial<Draft> = {}): Draft {
  return PromotionRequest.parse({
    name: "Beta thanks",
    note: "Thanks for helping test Jonz.",
    code: code(),
    kind: "percent",
    percent: 50,
    duration: "once",
    plans: ["yearly", "monthly"],
    audience: "named",
    people: [],
    endsAt: new Date(Date.now() + MONTH).toISOString(),
    ...over,
  });
}

function stripes() {
  const calls = { offers: [] as OfferCoupon[], stopped: [] as string[], checkout: [] as CheckoutParams[] };
  const offers: OfferStripe = {
    makeOffer: async (c) => {
      calls.offers.push(c);
      return { coupon: `jonz_${c.id}`, code: `promo_${c.id.slice(0, 8)}` };
    },
    stopOffer: async (c) => {
      calls.stopped.push(c);
    },
  };
  const pass: PassStripe = {
    priceId: async (key) => `price_${key}`,
    checkout: async (p) => {
      calls.checkout.push(p);
      return "https://checkout.stripe.com/c/pay/cs_test_1";
    },
    portal: async () => "",
    subscription: async () => {
      throw new Error("not in these tests");
    },
    stopRenewing: async () => {},
    resumeRenewing: async () => {},
  };
  return { offers, pass, calls };
}

const me = (a: Actor) => ({ db: a.db, userId: a.userId });
const buyer = (a: Actor) => ({ db: a.db, userId: a.userId, email: a.email });

async function make(over: Partial<Draft>, s = stripes()) {
  const made = await makePromotion(me(owner), s.offers, draft(over));
  if ("refusal" in made) throw new Error(made.refusal.message);
  return made;
}

describe("making one", () => {
  it("is the owner's alone, with their code, and goes in the audit log by counts, not emails", async () => {
    const s = stripes();
    const made = await make({ people: [ava.email, ` ${ben.email.toUpperCase()} `] }, s);
    expect(made.ready).toBe(true);
    expect(s.calls.offers[0]).toMatchObject({ id: made.id, percentOff: 50, duration: "once", maxRedemptions: 2 });

    const { data: row } = await db.from("promotions").select("state, stripe_code").eq("id", made.id).single();
    expect(row).toEqual({ state: "live", stripe_code: `promo_${made.id.slice(0, 8)}` });
    const { data: people } = await db.from("promotion_people").select("email").eq("promotion_id", made.id).order("email");
    expect(people!.map((p) => p.email).sort()).toEqual([ava.email, ben.email].sort());

    const { data: audit } = await db.from("admin_audit").select("actor, action, after").eq("target_id", made.id).single();
    expect(audit).toMatchObject({ actor: owner.userId, action: "promotion.make", after: { people: 2, kind: "percent" } });
    expect(JSON.stringify(audit)).not.toContain(ava.email);

    for (const who of [ava, ownerNoCode]) {
      const refused = await makePromotion(me(who), s.offers, draft({ people: [ava.email] }));
      expect("refusal" in refused && refused.refusal.code).toBe("42501");
    }
  });

  it("refuses a named one with nobody on it, and a code already taken", async () => {
    const first = await make({ audience: "anyone" });
    const again = await makePromotion(me(owner), stripes().offers, draft({ audience: "anyone", code: first.code }));
    expect("refusal" in again && again.refusal.message).toContain("promotion_code_taken");
    const nobody = await makePromotion(me(owner), stripes().offers, draft({ people: [] }));
    expect("refusal" in nobody && nobody.refusal.message).toContain("promotion_needs_people");
  });

  it("is saved but not live while Stripe can't be reached, and Try again makes it live once", async () => {
    const made = await makePromotion(me(owner), null, draft({ audience: "anyone" }));
    if ("refusal" in made) throw new Error(made.refusal.message);
    expect(made.ready).toBe(false);
    const { data: row } = await db.from("promotions").select("state").eq("id", made.id).single();
    expect(row!.state).toBe("making");

    const s = stripes();
    expect(await retryPromotion(me(ava), s.offers, made.id)).toMatchObject({ refusal: { code: "42501" } });
    expect(await retryPromotion(me(owner), s.offers, made.id)).toEqual({ ready: true });
    expect(await retryPromotion(me(owner), s.offers, made.id)).toEqual({ ready: true });
    expect(s.calls.offers).toHaveLength(1);
  });

  it("needs nothing from Stripe for months free or a free Pass", async () => {
    const s = stripes();
    const trial = await make({ kind: "trial", percent: null, duration: null, months: 3, audience: "anyone" }, s);
    const gift = await make({ kind: "gift", percent: null, duration: null, plans: [], months: null, audience: "anyone" }, s);
    expect([trial.ready, gift.ready]).toEqual([true, true]);
    expect(s.calls.offers).toHaveLength(0);
  });
});

describe("the owner's list", () => {
  it("finds one by an email on it, and is nobody else's to read", async () => {
    const made = await make({ people: [ben.email] });
    const page = await owner.db.rpc("owner_promotions_page", { p_q: ben.email });
    expectOk(page);
    expect(page.data!.map((p) => p.id)).toContain(made.id);
    expect(page.data!.find((p) => p.id === made.id)).toMatchObject({ people: 1, uses: 0, state: "live", audience: "named" });
    const count = await owner.db.rpc("owner_promotions_count", { p_q: made.code });
    expect(count.data).toBe(1);

    expectDenied(await ava.db.rpc("owner_promotions_page", {}));
    expectDenied(await ownerNoCode.db.rpc("owner_promotion", { p_id: made.id }));
    const peek = await ava.db.from("promotions").select("id");
    expect(peek.error ?? peek.data?.length).toBeTruthy();
    expect(peek.data ?? []).toEqual([]);

    const one = await owner.db.rpc("owner_promotion", { p_id: made.id });
    expect(one.data).toMatchObject({ code: made.code, state: "live", uses: 0, people: [{ email: ben.email, used_at: null }] });
    expect(JSON.stringify(one.data)).not.toContain("stripe");
  });
});

describe("using one at checkout", () => {
  it("hands Stripe the code only for an email it names, once a house", async () => {
    const s = stripes();
    const made = await make({ people: [ava.email] }, s);

    const theirs = await startCheckout(buyer(ava), s.pass, house.id, "yearly", APP, "local", new Date(), made.code.toLowerCase());
    expect(theirs).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(s.calls.checkout[0]).toMatchObject({
      promotionCode: `promo_${made.id.slice(0, 8)}`,
      metadata: { promotion: made.id, offer_email: ava.email, house_id: house.id },
    });

    const notBens = await startCheckout(buyer(ben), s.pass, house.id, "yearly", APP, "local", new Date(), made.code);
    expect(notBens).toMatchObject({ status: 409, message: expect.stringContaining("someone else") });
    const notFounding = await startCheckout(buyer(ava), s.pass, house.id, "founding", APP, "local", new Date(), made.code);
    expect(notFounding).toMatchObject({ status: 409, message: expect.stringContaining("plan") });
    expect(s.calls.checkout).toHaveLength(1);

    // Stripe says it's paid, twice: one use.
    const paid = {
      type: "checkout.session.completed",
      data: { object: { id: `cs_${randomUUID()}`, mode: "payment", payment_status: "paid", customer: "cus_1", metadata: s.calls.checkout[0].metadata } },
    } as unknown as Stripe.Event;
    await applyPassEvent(db, s.pass, paid, new Date(), "local");
    await applyPassEvent(db, s.pass, paid, new Date(), "local");
    const { data: uses } = await db.from("promotion_uses").select("house_id, email").eq("promotion_id", made.id);
    expect(uses).toEqual([{ house_id: house.id, email: ava.email }]);
    const { data: person } = await db.from("promotion_people").select("used_at").eq("promotion_id", made.id).single();
    expect(person!.used_at).not.toBeNull();

    const twice = await startCheckout(buyer(ava), s.pass, house.id, "yearly", APP, "local", new Date(), made.code);
    expect(twice).toMatchObject({ status: 409, message: expect.stringContaining("used already") });
  });

  it("puts the first charge off by its months free, with no code for Stripe", async () => {
    const s = stripes();
    const made = await make({ kind: "trial", percent: null, duration: null, months: 3, audience: "anyone" }, s);
    const now = new Date();
    await startCheckout(buyer(ben), s.pass, house.id, "monthly", APP, "local", now, made.code);
    const trialEnd = s.calls.checkout[0].trialEnd! * 1000;
    expect(trialEnd).toBeGreaterThan(now.getTime() + 2.5 * MONTH);
    expect(s.calls.checkout[0].promotionCode).toBeNull();
  });

  it("refuses a code that opens nothing, and a stopped one, and turns its Stripe code off", async () => {
    const s = stripes();
    const made = await make({ audience: "anyone" }, s);
    expect(await startCheckout(buyer(ava), s.pass, house.id, "yearly", APP, "local", new Date(), "NOSUCHCODE")).toMatchObject({ status: 409 });

    expect(await stopPromotion(me(ava), s.offers, made.id)).toMatchObject({ code: "42501" });
    expect(await stopPromotion(me(owner), s.offers, made.id)).toBeNull();
    expect(await stopPromotion(me(owner), s.offers, made.id)).toBeNull();
    expect(s.calls.stopped[0]).toBe(`promo_${made.id.slice(0, 8)}`);
    const { data: audit } = await db.from("admin_audit").select("action").eq("target_id", made.id).eq("action", "promotion.stop");
    expect(audit).toHaveLength(1);

    const ended = await startCheckout(buyer(ava), s.pass, house.id, "yearly", APP, "local", new Date(), made.code);
    expect(ended).toMatchObject({ status: 409, message: expect.stringContaining("ended") });
  });
});

describe("a free Pass", () => {
  it("is given with no Stripe, as many times as it allows and no more", async () => {
    const s = stripes();
    const made = await make({ kind: "gift", percent: null, duration: null, plans: [], months: 12, audience: "anyone", maxUses: 1 }, s);
    const before = new Date();
    const given = await startCheckout(buyer(ava), s.pass, house.id, "yearly", APP, "local", before, made.code);
    expect(given).toEqual({ url: `${APP}/house/pass?bought=1` });
    expect(s.calls.checkout).toHaveLength(0);
    const { data: h } = await db.from("houses").select("pass_plan, pass_until").eq("id", house.id).single();
    expect(h!.pass_plan).toBe("trial");
    expect(new Date(h!.pass_until!).getTime()).toBeGreaterThan(before.getTime() + 12 * MONTH);

    const other = await makeHouse(["Cal"]);
    const usedUp = await startCheckout(buyer(other.admin), s.pass, other.id, "yearly", APP, "local", new Date(), made.code);
    expect(usedUp).toMatchObject({ status: 409 });
  });

  it("for good makes a Founding house", async () => {
    const made = await make({ kind: "gift", percent: null, duration: null, plans: [], months: null, people: [ben.email] });
    expect(await startCheckout(buyer(ben), stripes().pass, house.id, "yearly", APP, "local", new Date(), made.code)).toMatchObject({ url: expect.any(String) });
    const { data: h } = await db.from("houses").select("pass_plan, pass_until, pass_buyer").eq("id", house.id).single();
    expect(h).toEqual({ pass_plan: "founding", pass_until: null, pass_buyer: null });
  });
});

describe("Email them", () => {
  it("sends each named person it once, however often it's pressed", async () => {
    const made = await make({ people: [ava.email, "friend@example.com"] });
    const sent: { to: string; subject: string; key?: string }[] = [];
    const send = (async (to: string, message: { subject: string }, options: { idempotencyKey?: string }) => {
      sent.push({ to, subject: message.subject, key: options.idempotencyKey });
      return { sent: true as const, id: "test" };
    }) as unknown as Parameters<typeof emailPromotion>[2];

    expect(await emailPromotion(me(ava), made.id, send)).toMatchObject({ refusal: { code: "42501" } });
    expect(await emailPromotion(me(owner), made.id, send)).toEqual({ sent: 2 });
    expect(await emailPromotion(me(owner), made.id, send)).toEqual({ sent: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual([ava.email, "friend@example.com"].sort());
    expect(sent[0].subject).toBe("Half off your House Pass");
  });
});

describe("the offer's link", () => {
  it("shows anyone what it gives, never who it's for, and tells a signed-in person whether it's theirs", async () => {
    const made = await make({ people: [ava.email] });
    const open = await readOffer(db, made.code, null, new Date());
    expect(open).toMatchObject({ legend: "Half off", state: "live", named: true, you: null, currency: "USD" });
    expect(JSON.stringify(open)).not.toContain(ava.email);

    const hers = await readOffer(db, made.code, buyer(ava), new Date());
    expect(hers).toMatchObject({ currency: "GBP", you: { forYou: true, houses: [{ id: house.id, refusal: null }] } });
    const { data: person } = await db.from("promotion_people").select("opened_at").eq("promotion_id", made.id).single();
    expect(person!.opened_at).not.toBeNull();

    const his = await readOffer(db, made.code, buyer(ben), new Date());
    expect(his?.you).toMatchObject({ forYou: false, houses: [{ refusal: "offer_not_yours" }] });

    expect(await readOffer(db, "NOSUCHCODE", null, new Date())).toBeNull();
  });

  it("says it's ended once it's stopped", async () => {
    const made = await make({ audience: "anyone" });
    await stopPromotion(me(owner), null, made.id);
    expect(await readOffer(db, made.code, null, new Date())).toMatchObject({ state: "ended", legend: "Offer ended" });
  });
});

describe("the tables", () => {
  it("are nobody's to write but the functions'", async () => {
    expectRule(await owner.db.from("promotions").insert({ code: "HACKED1", name: "x", kind: "gift", audience: "anyone" }), "permission denied");
    const made = await make({ kind: "gift", percent: null, duration: null, plans: [], months: null, audience: "anyone" });
    expectDenied(
      await ava.db.rpc("promotion_use", {
        p_id: made.id,
        p_house: house.id,
        p_user: ava.userId,
        p_email: ava.email,
        p_session: null,
        p_plan: null,
        p_strict: true,
      }),
    );
    expectDenied(await ava.db.rpc("promotion_ready", { p_id: made.id, p_coupon: "c", p_code: "x" }));
  });
});
