import "server-only";

import {
  wordsFor,
  hasPass,
  normalEmail,
  offerEmail,
  offerRefusal,
  offerUrl,
  passOf,
  promotionArgs,
  promotionLegend,
  promotionPrices,
  promotionSentence,
  promotionState,
  promotionTitle,
  termsOf,
  type Currency,
  type HousePass,
  type OfferFacts,
  type OfferRefusal,
  type OfferView,
  type PassPurchase,
  type PromotionRequest,
} from "@app/core";

import { sendEmail } from "@/lib/email";
import type { OfferStripe } from "@/lib/pass/stripe";
import { type AdminClient, createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

/** An offer link has no reader yet, so its words are English. */
const words = wordsFor("en", "housemates");

// Promotions (docs/specs/promotions.md). The owner makes one through the
// database (owner_make_promotion: checks it's them, writes the audit); then
// money off is set up in Stripe as a coupon with one promotion code, and the
// promotion goes live. Using one is checked here, at checkout: Stripe can't
// tie a code to an email, so Jonz does, against the email the buyer is
// signed in with, and only then hands Stripe the code.

/** The day an offer ends is said in Jonz's home zone. */
const ZONE = "Europe/London";

type PromotionRow = {
  id: string;
  code: string;
  name: string;
  note: string | null;
  kind: string;
  percent_off: number | null;
  amount_off: unknown;
  duration: string | null;
  months: number | null;
  plans: string[];
  audience: string;
  ends_at: string | null;
  max_uses: number | null;
  state: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
};

const COLUMNS =
  "id, code, name, note, kind, percent_off, amount_off, duration, months, plans, audience, ends_at, max_uses, state, stripe_coupon_id, stripe_promotion_code_id";

/** Makes a promotion and, for money off, sets it up in Stripe. Saved but not ready when Stripe can't be reached. */
export async function makePromotion(
  caller: Caller,
  stripe: OfferStripe | null,
  draft: PromotionRequest,
  db: AdminClient = createAdminClient(),
): Promise<{ refusal: Refusal } | { id: string; code: string; ready: boolean }> {
  const { data: id, error } = await caller.db.rpc("owner_make_promotion", promotionArgs(draft));
  if (error || !id) return { refusal: error ?? { message: "promotion_bad" } };
  const ready = await setUpPromotion(db, stripe, id);
  return { id, code: draft.code, ready };
}

/**
 * A promotion still being made: its coupon and code made in Stripe (once,
 * however often it's tried), then live. True once it's live.
 */
async function setUpPromotion(db: AdminClient, stripe: OfferStripe | null, id: string): Promise<boolean> {
  const { data: p } = await db.from("promotions").select(COLUMNS).eq("id", id).maybeSingle();
  if (!p) return false;
  if (p.state !== "making") return p.state === "live";
  if (!stripe) return false;
  const people = p.audience === "named" ? await peopleCount(db, id) : null;
  try {
    const made = await stripe.makeOffer({
      id: p.id,
      name: promotionLegend(termsOf(p)),
      percentOff: p.percent_off,
      amountOff: (p.amount_off as Record<string, number> | null) ?? null,
      duration: (p.duration ?? "once") as "once" | "months" | "always",
      months: p.months,
      endsAt: p.ends_at ? Math.floor(new Date(p.ends_at).getTime() / 1000) : null,
      maxRedemptions: people ?? p.max_uses,
    });
    const { error } = await db.rpc("promotion_ready", { p_id: id, p_coupon: made.coupon, p_code: made.code });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(`promotions: couldn't set up ${id} in Stripe: ${(e as Error).message}`);
    return false;
  }
}

async function peopleCount(db: AdminClient, id: string): Promise<number> {
  const { count } = await db.from("promotion_people").select("email", { count: "exact", head: true }).eq("promotion_id", id);
  return count ?? 0;
}

/** Try again, from the promotion's page, when Stripe couldn't be reached. Only the owner. */
export async function retryPromotion(
  caller: Caller,
  stripe: OfferStripe | null,
  id: string,
  db: AdminClient = createAdminClient(),
): Promise<{ refusal: Refusal } | { ready: boolean }> {
  const { data, error } = await caller.db.rpc("owner_promotion", { p_id: id });
  if (error) return { refusal: error };
  if (!data) return { refusal: { message: "promotion_unknown" } };
  return { ready: await setUpPromotion(db, stripe, id) };
}

/** Stop it: the database first (the owner's call, audited), then its Stripe code off. */
export async function stopPromotion(caller: Caller, stripe: OfferStripe | null, id: string): Promise<Refusal | null> {
  const { data: code, error } = await caller.db.rpc("owner_stop_promotion", { p_id: id });
  if (error) return error;
  if (code && stripe) {
    // Stopped in Jonz is stopped: no checkout hands Stripe this code again.
    await stripe.stopOffer(code).catch((e: Error) => console.error(`promotions: couldn't turn off ${code} in Stripe: ${e.message}`));
  }
  return null;
}

/** Email them: the named people not yet sent it, each once. Answers how many. */
export async function emailPromotion(
  caller: Caller,
  id: string,
  send: typeof sendEmail = sendEmail,
  db: AdminClient = createAdminClient(),
): Promise<{ refusal: Refusal } | { sent: number }> {
  const { data: people, error } = await caller.db.rpc("owner_promotion_emails", { p_id: id });
  if (error) return { refusal: error };
  const { data: p } = await db.from("promotions").select(COLUMNS).eq("id", id).single();
  if (!p) return { refusal: { message: "promotion_unknown" } };
  const terms = termsOf(p);
  for (const person of people ?? []) {
    await send(
      person.email,
      offerEmail({ name: person.name, email: person.email, terms, note: p.note, url: offerUrl(p.code), zone: ZONE }),
      { tag: "promotion", idempotencyKey: `promotion-${id}-${person.email}` },
    );
  }
  return { sent: people?.length ?? 0 };
}

// --- Using one ---------------------------------------------------------------------------------

/** A live promotion by its code, with how it stands for this email and house. */
async function factsOf(db: AdminClient, code: string, email: string | undefined, houseId: string | null) {
  const { data: p } = await db.from("promotions").select(COLUMNS).eq("code", code.trim().toUpperCase()).maybeSingle();
  if (!p) return null;
  const mine = email ? normalEmail(email) : null;
  const [{ count: uses }, person, house] = await Promise.all([
    db.from("promotion_uses").select("id", { count: "exact", head: true }).eq("promotion_id", p.id),
    mine
      ? db.from("promotion_people").select("used_at").eq("promotion_id", p.id).eq("email", mine).maybeSingle()
      : Promise.resolve({ data: null }),
    houseId
      ? db.from("promotion_uses").select("id").eq("promotion_id", p.id).eq("house_id", houseId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const usedByEmail = mine
    ? (await db.from("promotion_uses").select("id").eq("promotion_id", p.id).eq("email", mine).limit(1)).data?.length
    : 0;
  const facts: OfferFacts = {
    state: p.state as OfferFacts["state"],
    audience: p.audience as OfferFacts["audience"],
    terms: termsOf(p),
    maxUses: p.max_uses,
    uses: uses ?? 0,
    listed: !!person.data,
    personUsed: !!person.data?.used_at || !!usedByEmail,
    houseUsed: !!house.data,
  };
  return { row: p as PromotionRow, facts };
}

/** What checkout needs from an offer it may use. */
export type CheckedOffer = { refusal: OfferRefusal } | { row: PromotionRow; facts: OfferFacts };

/** Whether this buyer can use the offer on this house and plan (null for a free Pass), for checkout. */
export async function checkOffer(
  db: AdminClient,
  code: string,
  email: string | undefined,
  house: { id: string; pass: HousePass },
  plan: PassPurchase | null,
  now: Date,
): Promise<CheckedOffer> {
  const found = await factsOf(db, code, email, house.id);
  const refusal = offerRefusal(found?.facts ?? null, { pass: house.pass, plan: found?.facts.terms.kind === "gift" ? null : plan }, now);
  if (refusal || !found) return { refusal: refusal ?? "offer_unknown" };
  return found;
}

/**
 * A free Pass from a promotion, given here, with no Stripe: a free month
 * made longer by its months, or the Pass for good. Taken under the
 * database's lock first, so a promotion for ten houses gives ten.
 */
export async function giveGift(
  db: AdminClient,
  offer: { row: PromotionRow },
  house: { id: string; pass: HousePass },
  buyer: { userId: string; email: string },
  now: Date,
): Promise<OfferRefusal | null> {
  const { data: took, error } = await db.rpc("promotion_use", {
    p_id: offer.row.id,
    p_house: house.id,
    p_user: buyer.userId,
    p_email: buyer.email,
    p_session: null,
    p_plan: null,
    p_strict: true,
  });
  if (error) throw new Error(`Couldn't use the promotion: ${error.message}`);
  if (!took) return "offer_used";
  const months = offer.row.months;
  const pass =
    months === null
      ? { pass_plan: "founding", pass_ends_at: null, pass_bought_by: null }
      : {
          pass_plan: "trial",
          pass_ends_at: addMonths(hasPass(house.pass, now) && house.pass.until ? house.pass.until : now, months).toISOString(),
          pass_bought_by: null,
        };
  const { error: written } = await db.from("houses").update(pass).eq("id", house.id);
  if (written) throw new Error(`Couldn't write the House Pass: ${written.message}`);
  return null;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** A Checkout Session paid with a promotion: its use, once per session, whatever the limits say now. */
export async function recordOfferUse(
  db: AdminClient,
  metadata: Record<string, string> | null | undefined,
  session: string,
): Promise<void> {
  if (!metadata?.promotion) return;
  const { error } = await db.rpc("promotion_use", {
    p_id: metadata.promotion,
    p_house: metadata.house_id ?? null,
    p_user: metadata.buyer ?? null,
    p_email: metadata.offer_email ?? "",
    p_session: session,
    p_plan: metadata.plan ?? null,
    p_strict: false,
  });
  if (error) throw new Error(`Couldn't record the promotion's use: ${error.message}`);
}

/**
 * The offer page's view of a code: what it gives, in the viewer's house's
 * currency, and, signed in, whether it's theirs and on which of their
 * houses it works. Null for a code that opens nothing. Opening a named
 * offer signed in as one of its emails is noted for the owner.
 */
export async function readOffer(
  db: AdminClient,
  code: string,
  viewer: (Caller & { email: string | undefined }) | null,
  now: Date,
): Promise<OfferView | null> {
  const found = await factsOf(db, code, viewer?.email, null);
  if (!found) return null;
  const { row, facts } = found;
  const state = promotionState(facts, now) === "live" ? "live" : "ended";

  let you: OfferView["you"] = null;
  let currency: Currency = "USD";
  if (viewer?.email) {
    const { data: houses } = await viewer.db.from("houses").select("id, name, currency, pass_plan, pass_ends_at, pass_bought_by");
    currency = (houses?.[0]?.currency as Currency | undefined) ?? "USD";
    const plan = facts.terms.kind === "gift" ? null : (facts.terms.plans[0] ?? null);
    you = {
      email: normalEmail(viewer.email),
      forYou: facts.audience === "anyone" || facts.listed,
      houses: await Promise.all(
        (houses ?? []).map(async (h) => {
          const used = await db.from("promotion_uses").select("id").eq("promotion_id", row.id).eq("house_id", h.id).maybeSingle();
          const refusal = offerRefusal({ ...facts, houseUsed: !!used.data }, { pass: passOf(h), plan }, now);
          return { id: h.id, name: h.name, currency: h.currency as Currency, refusal };
        }),
      ),
    };
    if (facts.listed) await db.rpc("promotion_opened", { p_id: row.id, p_email: viewer.email });
  }

  const terms = facts.terms;
  return {
    code: row.code,
    state,
    legend: state === "live" ? promotionLegend(terms, currency) : words('house.promotion.endedLegend'),
    plate: state === "live" ? words('house.promotion.plate') : words('house.promotion.endedPlate'),
    title: promotionTitle(terms, currency),
    sentence: promotionSentence(terms, ZONE, currency),
    note: row.note,
    kind: terms.kind,
    named: facts.audience === "named",
    currency,
    prices: promotionPrices(terms, currency),
    endsAt: row.ends_at,
    you,
  };
}
