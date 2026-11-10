import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { z } from "zod";

import type { ListFacet } from "./admin-list";
import { PASS_COPY } from "./copy";
import { formatMoney } from "./money";
import { PASS_PRICES, type PassPurchase } from "./pass";
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

/** The draft as POST /api/admin/promotions takes it. Unreadable numbers go as null, so promotionProblems names them. */
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
    plans: d.kind === "gift" ? [] : d.kind === "trial" ? d.plans.filter((p) => p !== "founding") : d.plans,
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

/** POST /api/admin/promotions/[id]/retry: whether it's live now. */
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
  return p.terms.endsAt ? format(p.terms.endsAt, "d MMM", { in: tz(zone) }) : "Never";
}

/** One line for a phone's list and Recent: "Half off, first payment, 3 people, 1 of 3 used". */
export function promotionMeta(p: PromotionRow): string {
  return `${promotionGives(p.terms)}, ${promotionWho(p).toLowerCase()}, ${promotionUsed(p)} used`;
}

/** Who can use it, in a sentence, for the preview and its page. */
export function promotionWhoSentence(audience: PromotionAudience, emails: readonly string[], maxUses: number | null, endsAt: Date | null, zone: string): string {
  const until = endsAt ? `, until ${format(endsAt, "d MMMM", { in: tz(zone) })}` : "";
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
export function planPrice(plan: PassPurchase): string {
  const price = formatMoney(PASS_PRICES.USD[plan], "USD");
  return plan === "yearly" ? PASS_COPY.perYear(price) : plan === "monthly" ? PASS_COPY.perMonth(price) : PASS_COPY.once(price);
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
  const day = (iso: string) => format(new Date(iso), "d MMM", { in: tz(zone) });
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

export const PROMOTIONS_COPY = {
  page: "Promotions",
  newPromotion: "New promotion",
  all: "All promotions",
  recent: "Recent",
  nothing: "No promotions yet",
  nothingBody: "Make one to give houses money off their Pass, some months free, or a free Pass.",
  searchPlaceholder: "Name, code or email",
  count: (n: string) => (n === "1" ? "1 promotion" : `${n} promotions`),
  columns: { name: "Name", gives: "Gives", who: "Who", used: "Used", ends: "Ends" },
  // The form.
  name: "Name, for you",
  nameHint: "Only you see it.",
  gives: "What it gives",
  kind: { percent: "% off", amount: "$ off", trial: "Months free", gift: "Free Pass" } satisfies Record<PromotionKind, string>,
  percent: "How much off, in %",
  amount: "How much off, in dollars",
  amountHint: "Other currencies get the same, at the Pass's own prices.",
  duration: "For how long",
  durations: { once: "First payment", months: "Some months", always: "Always" } satisfies Record<PromotionDuration, string>,
  months: "How many months",
  trialHint: "Free before the first payment. They add a card, and can cancel before it ends.",
  giftLength: "For how long",
  giftLengths: { months: "Some months", forever: "For good" } satisfies Record<GiftLength, string>,
  giftHint: "No card. For good makes the house a Founding house.",
  plans: "Plans",
  who: "Who can use it",
  audiences: { anyone: "Anyone with the link", named: "Only these people" } satisfies Record<PromotionAudience, string>,
  people: "Their emails",
  peopleHint: "One a line, or pasted from anywhere. They must be signed in to Jonz with that email to use it.",
  peopleCount: (n: number) => (n === 1 ? "1 person" : `${n} people`),
  maxUses: "Up to how many houses",
  maxUsesHint: "Leave it empty for no limit.",
  ends: "Ends",
  endsChoices: { never: "Never", day: "On a day" } satisfies Record<PromotionEnds, string>,
  endsOn: "Last day, as 2026-12-31",
  note: "A line for them",
  noteHint: "They read it first, on the link and in the email: “Thanks for helping test Jonz.”",
  code: "Code in the link",
  codeHint: "4 to 20 letters and numbers. Made from the name; change it if you like.",
  make: "Make it",
  making: "Making…",
  see: "See what they get",
  auditNote: "Making, stopping and emailing one are kept in the audit log.",
  // The preview.
  whatTheyGet: "What they get",
  whatTheyPay: "What they pay",
  whoTitle: "Who",
  giftFrom: "A gift from Jonz",
  notIn: "Not in this promotion",
  noPlans: "Pick a plan to see what they pay.",
  // Made.
  made: "Made. Copy the link to share it.",
  madeNotReady: "Saved, but Stripe didn’t answer. Try again from its page.",
  // Its page.
  link: "The link",
  linkMeta: "Opens Jonz with the offer.",
  copy: "Copy link",
  copied: "Link copied",
  share: "Share",
  emailThem: (n: number) => (n === 1 ? "Email 1 person" : `Email ${n} people`),
  emailedAll: "Everyone on it has been emailed",
  emailed: (n: number) => (n === 0 ? "No one new to email" : n === 1 ? "Emailed 1 person" : `Emailed ${n} people`),
  emailNote: "Each person gets the offer once, however often you press it.",
  peopleTitle: "Who it’s for",
  stage: { used: "Used", opened: "Opened", emailed: "Emailed", waiting: "Not yet" } satisfies Record<PersonStage, string>,
  uses: "Houses that used it",
  noUses: "No house has used it yet.",
  houseGone: "A house since deleted",
  stop: "Stop it",
  stopTitle: "Stop this promotion?",
  stopBody: "Its link stops working from now. Houses that used it keep what they got.",
  stopped: "Stopped",
  tryAgain: "Try again",
  notReady: "Not ready",
  notReadyBody: "It’s saved, but Stripe hasn’t made its coupon yet, so the link doesn’t work. Try again.",
  ready: "It’s live now",
  stillNotReady: "Stripe still didn’t answer. Try again in a minute.",
  stateChip: { making: "Not ready", live: "Live", ended: "Ended", stopped: "Stopped" } satisfies Record<PromotionState, string>,
  usedLine: (used: string) => `${used} used`,
  notFound: "That promotion isn’t there.",
} as const;
