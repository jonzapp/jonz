import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { offerStripe, passStripe } from "@/lib/pass/stripe";

/**
 * What Jonz asks Stripe for, for promotions: a coupon and one promotion code
 * made once however often it's tried, and a Checkout that never shows
 * Stripe's own code box, so a code reaches Stripe only through Jonz's check.
 */

function sdk() {
  const calls: { method: string; params: unknown; options?: unknown }[] = [];
  const fake = {
    coupons: {
      create: vi.fn(async (params: { id: string }, options: unknown) => {
        calls.push({ method: "coupons.create", params, options });
        return { id: params.id };
      }),
      retrieve: vi.fn(async (id: string) => ({ id })),
    },
    promotionCodes: {
      create: vi.fn(async (params: unknown, options: unknown) => {
        calls.push({ method: "promotionCodes.create", params, options });
        return { id: "promo_1" };
      }),
      update: vi.fn(async (id: string, params: unknown) => {
        calls.push({ method: "promotionCodes.update", params: { id, ...(params as object) } });
        return { id };
      }),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (params: unknown) => {
          calls.push({ method: "checkout.sessions.create", params });
          return { url: "https://checkout.stripe.com/c/pay/cs_1" };
        }),
      },
    },
  };
  return { fake: fake as unknown as Stripe, calls };
}

const checkout = {
  mode: "subscription" as const,
  price: "price_1",
  currency: "gbp",
  email: "ava@example.com",
  metadata: { house_id: "h1" },
  trialEnd: null,
  successUrl: "https://jonz.app/house/pass?bought=1",
  cancelUrl: "https://jonz.app/house/pass",
};

describe("Checkout", () => {
  it("never shows Stripe's code box", async () => {
    const { fake, calls } = sdk();
    await passStripe(fake)!.checkout(checkout);
    const params = calls[0].params as Record<string, unknown>;
    expect(params.allow_promotion_codes).toBeUndefined();
    expect(params.discounts).toBeUndefined();
  });

  it("takes a checked promotion's code as its discount", async () => {
    const { fake, calls } = sdk();
    await passStripe(fake)!.checkout({ ...checkout, promotionCode: "promo_1" });
    expect((calls[0].params as Record<string, unknown>).discounts).toEqual([{ promotion_code: "promo_1" }]);
  });
});

describe("making an offer", () => {
  it("makes a percent coupon for some months, and one code with its end and its limit, each once", async () => {
    const { fake, calls } = sdk();
    const made = await offerStripe(fake)!.makeOffer({
      id: "p1",
      name: "Half off",
      percentOff: 50,
      amountOff: null,
      duration: "months",
      months: 3,
      endsAt: 1_800_000_000,
      maxRedemptions: 2,
    });
    expect(made).toEqual({ coupon: "jonz_p1", code: "promo_1" });
    expect(calls[0]).toMatchObject({
      params: { id: "jonz_p1", percent_off: 50, duration: "repeating", duration_in_months: 3, redeem_by: 1_800_000_000 },
      options: { idempotencyKey: "coupon_p1" },
    });
    expect(calls[1]).toMatchObject({
      params: { promotion: { type: "coupon", coupon: "jonz_p1" }, expires_at: 1_800_000_000, max_redemptions: 2 },
      options: { idempotencyKey: "code_p1" },
    });
    expect((calls[1].params as Record<string, unknown>).code).toBeUndefined();
  });

  it("makes an amount off in dollars, with the other currencies as options", async () => {
    const { fake, calls } = sdk();
    await offerStripe(fake)!.makeOffer({
      id: "p2",
      name: "$10 off",
      percentOff: null,
      amountOff: { USD: 1000, GBP: 800, CAD: 1300, EUR: 1000 },
      duration: "once",
      months: null,
      endsAt: null,
      maxRedemptions: null,
    });
    expect(calls[0].params).toMatchObject({
      amount_off: 1000,
      currency: "usd",
      duration: "once",
      currency_options: { gbp: { amount_off: 800 }, cad: { amount_off: 1300 }, eur: { amount_off: 1000 } },
    });
  });

  it("uses the coupon an earlier try made", async () => {
    const { fake } = sdk();
    (fake.coupons.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("exists"), { code: "resource_already_exists" }));
    const made = await offerStripe(fake)!.makeOffer({
      id: "p3",
      name: "Free",
      percentOff: 100,
      amountOff: null,
      duration: "always",
      months: null,
      endsAt: null,
      maxRedemptions: null,
    });
    expect(made.coupon).toBe("jonz_p3");
  });

  it("turns a stopped promotion's code off", async () => {
    const { fake, calls } = sdk();
    await offerStripe(fake)!.stopOffer("promo_1");
    expect(calls[0]).toEqual({ method: "promotionCodes.update", params: { id: "promo_1", active: false } });
  });
});
