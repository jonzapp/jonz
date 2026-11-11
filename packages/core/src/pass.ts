import type { Currency } from "./domain";
import { formatMoney } from "./money";
import type { Words } from "./words-for";
import { dateIn } from "./format";

// The House Pass (docs/specs/house-pass.md): one subscription per house that
// unlocks the extras for everyone in it. Running a fair house stays free.

/**
 * Whether a house without the Pass loses the extras: on since 11 Nov 2026,
 * when every house made before then became a Founding house
 * (20270106090000_pass_on.sql). Tests pass their own to `passUnlocked`.
 */
export const PASS_ENFORCED: boolean = true;

/** How long every new house has the Pass free, from when it's made. */
export const PASS_TRIAL_DAYS = 30;

/** Weeks of history every house sees; older weeks need the Pass. */
export const PASS_FREE_HISTORY_WEEKS = 4;

export const PASS_PLANS = ["trial", "monthly", "yearly", "founding"] as const;
export type PassPlan = (typeof PASS_PLANS)[number];

/** What the Pass unlocks. Everything else is free for every house. */
export const PASS_FEATURES = ["stake", "table", "photos", "history"] as const;
export type PassFeature = (typeof PASS_FEATURES)[number];

export interface HousePass {
  plan: PassPlan;
  /** When it ends; null only for a Founding house, whose Pass never does. */
  until: Date | null;
  /** Who bought it; null for the free month or a Founding house given free. */
  buyerId: string | null;
}

/** A house row's Pass. An unknown plan reads as an ended free month, so it never unlocks by mistake. */
export function passOf(row: { pass_plan: string; pass_ends_at: string | null; pass_bought_by: string | null }): HousePass {
  const plan = (PASS_PLANS as readonly string[]).includes(row.pass_plan) ? (row.pass_plan as PassPlan) : "trial";
  const until = row.pass_ends_at ? new Date(row.pass_ends_at) : null;
  if (plan === "founding") return { plan, until: null, buyerId: row.pass_bought_by };
  return { plan, until: until ?? new Date(0), buyerId: row.pass_bought_by };
}

/** Whether the house has the Pass at `now`: Founding, or not yet ended. */
export function hasPass(pass: HousePass, now: Date): boolean {
  if (pass.plan === "founding") return true;
  return pass.until !== null && pass.until.getTime() > now.getTime();
}

/** Whether the extras are open to this house at `now`: always, until the Pass is enforced. */
export function passUnlocked(pass: HousePass, now: Date, enforced: boolean = PASS_ENFORCED): boolean {
  return !enforced || hasPass(pass, now);
}

/** Whole days left on a Pass that ends, counting a part day as a day; 0 once it has; null for Founding. */
export function passDaysLeft(pass: HousePass, now: Date): number | null {
  if (pass.until === null) return null;
  const ms = pass.until.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** The Pass in a few words, for its row on House: "Founding house", "Free month, 12 days left", "Yearly, renews 12 Nov". */
export function passLine(pass: HousePass, now: Date, zone: string, words: Words): string {
  if (pass.plan === "founding") return words('house.pass.founding');
  const day = dateIn(pass.until!, "dayMonth", zone, words);
  const left = passDaysLeft(pass, now)!;
  if (left === 0) return pass.plan === "trial" ? words('house.pass.trialEnded') : words('house.pass.ended', { day });
  if (pass.plan === "trial") return left > PASS_TRIAL_DAYS ? words('house.pass.freeUntil', { day }) : words('house.pass.trialLeft', { days: left });
  return words('house.pass.renews', { plan: pass.plan === "yearly" ? words('house.pass.yearly') : words('house.pass.monthly'), day });
}

/**
 * The prices shown before the stores give their own, in minor units, per
 * house currency. The stores' local price tiers replace these once buying
 * opens; they're set to land on the same tiers.
 */
export const PASS_PRICES: Record<Currency, { yearly: number; monthly: number; founding: number }> = {
  USD: { yearly: 4999, monthly: 599, founding: 6900 },
  CAD: { yearly: 6499, monthly: 799, founding: 8999 },
  GBP: { yearly: 3999, monthly: 499, founding: 5499 },
  EUR: { yearly: 4999, monthly: 599, founding: 6900 },
};

export interface PassOffer {
  plan: Exclude<PassPlan, "trial">;
  label: string;
  price: string;
  meta: string;
}

/** The plans on the Pass page, Yearly first (the one picked): label, price and what it works out at. */
export function passOffers(currency: Currency, words: Words): PassOffer[] {
  const p = PASS_PRICES[currency];
  return [
    { plan: "yearly", label: words('house.pass.yearly'), price: words('house.pass.perYear', { price: formatMoney(p.yearly, currency, words) }), meta: words('house.pass.perMonthish', { price: formatMoney(Math.round(p.yearly / 12), currency, words) }) },
    { plan: "monthly", label: words('house.pass.monthly'), price: words('house.pass.perMonth', { price: formatMoney(p.monthly, currency, words) }), meta: words('house.pass.monthlyMeta') },
    { plan: "founding", label: words('house.pass.foundingPlan'), price: words('house.pass.once', { price: formatMoney(p.founding, currency, words) }), meta: words('house.pass.foundingMeta') },
  ];
}

// Buying the Pass on the web (Stripe Checkout, then Stripe's webhook to
// apps/api). These are the rules; apps/api only carries them to Stripe and
// back.

/** What can be bought: every plan but the free month. */
export const PASS_PURCHASES = ["yearly", "monthly", "founding"] as const;
export type PassPurchase = (typeof PASS_PURCHASES)[number];

/** Each plan's Stripe price, by lookup key, so no code names a price id. One price holds every house currency. */
export const PASS_LOOKUP_KEYS: Record<PassPurchase, string> = {
  yearly: "pass_yearly",
  monthly: "pass_monthly",
  founding: "pass_founding",
};

/** The plan a Stripe price is for, by its lookup key; null for any other price. */
export function purchaseOfLookupKey(key: string | null | undefined): PassPurchase | null {
  return PASS_PURCHASES.find((plan) => PASS_LOOKUP_KEYS[plan] === key) ?? null;
}

/**
 * The plan a Stripe price is for. A price set aside when its lookup key moved
 * to a new price (a price change) has no key, but houses still subscribed to
 * it renew on it, so its metadata plan names it.
 */
export function purchaseOfPrice(price: { lookup_key: string | null; metadata?: Record<string, string> | null }): PassPurchase | null {
  return purchaseOfLookupKey(price.lookup_key) ?? PASS_PURCHASES.find((plan) => plan === price.metadata?.plan) ?? null;
}

/** When a house's free month ends: PASS_TRIAL_DAYS after it was made. */
export function passFreeUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PASS_TRIAL_DAYS * 86_400_000);
}

/** Stripe puts off a first charge only to at least two days out; an hour more allows for the trip there. */
const FIRST_CHARGE_MIN_MS = 49 * 3_600_000;

/**
 * When a plan bought during the free month first charges: the end of the free
 * month, so nobody pays for days the house already has. Null to charge at
 * once: no free month left, or too little for Stripe to put off.
 */
export function passFirstCharge(pass: HousePass, now: Date): Date | null {
  if (pass.plan !== "trial" || pass.until === null) return null;
  return pass.until.getTime() - now.getTime() >= FIRST_CHARGE_MIN_MS ? pass.until : null;
}

/** The line under the plans while a first charge can wait for the free month to end: "Nothing to pay until your free month ends on 22 Nov." */
export function passFirstChargeNote(pass: HousePass, now: Date, zone: string, words: Words): string | null {
  const first = passFirstCharge(pass, now);
  return first ? words('house.pass.firstCharge', { day: dateIn(first, "dayMonth", zone, words) }) : null;
}

/**
 * Why the house can't buy `plan` at `now`, in words fit to show, or null when
 * it can. A Founding house has nothing to buy; a house on a paid plan changes
 * it from Manage, except to buy Founding, which ends the plan for it.
 */
export function passPurchaseRefusal(pass: HousePass, plan: PassPurchase, now: Date, words: Words): string | null {
  if (pass.plan === "founding") return words('house.pass.alreadyFounding');
  if (plan !== "founding" && pass.plan !== "trial" && hasPass(pass, now)) return words('house.pass.alreadyPaid');
  return null;
}

/** A house's Stripe subscription, as the webhook reads it back from Stripe. */
export interface PassSubscription {
  plan: Exclude<PassPurchase, "founding">;
  status: string;
  /** The end of the period paid for (or of Stripe's trial, during the free month). */
  periodEnd: Date;
  endedAt: Date | null;
  buyerId: string | null;
}

/** Statuses in which a subscription keeps the Pass: paid up, in the free month, or Stripe still retrying a card. */
const LIVE_STATUSES = ["active", "trialing", "past_due"];
/** Statuses in which it has stopped for good, or until someone pays. */
const ENDED_STATUSES = ["canceled", "unpaid", "paused"];

/** Whether a subscription in this status keeps a house's Pass. */
export function subscriptionLive(status: string): boolean {
  return LIVE_STATUSES.includes(status);
}

/**
 * The house's Pass after its subscription changed, or null to leave it as it
 * is. Founding never changes. A live subscription runs the Pass to the end of
 * its period; an ended one stops it then, except that a house still in its
 * free month keeps the rest of it. A first payment still going through
 * changes nothing yet.
 */
export function passAfterSubscription(current: HousePass, sub: PassSubscription, freeUntil: Date, now: Date): HousePass | null {
  if (current.plan === "founding") return null;
  if (subscriptionLive(sub.status)) return { plan: sub.plan, until: sub.periodEnd, buyerId: sub.buyerId };
  if (!ENDED_STATUSES.includes(sub.status)) return null;
  const ended = sub.status === "canceled" && sub.endedAt ? sub.endedAt : now;
  const end = ended.getTime() < sub.periodEnd.getTime() ? ended : sub.periodEnd;
  if (freeUntil.getTime() > end.getTime()) return { plan: "trial", until: freeUntil, buyerId: null };
  return { plan: sub.plan, until: end, buyerId: sub.buyerId };
}

/**
 * The house's rules as they cost now: without the Stake (a House Pass
 * extra) nothing late or missed costs anything, so no screen says it does.
 */
export function rulesAsStaked<R extends { stakeMinor: number; lateForfeitMinor: number; missedForfeitMinor: number }>(rules: R, staked: boolean): R {
  return staked ? rules : { ...rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 };
}
