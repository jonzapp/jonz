import { z } from "zod";

import { BUDGETS, CATEGORIES, CURRENCIES, DEAL_MODES, HOUSE_KINDS, JOHN_WHEN, SETTLE_IN } from "./domain";
import { PASS_PURCHASES } from "./pass";

// Shapes the apps and the API agree on. The API validates requests with
// these and the native app parses responses with them; the web's server
// actions validate their input with the same ones.

/**
 * A join code's alphabet: new_join_code's, with no look-alikes (no 0/O,
 * 1/I/L), so a code read aloud or typed from a screenshot survives.
 */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

const JOIN_CODE = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

/**
 * A join code as people type it: any case, spaces or dashes between pairs,
 * tidied to the database's eight characters. Null when it can't be one, so a
 * typo is caught before it reaches the house.
 */
export function normaliseJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return JOIN_CODE.test(code) ? code : null;
}

export const JoinCode = z.string().transform((value, ctx) => {
  const code = normaliseJoinCode(value);
  if (!code) {
    ctx.addIssue({ code: "custom", message: "A join code is eight letters and numbers." });
    return z.NEVER;
  }
  return code;
});

/** Setting up a house: what create_house takes. */
export const CreateHouse = z.object({
  name: z.string().trim().min(1, "Give the house a name.").max(60),
  timezone: z.string().min(1),
  currency: z.enum(CURRENCIES),
  weekStarts: z.coerce.number().int().min(1).max(7),
  /** Who lives here: housemates unless it says family. */
  kind: z.enum(HOUSE_KINDS).optional(),
});
export type CreateHouse = z.infer<typeof CreateHouse>;

/** How long a tick can be disputed, in hours: at least 12 in a housemates' house (houses_dispute_hours_fair). */
export const DISPUTE_HOURS = [12, 24, 48, 72] as const;

/** How long past its due time a John stays its owner's before a housemate can cover it (houses.cover_grace_hours). */
export const COVER_GRACE_HOURS = [0, 1, 3, 6, 12, 24] as const;

/** How long past its due time a John can still be done late, before it's missed (houses.late_hours). */
export const LATE_HOURS = [12, 24, 48, 72] as const;

/** How much of a share time away still owes, in percent (houses.away_makeup). */
export const AWAY_MAKEUP = [100, 50, 0] as const;

/** The most a stake or a forfeit can be, in minor units: 1,000 of the currency. */
export const MAX_AMOUNT_MINOR = 100_000;

const amount = z.coerce
  .number()
  .int()
  .min(0, "Amounts can’t be negative.")
  .max(MAX_AMOUNT_MINOR, "Amounts are up to 1,000.");

/** The house rules an admin can change: the houses columns granted to them. */
export const HouseSettings = z.object({
  name: z.string().trim().min(1, "Give the house a name.").max(60),
  timezone: z.string().trim().min(1, "Say which time zone the house is in."),
  currency: z.enum(CURRENCIES),
  weekStarts: z.coerce.number().int().min(1).max(7),
  stakeMinor: amount,
  lateForfeitMinor: amount,
  missedForfeitMinor: amount,
  disputeHours: z.coerce.number().int().min(0).max(72),
  /** Absent from a form that doesn't show it (the older web's), which leaves the house's as it is. */
  coverGraceHours: z.coerce.number().int().min(0).max(48).optional(),
  /** Absent from a form that doesn't show it, like coverGraceHours. */
  lateHours: z.coerce.number().int().min(1).max(72).optional(),
  awayMakeup: z.coerce.number().int().refine((n) => (AWAY_MAKEUP as readonly number[]).includes(n)),
  /** Where the house settles up at month end (houses.settle_in). Absent from a form that doesn't show it, like coverGraceHours. */
  settleIn: z.enum(SETTLE_IN).optional(),
  /** Steady weeks: absent from a form that doesn't show them, like coverGraceHours. */
  dealMode: z.enum(DEAL_MODES).optional(),
  dealBudget: z.coerce.number().int().refine((n) => (BUDGETS as readonly number[]).includes(n)).optional(),
  /** In a family: the most each kid can earn in a month (houses.pocket_cap_minor). Absent from a housemates' form. */
  pocketCapMinor: amount.optional(),
});
export type HouseSettings = z.infer<typeof HouseSettings>;

/** One John on the house's list, as an admin adds or edits it. `id` is absent for a new one. */
/** A John's fields, before their one check across fields (johnMonthly). */
export const JohnFields = z.object({
  name: z.string().trim().min(1, "Name the John.").max(60),
  category: z.enum(CATEGORIES),
  points: z.coerce.number().int().min(1).max(20),
  everyWeeks: z.coerce.number().int().min(1).max(26),
  // A John that repeats in months (repeat.ts): how many apart, which of its
  // weekday in the month (5 the last), and a month it lands in (null: from the
  // next one). All null for a John that repeats in weeks.
  everyMonths: z.number().int().min(1).max(60).nullable().default(null),
  weekOfMonth: z.number().int().min(1).max(5).nullable().default(null),
  anchorMonth: z.number().int().nullable().default(null),
  /** The week a weekly John counts from: set when it's added, and kept. */
  anchorWeek: z.number().int().optional(),
  dueDow: z.coerce.number().int().min(1).max(7),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Give a time like 21:00."),
  needsPhoto: z.boolean(),
  groupId: z.uuid().nullable(),
  // On call (johns.kind): its window and its weight in the deal. A John due on
  // a day keeps its due day and time for if it goes back to one.
  when: z.enum(JOHN_WHEN).default("day"),
  respondHours: z.coerce.number().int().min(1, "Give between 1 and 72 hours.").max(72, "Give between 1 and 72 hours.").default(12),
  perWeek: z.coerce.number().int().min(1).max(14).default(2),
  // Done by (johns.crew): how many do it together, 1 to 6, or 0 for everyone
  // home. Its points are per person. On call is always one.
  crew: z.coerce.number().int().min(0).max(6).default(1),
  // Keep its day (johns.keep_day): always dealt, on its own day. Never on call.
  keepDay: z.boolean().default(false),
  // In a family (johns.pay_minor): what it earns a kid. Absent from a form
  // that doesn't show it, which leaves the John's as it is.
  payMinor: amount.optional(),
  // In a family (johns.min_age): the youngest a kid can be to be dealt it,
  // or null for anyone. Absent leaves the John's as it is.
  minAge: z.number().int().min(2, "Give an age from 2 to 18.").max(18, "Give an age from 2 to 18.").nullable().optional(),
});

/** A John that repeats in months says which week of the month; one in weeks says neither. */
export const johnMonthly = [(j: { everyMonths: number | null; weekOfMonth: number | null }) => (j.everyMonths === null) === (j.weekOfMonth === null), "Say which week of the month it lands in."] as const;

export const JohnDraft = JohnFields.extend({ id: z.uuid().optional() }).refine(...johnMonthly);
export type JohnDraft = z.infer<typeof JohnDraft>;
/** A JohnDraft before it is checked: the monthly fields may be left out (a weekly John). */
export type JohnDraftInput = z.input<typeof JohnDraft>;

/** A group of housemates who share some Johns (one of two bathrooms): what save_group takes. */
export const GroupDraft = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the group.").max(40),
  members: z.array(z.uuid()).min(1, "Pick at least one person."),
});
export type GroupDraft = z.infer<typeof GroupDraft>;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Time away you book for yourself: local first and last days, inclusive, and where. set_away decides the rest. */
export const AwayDraft = z.object({
  from: z.string().regex(LOCAL_DATE, "Pick the first day you’re away."),
  to: z.string().regex(LOCAL_DATE, "Pick the last day you’re away."),
  note: z.string().trim().max(60).optional(),
});
export type AwayDraft = z.infer<typeof AwayDraft>;

/** set_away on /v1's answer: how many of your Johns booking made due before you go, handed to housemates, or skipped. */
export const AwayResponse = z.object({
  ok: z.literal(true),
  before: z.number().int().min(0),
  handed: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type AwayResponse = z.infer<typeof AwayResponse>;

/** A name you go by: what renaming yourself writes to profiles.display_name. */
export const DisplayName = z.string().trim().min(1, "Names are 1 to 60 characters.").max(60, "Names are 1 to 60 characters.");

/** Every API error: `{ "error": "..." }`, a sentence fit to show. */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/** catch_up on /v1: catch this house up before showing it. */
export const FreshRequest = z.object({ houseId: z.uuid() });
export type FreshRequest = z.infer<typeof FreshRequest>;

/** `ticked`: false when the house was already caught up in the last minute. */
export const FreshResponse = z.object({ ticked: z.boolean() });
export type FreshResponse = z.infer<typeof FreshResponse>;

/** raise_dispute on /v1: say a housemate's tick wasn't really done. */
export const RaiseDispute = z.object({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(1, "Say what’s wrong with it.").max(280, "Keep it under 280 characters."),
});
export type RaiseDispute = z.infer<typeof RaiseDispute>;

/** The sentence for a RaiseDispute that didn't parse: the reason's own, or which John. */
export function disputeProblem(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues.find((issue) => issue.path[0] === "reason")?.message ?? "Say which John to dispute.";
}

/** cast_vote on /v1: `uphold` true says it wasn't done. */
export const CastVote = z.object({ uphold: z.boolean() });
export type CastVote = z.infer<typeof CastVote>;

/** answer_tick on /v1: a parent answers a kid's tick (family step 2). `ok` false is Not yet. */
export const AnswerTick = z.object({ ok: z.boolean() });
export type AnswerTick = z.infer<typeof AnswerTick>;

/** deal_week on /v1: hand out this week's Johns, or re-deal a week nobody has ticked in. */
export const DealRequest = z.object({ houseId: z.uuid() });
export type DealRequest = z.infer<typeof DealRequest>;

/** raise_flag on /v1: say an on-call John needs doing. */
export const RaiseFlag = z.object({ johnId: z.uuid() });
export type RaiseFlag = z.infer<typeof RaiseFlag>;

/** The flag it opened, or the one already open: whoever is on call ticks that. */
export const FlagResponse = z.object({ ok: z.literal(true), assignmentId: z.uuid() });
export type FlagResponse = z.infer<typeof FlagResponse>;

/**
 * roll_call on /v1: tick a John with who did it (crew.ts). `crew` is
 * everyone on it, you among them: holders left off are absent, anyone else
 * helped.
 */
export const RollCallRequest = z.object({
  assignmentId: z.uuid(),
  crew: z.array(z.uuid()).min(1).max(20),
  photoPath: z.string().min(1).max(300).optional(),
});
export type RollCallRequest = z.infer<typeof RollCallRequest>;

/** How many did it. */
export const RollCallResponse = z.object({ ok: z.literal(true), people: z.number().int() });
export type RollCallResponse = z.infer<typeof RollCallResponse>;

/** offer_swap on /v1: ask a housemate who'd rather do your John to swap it for one of theirs. */
export const SwapAskRequest = z.object({ mine: z.uuid(), theirs: z.uuid() });
export type SwapAskRequest = z.infer<typeof SwapAskRequest>;

/** The ask's id. */
export const SwapAskResponse = z.object({ ok: z.literal(true), offerId: z.uuid() });
export type SwapAskResponse = z.infer<typeof SwapAskResponse>;

/** pass_checkout on /v1: buy the House Pass for a house, on the web. */
/**
 * pass_checkout on /v1: buy a plan for a house. `offer` is a promotion's
 * code from its link (docs/specs/promotions.md); a free Pass takes any plan.
 */
export const PassCheckoutRequest = z.object({
  houseId: z.uuid(),
  plan: z.enum(PASS_PURCHASES),
  offer: z.string().trim().min(1).max(40).optional(),
});
export type PassCheckoutRequest = z.infer<typeof PassCheckoutRequest>;

/** pass_billing on /v1: the buyer changes or cancels the house's plan. */
export const PassManageRequest = z.object({ houseId: z.uuid() });
export type PassManageRequest = z.infer<typeof PassManageRequest>;

/** Where to send the browser next: Stripe's checkout or its billing page. */
export const PassRedirect = z.object({ url: z.url() });
export type PassRedirect = z.infer<typeof PassRedirect>;

/** What a move answers when the database took it. */
export const MoveResponse = z.object({ ok: z.literal(true) });
export type MoveResponse = z.infer<typeof MoveResponse>;
