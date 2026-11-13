import { z } from "zod";

import type { ListFacet } from "./admin-list";
import { formatMoney } from "./money";
import { onSale, PASS_PRICES, type PassOnSale, type PassPurchase } from "./pass";
import {
  parsePeople,
  promotionGives,
  type PromotionAudience,
  type PromotionDuration,
  type PromotionKind,
  type PromotionRequest,
  type PromotionState,
  type PromotionTerms,
} from "./promotions";
import { dateIn } from "./format";
import { wordsFor } from "./words-for";

// The owner's pages are in English for now (translation 6).
const words = wordsFor("en", "housemates");

// The owner's Promotions page (docs/specs/promotions.md): the form's words,
// the form as typed made into a request, and how a promotion reads in the
// owner's lists. promotions.ts has the words the people it's for read.

/** How long a free Pass lasts: some months, or for good. */
export const GIFT_LENGTHS = ["months", "forever"] as const;
export type GiftLength = (typeof GIFT_LENGTHS)[number];

/** When it stops working: never, or at the end of a day. */
export const PROMOTION_ENDS = ["never", "day"] as const;
export type PromotionEnds = (typeof PROMOTION_ENDS)[number];

/** The form as the owner types it: numbers and the day as text, the emails as one box. */
export interface PromotionDraft {
  name: string;
  note: string;
  code: string;
  kind: PromotionKind;
  percent: string;
  amount: string;
  duration: PromotionDuration;
  months: string;
  gift: GiftLength;
  plans: PassPurchase[];
  audience: PromotionAudience;
  people: string;
  ends: PromotionEnds;
  /** "2026-12-31": it works until the end of that day, where the owner is. */
  endsOn: string;
  maxUses: string;
}

export const PROMOTION_DRAFT: PromotionDraft = {
  name: "",
  note: "",
  code: "",
  kind: "percent",
  percent: "50",
  amount: "10",
  duration: "once",
  months: "3",
  gift: "months",
  plans: ["yearly", "monthly"],
  audience: "anyone",
  people: "",
  ends: "never",
  endsOn: "",
  maxUses: "",
};

const whole = (text: string): number | null => {
  const t = text.trim().replace(/[%$,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
};

/** "2026-12-31" as the last minute of that day where the owner is, or null when it isn't a day. */
export function endOfDay(text: string): Date | null {
  const match = text.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d, 23, 59);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** A day as endOfDay reads it, for the field's starting text. */
export function formatDay(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** An amount in dollars, "10" or "9.50", in cents; null when it isn't one. */
function dollars(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** The draft as owner_make_promotion on /v1 takes it. Unreadable numbers go as null, so promotionProblems names them. */
export function draftRequest(d: PromotionDraft): PromotionRequest {
  const money = d.kind === "percent" || d.kind === "amount";
  const months = d.kind === "trial" || (money && d.duration === "months") || (d.kind === "gift" && d.gift === "months") ? whole(d.months) : null;
  const endsAt = d.ends === "day" ? endOfDay(d.endsOn) : null;
  return {
    name: d.name.trim(),
    note: d.note.trim() || null,
    code: d.code.trim().toUpperCase(),
    kind: d.kind,
    percent: d.kind === "percent" ? whole(d.percent) : null,
    amount: d.kind === "amount" ? dollars(d.amount) : null,
    duration: money ? d.duration : null,
    months,
    plans: d.kind === "gift" ? [] : d.plans.filter(onSale),
    audience: d.audience,
    people: d.audience === "named" ? parsePeople(d.people).emails.concat(parsePeople(d.people).bad) : [],
    endsAt: endsAt ? endsAt.toISOString() : null,
    maxUses: d.audience === "anyone" ? whole(d.maxUses) : null,
  };
}

/** The checks promotionProblems can't make from the request: a day that isn't one, a limit that isn't a number. */
export function draftProblems(d: PromotionDraft): { endsAt?: string; maxUses?: string; gives?: string } {
  const out: { endsAt?: string; maxUses?: string; gives?: string } = {};
  if (d.ends === "day" && !endOfDay(d.endsOn)) out.endsAt = "Type the day as 2026-12-31.";
  if (d.audience === "anyone" && d.maxUses.trim() && !whole(d.maxUses)) out.maxUses = "Type how many houses, or leave it empty.";
  if (d.kind === "percent" && d.percent.trim() && (whole(d.percent) === null || whole(d.percent)! > 100)) out.gives = "Say how much off, from 1 to 100%.";
  if (d.kind === "amount" && d.amount.trim() && dollars(d.amount) === null) out.gives = "Type the amount in dollars, like 10.";
  return out;
}

/** retry_promotion on /v1: whether it's live now. */
export const PromotionReady = z.object({ ok: z.literal(true), ready: z.boolean() });

// --- How one reads in the owner's lists ------------------------------------------------------

/** A promotion as the owner's lists hold it. */
export interface PromotionRow {
  id: string;
  madeAt: string;
  code: string;
  name: string;
  terms: PromotionTerms;
  audience: PromotionAudience;
  /** Emails on a named one. */
  people: number;
  uses: number;
  maxUses: number | null;
  state: PromotionState;
}

/** "Anyone", "3 people". */
export function promotionWho(p: Pick<PromotionRow, "audience" | "people">): string {
  if (p.audience === "anyone") return "Anyone";
  return p.people === 1 ? "1 person" : `${p.people} people`;
}

/** "1 of 3", "41 of 200", "12". */
export function promotionUsed(p: Pick<PromotionRow, "audience" | "people" | "uses" | "maxUses">): string {
  const of = p.audience === "named" ? p.people : p.maxUses;
  return of === null ? String(p.uses) : `${p.uses} of ${of}`;
}

/** The Ends column: "31 Dec", "Never", or why it no longer works. */
export function promotionEnds(p: Pick<PromotionRow, "state" | "terms">, zone: string): string {
  if (p.state === "stopped") return "Stopped";
  if (p.state === "ended") return "Ended";
  if (p.state === "making") return "Not ready";
  return p.terms.endsAt ? dateIn(p.terms.endsAt, "dayMonth", zone, words) : "Never";
}

/** One line for a phone's list and Recent: "Half off, first payment, 3 people, 1 of 3 used". */
export function promotionMeta(p: PromotionRow): string {
  return `${promotionGives(p.terms)}, ${promotionWho(p).toLowerCase()}, ${promotionUsed(p)} used`;
}

/** Who can use it, in a sentence, for the preview and its page. */
export function promotionWhoSentence(audience: PromotionAudience, emails: readonly string[], maxUses: number | null, endsAt: Date | null, zone: string): string {
  const until = endsAt ? `, until ${dateIn(endsAt, "dayMonthLong", zone, words)}` : "";
  if (audience === "anyone") {
    const limit = maxUses === null ? "Anyone with the link" : `The first ${maxUses === 1 ? "house" : `${maxUses} houses`} with the link`;
    return `${limit}, once a house${until}.`;
  }
  if (emails.length === 0) return "Only the people you name, once each.";
  const named =
    emails.length <= 3
      ? emails.length === 1
        ? emails[0]
        : `${emails.slice(0, -1).join(", ")} and ${emails[emails.length - 1]}`
      : `these ${emails.length} people`;
  return `Only ${named}, once each${until}. Someone signed in with another email sees that it isn’t for them.`;
}

/** What a plan costs without a promotion, for the form's plan rows. */
export function planPrice(plan: PassOnSale): string {
  const price = formatMoney(PASS_PRICES.USD[plan], "USD", words);
  return plan === "yearly" ? words('house.pass.perYear', { price }) : words('house.pass.perMonth', { price });
}

/** Where someone named on it is: used it, opened the link, sent the email, or nothing yet. */
export type PersonStage = "used" | "opened" | "emailed" | "waiting";

export interface PromotionPerson {
  email: string;
  name: string | null;
  openedAt: string | null;
  emailedAt: string | null;
  usedAt: string | null;
}

export function personStage(p: PromotionPerson): PersonStage {
  if (p.usedAt) return "used";
  if (p.openedAt) return "opened";
  if (p.emailedAt) return "emailed";
  return "waiting";
}

/** The line under someone's email: "Used it 4 Nov", "Opened the link 6 Nov, not used", "Emailed 5 Nov, not opened", "Not sent yet". */
export function promotionPersonMeta(p: PromotionPerson, zone: string): string {
  const day = (iso: string) => dateIn(new Date(iso), "dayMonth", zone, words);
  const what = {
    used: () => `used it ${day(p.usedAt!)}`,
    opened: () => `opened the link ${day(p.openedAt!)}, not used`,
    emailed: () => `emailed ${day(p.emailedAt!)}, not opened`,
    waiting: () => "not emailed or opened",
  }[personStage(p)]();
  return p.name ? `${p.name}, ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
}

/** The people Email them would send to: named, not yet emailed, not used. */
export function toEmail(people: readonly PromotionPerson[]): number {
  return people.filter((p) => !p.emailedAt && !p.usedAt).length;
}

export const PROMOTION_FACETS: readonly ListFacet[] = [
  {
    key: "who",
    label: "Who",
    options: [
      { value: "any", label: "Anyone or named" },
      { value: "anyone", label: "Anyone with the link", words: ["anyone", "link", "public"] },
      { value: "named", label: "Only named people", words: ["named", "people", "emails", "only"] },
    ],
  },
  {
    key: "state",
    label: "State",
    options: [
      { value: "any", label: "Any state" },
      { value: "live", label: "Live", words: ["live", "working", "on"] },
      { value: "making", label: "Not ready", words: ["making", "ready", "stripe"] },
      { value: "ended", label: "Ended", words: ["ended", "over", "used up"] },
      { value: "stopped", label: "Stopped", words: ["stopped", "off"] },
    ],
  },
];
