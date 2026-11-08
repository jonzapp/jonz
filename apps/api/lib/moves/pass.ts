import "server-only";

import {
  FAMILY_PASS_COPY,
  humanError,
  PASS_COPY,
  PASS_LOOKUP_KEYS,
  passFirstCharge,
  passOf,
  passPurchaseRefusal,
  type PassPurchase,
} from "@app/core";

import type { Stage } from "@/lib/env";
import type { PassStripe } from "@/lib/pass/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller } from "./disputes";
import { checkOffer, giveGift } from "./promotions";

/** A refusal with the status to answer it with, or where to send the browser. */
export type PassAnswer = { url: string } | { status: number; message: string };

/** The house wasn't readable as the caller: they aren't in it. */
const NOT_IN_HOUSE = { status: 403, message: humanError({ code: "42501", message: "not_in_house" }) };

/** Where Stripe sends the browser back to: the Pass page, which reads the house again. */
function passPage(appUrl: string, bought: boolean): string {
  return `${appUrl}/house/pass${bought ? "?bought=1" : ""}`;
}

/** The house's Pass and currency, read as the caller: null when it isn't their house. */
async function houseOf(caller: Caller, houseId: string) {
  const { data } = await caller.db
    .from("houses")
    .select("id, currency, kind, pass_plan, pass_ends_at, pass_bought_by")
    .eq("id", houseId)
    .maybeSingle();
  return data;
}

/**
 * Buying the House Pass on the web: a Stripe Checkout Session for the plan,
 * in the house's currency, carrying the house and the buyer for the webhook.
 * Any housemate can buy it; in a family, only a parent (the Family Pass). A plan bought during the free month first charges
 * when the free month ends. Nothing is written here; the webhook gives the
 * house its Pass once Stripe says it's paid. `stage` goes with the purchase
 * so only this copy's webhook acts on it (staging and production can share a
 * Stripe sandbox).
 *
 * With an `offer` (a promotion's code, from its link), Jonz checks it's the
 * buyer's to use (a named one only for the email they're signed in with)
 * and only then hands Stripe its promotion code. Months free put the first
 * charge off further. A free Pass is given here, with no Stripe, and answers
 * the Pass page.
 */
export async function startCheckout(
  caller: Caller & { email: string | undefined },
  /** Null while Stripe isn't set up: a free Pass still works, nothing else does. */
  stripe: PassStripe | null,
  houseId: string,
  plan: PassPurchase,
  appUrl: string,
  stage: Stage,
  now: Date,
  offer: string | null = null,
): Promise<PassAnswer> {
  const house = await houseOf(caller, houseId);
  if (!house) return NOT_IN_HOUSE;

  if (house.kind === "family") {
    const { data: me } = await caller.db
      .from("members")
      .select("role")
      .eq("house_id", house.id)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (me?.role !== "admin") return { status: 403, message: FAMILY_PASS_COPY.parentsOnly };
  }

  const pass = passOf(house);
  const checked = offer ? await checkOffer(createAdminClient(), offer, caller.email, { id: house.id, pass }, plan, now) : null;
  if (checked && "refusal" in checked) return { status: 409, message: humanError({ message: checked.refusal }) };

  if (checked?.facts.terms.kind === "gift") {
    const refused = await giveGift(createAdminClient(), checked, { id: house.id, pass }, { userId: caller.userId, email: caller.email ?? "" }, now);
    if (refused) return { status: 409, message: humanError({ message: refused }) };
    return { url: passPage(appUrl, true) };
  }

  const refusal = passPurchaseRefusal(pass, plan, now);
  if (refusal) return { status: 409, message: refusal };

  if (!stripe) return { status: 503, message: PASS_COPY.checkoutClosed };
  const price = await stripe.priceId(PASS_LOOKUP_KEYS[plan]);
  if (!price) return { status: 503, message: PASS_COPY.checkoutClosed };

  // Months free start now, or when the free month ends if that's later.
  const freeMonths = checked?.facts.terms.kind === "trial" ? checked.facts.terms.months : null;
  const firstCharge = plan === "founding" ? null : latest(passFirstCharge(pass, now), freeMonths ? addMonths(now, freeMonths) : null);
  if (checked && checked.facts.terms.kind !== "trial" && !checked.row.stripe_promotion_code_id) {
    return { status: 409, message: humanError({ message: "offer_ended" }) };
  }
  const url = await stripe.checkout({
    mode: plan === "founding" ? "payment" : "subscription",
    price,
    currency: house.currency.toLowerCase(),
    email: caller.email,
    metadata: {
      house_id: house.id,
      plan,
      buyer: caller.userId,
      stage,
      ...(checked ? { promotion: checked.row.id, offer_email: caller.email ?? "" } : {}),
    },
    trialEnd: firstCharge ? Math.floor(firstCharge.getTime() / 1000) : null,
    successUrl: passPage(appUrl, true),
    cancelUrl: passPage(appUrl, false),
    promotionCode: checked && checked.facts.terms.kind !== "trial" ? checked.row.stripe_promotion_code_id : null,
  });
  return { url };
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a.getTime() > b.getTime() ? a : b;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * The buyer's way to change plan, change card or cancel: Stripe's billing
 * page for the house's Stripe customer. Only the housemate who bought the
 * Pass may open it; it's their card.
 */
export async function openBilling(caller: Caller, stripe: PassStripe, houseId: string, appUrl: string): Promise<PassAnswer> {
  const house = await houseOf(caller, houseId);
  if (!house) return NOT_IN_HOUSE;
  if (house.pass_bought_by !== caller.userId) return { status: 403, message: PASS_COPY.notBuyer };

  // The Stripe ids are the service role's alone; the house was read as the caller above.
  const { data: billing } = await createAdminClient()
    .from("house_pass_billing")
    .select("stripe_customer_id")
    .eq("house_id", house.id)
    .maybeSingle();
  if (!billing) return { status: 404, message: PASS_COPY.nothingToManage };

  return { url: await stripe.portal(billing.stripe_customer_id, passPage(appUrl, false)) };
}
