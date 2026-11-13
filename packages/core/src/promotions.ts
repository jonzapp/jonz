import type { Words } from "./words-for";
import { z } from "zod";

import { CURRENCIES, type Currency } from "./domain";
import { formatMoney } from "./money";
import { hasPass, onSale, PASS_ON_SALE, PASS_PRICES, PASS_PURCHASES, type HousePass, type PassOnSale, type PassPurchase } from "./pass";
import { dateIn } from "./format";
import { wordsFor } from "./words-for";

// Promotions (docs/specs/promotions.md): money off a House Pass, some months
// free, or a free Pass, given out by the owner with one link. A promotion is
// for anyone with the link, or only for the people named on it, who must be
// signed in to Jonz with that email to use it. The database keeps them and
// refuses what doesn't add up (supabase/migrations/20261130090000_promotions.sql);
// these are the words, the sums, the checks, and what crosses the API.

/** Money off (a percent, or an amount), some months free before the first charge, or a free Pass with no card. */
export const PROMOTION_KINDS = ["percent", "amount", "trial", "gift"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

/** How long money off lasts: the first payment, some months of payments, or every payment. */
export const PROMOTION_DURATIONS = ["once", "months", "always"] as const;
export type PromotionDuration = (typeof PROMOTION_DURATIONS)[number];

export const PROMOTION_AUDIENCES = ["anyone", "named"] as const;
export type PromotionAudience = (typeof PROMOTION_AUDIENCES)[number];

/** How one stands now: not yet set up in Stripe, live, past its day or used up, or stopped by the owner. */
export type PromotionState = "making" | "live" | "ended" | "stopped";

export const PROMOTION_LIMITS = { name: 60, note: 200, people: 500, months: 24, code: { min: 4, max: 20 } } as const;

/** The offer page, on jonz.app. */
export const offerUrl = (code: string) => `https://jonz.app/offer/${encodeURIComponent(code)}`;

/** An email as Jonz compares it: trimmed and lower case. */
export function normalEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The emails in what the owner typed or pasted, one a line or split by commas: each once, and the ones that aren't emails. */
export function parsePeople(text: string): { emails: string[]; bad: string[] } {
  const words = text
    .split(/[\s,;]+/)
    .map((w) => w.replace(/^<|>$/g, ""))
    .filter(Boolean);
  const emails: string[] = [];
  const bad: string[] = [];
  for (const word of words) {
    const email = normalEmail(word);
    if (!EMAIL.test(email)) bad.push(word);
    else if (!emails.includes(email)) emails.push(email);
  }
  return { emails, bad };
}

/** A code for the link from the promotion's name: its first letters and two digits, "BETATHAN42". */
export function newPromotionCode(name: string, random: () => number = Math.random): string {
  let letters = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  if (letters.length < 2) letters = "JONZ";
  const digits = String(Math.floor(random() * 90) + 10);
  return `${letters}${digits}`;
}

/**
 * An amount off in every house currency, from the dollar amount the owner
 * typed: scaled as the Yearly price is, to the whole unit.
 */
export function promotionAmounts(usdMinor: number): Record<Currency, number> {
  const out = {} as Record<Currency, number>;
  for (const c of CURRENCIES) {
    out[c] = c === "USD" ? usdMinor : Math.max(100, Math.round((usdMinor * PASS_PRICES[c].yearly) / PASS_PRICES.USD.yearly / 100) * 100);
  }
  return out;
}

/** What a promotion gives, as the sums and the words need it. */
export interface PromotionTerms {
  kind: PromotionKind;
  percentOff: number | null;
  amountOff: Partial<Record<Currency, number>> | null;
  duration: PromotionDuration | null;
  months: number | null;
  plans: readonly PassPurchase[];
  endsAt: Date | null;
}

/** A promotions row (or owner_promotions_find's) as terms. */
export function termsOf(row: {
  kind: string;
  percent_off: number | null;
  amount_off: unknown;
  duration: string | null;
  months: number | null;
  plans: readonly string[] | null;
  ends_at: string | null;
}): PromotionTerms {
  return {
    kind: row.kind as PromotionKind,
    percentOff: row.percent_off,
    amountOff: (row.amount_off as Partial<Record<Currency, number>> | null) ?? null,
    duration: row.duration as PromotionDuration | null,
    months: row.months,
    plans: (row.plans ?? []).filter((p): p is PassPurchase => (PASS_PURCHASES as readonly string[]).includes(p)),
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
  };
}

// A promotion's sign is in English for now; the owner's admin pages come in translation 6.
const words = wordsFor("en", "housemates");

/** A plan's name, as the Pass page says it. */
const planLabel = (plan: PassOnSale) => words(`house.pass.${plan}`);

const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

/** "Half off", "20% off", "$10 off", "3 months free", "A free year", "Free Pass": the big words on the sign. */
export function promotionLegend(t: PromotionTerms, currency: Currency = "USD"): string {
  switch (t.kind) {
    case "percent":
      return t.percentOff === 50 ? "Half off" : t.percentOff === 100 ? "Free" : `${t.percentOff}% off`;
    case "amount":
      return `${formatMoney(t.amountOff?.[currency] ?? t.amountOff?.USD ?? 0, currency, words)} off`;
    case "trial":
      return `${months(t.months ?? 1)} free`;
    case "gift":
      return t.months === null ? "Free Pass" : t.months === 12 ? "A free year" : `${months(t.months)} free`;
  }
}

/** The promotion in a few words, for the owner's list: "Half off, first payment", "Free Pass, for good". */
export function promotionGives(t: PromotionTerms, currency: Currency = "USD"): string {
  const legend = promotionLegend(t, currency);
  if (t.kind === "trial") return legend;
  if (t.kind === "gift") return t.months === null ? "Free Pass, for good" : `Free Pass, ${months(t.months)}`;
  if (t.duration === "always") return `${legend}, always`;
  if (t.duration === "months") return `${legend}, ${months(t.months ?? 1)}`;
  return `${legend}, first payment`;
}

/** The headline the people it's for read: "Half off your House Pass", "A free House Pass". */
export function promotionTitle(t: PromotionTerms, currency: Currency = "USD"): string {
  if (t.kind === "gift") {
    if (t.months === null) return "A House Pass for good";
    return t.months === 12 ? "A free year of the House Pass" : `${months(t.months)} of the House Pass, free`;
  }
  if (t.kind === "trial") return `${promotionLegend(t, currency)} on your House Pass`;
  return `${promotionLegend(t, currency)} your House Pass`;
}

function orList(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/**
 * What it gives, in one sentence: "Half off the first payment, on Yearly or
 * Monthly, for your whole house. Use it by 31 December."
 */
export function promotionSentence(t: PromotionTerms, zone: string, currency: Currency = "USD"): string {
  const legend = promotionLegend(t, currency);
  const what = {
    percent: null,
    amount: null,
    trial: `${months(t.months ?? 1)} free before the first payment`,
    gift: t.months === null ? "The House Pass for good, with no card" : `The House Pass free for ${months(t.months)}, with no card`,
  }[t.kind];
  const off =
    what ??
    (t.duration === "always"
      ? `${legend} every payment`
      : t.duration === "months"
        ? `${legend} for ${months(t.months ?? 1)}`
        : `${legend} the first payment`);
  const plans = t.kind === "gift" ? "" : `, on ${orList(t.plans.filter(onSale).map((p) => planLabel(p)))}`;
  const by = t.endsAt ? ` Use it by ${dateIn(t.endsAt, "dayMonthLong", zone, words)}.` : "";
  return `${off}${plans}, for your whole house.${by}`;
}

/** What one plan costs with it, in minor units: the first payment (or months of them), and after. */
export interface PromotionPrice {
  plan: PassPurchase;
  label: string;
  /** "$19.99 the first year", "Free for 3 months". */
  first: string;
  /** "then $39.99 a year"; null when it's every payment. */
  then: string | null;
  /** The first payment, in minor units. */
  firstMinor: number;
}

/** What a plan costs with the promotion, for the preview, the email and the offer page. Null for a plan it isn't on. */
export function promotionPrice(t: PromotionTerms, plan: PassPurchase, currency: Currency): PromotionPrice | null {
  if (t.kind === "gift" || !onSale(plan) || !t.plans.includes(plan)) return null;
  const price = PASS_PRICES[currency][plan];
  const money = (m: number) => formatMoney(m, currency, words);
  const per = (price: string) => (plan === "yearly" ? words("house.pass.perYear", { price }) : words("house.pass.perMonth", { price }));
  const then = `then ${per(money(price))}`;
  if (t.kind === "trial") return { plan, label: planLabel(plan), first: `Free for ${months(t.months ?? 1)}`, then, firstMinor: 0 };
  const off = t.kind === "percent" ? Math.round((price * (t.percentOff ?? 0)) / 100) : Math.min(price, t.amountOff?.[currency] ?? 0);
  const cut = price - off;
  if (t.duration === "always") return { plan, label: planLabel(plan), first: per(money(cut)), then: null, firstMinor: cut };
  const span =
    plan === "yearly"
      ? (t.duration === "months" && (t.months ?? 1) > 12 ? "the first 2 years" : "the first year")
      : t.duration === "months" && (t.months ?? 1) > 1
        ? `a month for ${months(t.months!)}`
        : "the first month";
  return { plan, label: planLabel(plan), first: `${money(cut)} ${span}`, then, firstMinor: cut };
}

/** Every plan it's on, with its price, in the Pass page's order. */
export function promotionPrices(t: PromotionTerms, currency: Currency): PromotionPrice[] {
  return PASS_ON_SALE.map((p) => promotionPrice(t, p, currency)).filter((p): p is PromotionPrice => p !== null);
}

// --- The owner's form --------------------------------------------------------------------------

/** owner_make_promotion on /v1: a promotion to make. An amount off is in US cents; the other currencies follow. */
export const PromotionRequest = z.object({
  name: z.string().trim().min(1).max(PROMOTION_LIMITS.name),
  note: z.string().trim().max(PROMOTION_LIMITS.note).nullable().default(null),
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{4,20}$/)),
  kind: z.enum(PROMOTION_KINDS),
  percent: z.number().int().min(1).max(100).nullable().default(null),
  amount: z.number().int().min(1).max(100_000).nullable().default(null),
  duration: z.enum(PROMOTION_DURATIONS).nullable().default(null),
  months: z.number().int().min(1).max(PROMOTION_LIMITS.months).nullable().default(null),
  plans: z.array(z.enum(PASS_PURCHASES)).default([]),
  audience: z.enum(PROMOTION_AUDIENCES),
  people: z.array(z.string()).max(PROMOTION_LIMITS.people).default([]),
  endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
});
export type PromotionRequest = z.infer<typeof PromotionRequest>;

export const PromotionMade = z.object({
  ok: z.literal(true),
  id: z.string(),
  code: z.string(),
  /** False when it's saved but Stripe couldn't be reached: its page offers Try again. */
  ready: z.boolean(),
});
export type PromotionMade = z.infer<typeof PromotionMade>;

/** owner_promotion_emails on /v1: how many it went to. */
export const PromotionEmailed = z.object({ ok: z.literal(true), sent: z.number() });

/** The fields of the form that can be wrong. */
export type PromotionField = "name" | "note" | "code" | "gives" | "months" | "plans" | "people" | "endsAt" | "maxUses";

/** What's wrong with a draft, by field, in sentences fit to show under it. Empty when it can be made. */
export function promotionProblems(d: PromotionRequest, now: Date): Partial<Record<PromotionField, string>> {
  const out: Partial<Record<PromotionField, string>> = {};
  if (!d.name.trim()) out.name = "Give it a name, for you.";
  if (!/^[A-Z0-9]{4,20}$/.test(d.code)) out.code = "A code is 4 to 20 letters and numbers.";
  if (d.kind === "percent" && !d.percent) out.gives = "Say how much off, from 1 to 100%.";
  if (d.kind === "amount" && !d.amount) out.gives = "Say how much off.";
  if ((d.kind === "percent" || d.kind === "amount") && !d.duration) out.gives = "Say how long it lasts.";
  if ((d.kind === "trial" || ((d.kind === "percent" || d.kind === "amount") && d.duration === "months")) && !d.months) {
    out.months = "Say how many months.";
  }
  if (d.kind !== "gift" && d.plans.length === 0) out.plans = "Pick at least one plan.";
  if (d.plans.some((p) => !onSale(p))) out.plans = "The Pass is sold yearly or monthly; a free Pass for good is a gift.";
  if (d.audience === "named") {
    const { emails, bad } = parsePeople(d.people.join("\n"));
    if (bad.length) out.people = `${bad[0]} isn’t an email.`;
    else if (emails.length === 0) out.people = "Add the emails of the people it’s for.";
    else if (emails.length > PROMOTION_LIMITS.people) out.people = `Up to ${PROMOTION_LIMITS.people} people.`;
  }
  if (d.endsAt && new Date(d.endsAt).getTime() <= now.getTime()) out.endsAt = "Pick an end day after today.";
  return out;
}

/** The draft as owner_make_promotion takes it: only what its kind uses, people as normal emails. */
export function promotionArgs(d: PromotionRequest) {
  const money = d.kind === "percent" || d.kind === "amount";
  return {
    p_code: d.code,
    p_name: d.name.trim(),
    p_note: d.note?.trim() || null,
    p_kind: d.kind,
    p_percent: d.kind === "percent" ? d.percent : null,
    p_amount: d.kind === "amount" && d.amount ? promotionAmounts(d.amount) : null,
    p_duration: money ? d.duration : null,
    p_months: d.kind === "trial" || d.kind === "gift" || d.duration === "months" ? d.months : null,
    p_plans: d.kind === "gift" ? [] : [...new Set(d.plans)],
    p_audience: d.audience,
    p_people: d.audience === "named" ? parsePeople(d.people.join("\n")).emails : [],
    p_ends_at: d.endsAt,
    p_max_uses: d.audience === "anyone" ? d.maxUses : null,
  };
}

/** The draft's terms, for its preview before it's made. */
export function draftTerms(d: PromotionRequest): PromotionTerms {
  const a = promotionArgs(d);
  return {
    kind: d.kind,
    percentOff: a.p_percent,
    amountOff: a.p_amount,
    duration: a.p_duration,
    months: a.p_months,
    plans: a.p_plans,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
  };
}

// --- Using one ---------------------------------------------------------------------------------

export const OFFER_REFUSALS = [
  "offer_unknown",
  "offer_ended",
  "offer_used_up",
  "offer_not_yours",
  "offer_used",
  "offer_plan",
  "offer_has_pass",
] as const;
export type OfferRefusal = (typeof OFFER_REFUSALS)[number];

/** A promotion as the check at checkout reads it. */
export interface OfferFacts {
  state: "making" | "live" | "stopped";
  audience: PromotionAudience;
  terms: PromotionTerms;
  maxUses: number | null;
  /** Houses that have used it. */
  uses: number;
  /** For a named one: whether the signed-in email is on it, and has used it. */
  listed: boolean;
  personUsed: boolean;
  /** Whether this house has used it. */
  houseUsed: boolean;
}

/** How a promotion stands at `now`, as owner_promotions_find says. */
export function promotionState(f: Pick<OfferFacts, "state" | "maxUses" | "uses" | "terms">, now: Date): PromotionState {
  if (f.state !== "live") return f.state;
  if (f.terms.endsAt && f.terms.endsAt.getTime() <= now.getTime()) return "ended";
  if (f.maxUses !== null && f.uses >= f.maxUses) return "ended";
  return "live";
}

/**
 * Why this person can't use the offer on this house and plan, or null when
 * they can. `plan` is null for a free Pass, which isn't bought.
 */
export function offerRefusal(f: OfferFacts | null, house: { pass: HousePass; plan: PassPurchase | null }, now: Date): OfferRefusal | null {
  if (!f) return "offer_unknown";
  if (f.state !== "live" || (f.terms.endsAt && f.terms.endsAt.getTime() <= now.getTime())) return "offer_ended";
  if (f.audience === "named" && !f.listed) return "offer_not_yours";
  if (f.houseUsed || f.personUsed) return "offer_used";
  if (f.maxUses !== null && f.uses >= f.maxUses) return "offer_used_up";
  if (f.terms.kind === "gift") {
    if (house.pass.plan === "founding" || (house.pass.plan !== "trial" && hasPass(house.pass, now))) return "offer_has_pass";
    return null;
  }
  if (!house.plan || !f.terms.plans.includes(house.plan)) return "offer_plan";
  return null;
}

/** What GET /api/offer/[code] answers: the offer as anyone with the link sees it, and, signed in, whether it's theirs. */
export const OfferView = z.object({
  code: z.string(),
  state: z.enum(["live", "ended"]),
  /** The sign: "Half off" on the amber plate, the line under it. */
  legend: z.string(),
  plate: z.string(),
  title: z.string(),
  sentence: z.string(),
  note: z.string().nullable(),
  kind: z.enum(PROMOTION_KINDS),
  named: z.boolean(),
  currency: z.enum(CURRENCIES),
  prices: z.array(
    z.object({ plan: z.enum(PASS_PURCHASES), label: z.string(), first: z.string(), then: z.string().nullable(), firstMinor: z.number() }),
  ),
  endsAt: z.string().nullable(),
  /** Signed in: who as, whether it's for them, and the houses they could use it on (null when they can). */
  you: z
    .object({
      email: z.string(),
      forYou: z.boolean(),
      houses: z.array(z.object({ id: z.string(), name: z.string(), currency: z.enum(CURRENCIES), refusal: z.string().nullable() })),
    })
    .nullable(),
});
export type OfferView = z.infer<typeof OfferView>;

/** The offer code in an offer link's path, as typed (upper-cased), or null when it can't be one. */
export function offerCodeIn(path: string): string | null {
  const match = /^\/offer\/([^/?#]+)\/?$/.exec(path);
  if (!match) return null;
  return offerCode(decodeURIComponent(match[1]));
}

/** A code as a link carries it, upper-cased, or null when it can't be a promotion's. */
export function offerCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,20}$/.test(code) ? code : null;
}

/** An offer's small print: who it's for, how long, and whether a card is needed. */
export function offerSmallPrint(email: string, until: string | null, gift: boolean, words: Words): string {
  return words("house.promotion.smallPrint", { email, hasUntil: until !== null, until: until ?? "", gift });
}
