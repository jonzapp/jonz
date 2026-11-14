import { z } from "zod";
import { dateIn } from "./format";
import type { Words } from "./words-for";

// How much Ask Jonz a house and an account get in a week, and how much
// of it each person has used.

/**
 * A house's Ask Jonz for a week, in Claude's tokens (what it reads and
 * writes): one pool the whole house shares, bigger with the House Pass. It
 * comes back when the house's week starts. A turn is about 6,000 to 20,000
 * tokens, so the free pool is a good few dozen questions and the Pass's a
 * few hundred. Starter lists are free and unlimited.
 */
export const ASK_POOL_TOKENS = { free: 400_000, pass: 2_000_000 } as const;
/** What a turn holds against the pool while Claude answers, so turns sent together can't all slip in; its answer puts in what it used. */
export const ASK_TURN_RESERVE = 10_000;
/** The most of the pool one person can use when the house has two or more people: nobody can use it all up. */
export const ASK_SHARE_MAX = 0.5;
/**
 * Messages one person can send Claude in a day, whichever house they're in,
 * so nobody gets more by leaving a house and starting another.
 */
export const CHAT_TURNS_PER_PERSON_PER_DAY = 40;
/**
 * A person's Ask Jonz over the last this-many days, whichever house they
 * were in, can't pass their house's weekly pool: leaving a house and
 * starting another doesn't give them a fresh one. Rolling, so it comes back
 * as their oldest turns drop off.
 */
export const ASK_ACCOUNT_DAYS = 7;

/** How much of this week's Ask Jonz a person has left, shown under the chat. */
export const AskAllowance = z.object({
  /** What's left of what they may still use this week, 0 to 1. */
  left: z.number().min(0).max(1),
  /** Whether the house's pool (not their own share) is what runs out first. */
  house: z.boolean(),
  /** Which runs out first: the house's pool, their share of it, or their account's (any house, last ASK_ACCOUNT_DAYS days). */
  limit: z.enum(["house", "mine", "account"]),
  /** When it comes back: the start of the house's next week, or when the account's oldest turn drops off. */
  resetsAt: z.string(),
});
export type AskAllowance = z.infer<typeof AskAllowance>;

/** What a person's account has used of Ask Jonz in the last ASK_ACCOUNT_DAYS days, in any house. */
export interface AccountUse {
  used: number;
  /** When its oldest turn in the window drops off; null when there's none. */
  backAt: Date | null;
}

/**
 * A person's cap and what's left of it, from the week's pool, how much the
 * house and they have used, and their account's use in any house (its cap is
 * the pool too: a new house is no fresh start).
 */
export function askAllowance(input: {
  pool: number;
  people: number;
  houseUsed: number;
  mineUsed: number;
  resetsAt: Date;
  account?: AccountUse;
}): AskAllowance & { cap: number; room: number } {
  const cap = input.people >= 2 ? Math.floor(input.pool * ASK_SHARE_MAX) : input.pool;
  const mine = Math.max(0, cap - input.mineUsed);
  const house = Math.max(0, input.pool - input.houseUsed);
  const account = Math.max(0, input.pool - (input.account?.used ?? 0));
  const room = Math.min(mine, house, account);
  // On your own the house's pool is yours, so it's the house's that runs out.
  const houseFirst = input.people < 2 || house < mine;
  const limit = account < Math.min(mine, house) ? "account" : houseFirst ? "house" : "mine";
  const resetsAt = limit === "account" && input.account?.backAt ? input.account.backAt : input.resetsAt;
  return { cap, room, left: cap > 0 ? Math.min(1, room / cap) : 0, house: houseFirst, limit, resetsAt: resetsAt.toISOString() };
}

/** Under this much left, the chat warns over the message box. */
export const ASK_LOW = 0.25;

/** The week's Ask Jonz for the usage page and the chat: what's left, what each has used, and when it's back. */
export const AskUsage = AskAllowance.extend({
  /** Whether the house has the House Pass (the bigger pool). */
  pass: z.boolean(),
  /** How many live in the house. With two or more nobody uses more than half. */
  people: z.number().int().min(1),
  /** How much of the house's pool is used, 0 to 1. */
  houseUsed: z.number().min(0).max(1),
  /** How much of what they may use (their half, or the pool on their own) is used, 0 to 1. */
  mineUsed: z.number().min(0).max(1),
  /** Each person who has used some, most first, as a share of the house's pool. */
  usedBy: z.array(z.object({ userId: z.uuid(), used: z.number().min(0).max(1) })),
});
export type AskUsage = z.infer<typeof AskUsage>;

/** When the week's Ask Jonz comes back, in the house's time: "Monday at 00:00". */
export function askBackOn(resetsAt: string, zone: string, words: Words): string {
  const at = new Date(resetsAt);
  return words("common.date.dayAt", { day: dateIn(at, "weekdayLong", zone, words), time: dateIn(at, "time", zone, words) });
}

/** The usage page's figures, from the pool, who lives in the house, and the tokens each has used this week. */
export function askUsage(input: {
  pool: number;
  pass: boolean;
  people: readonly string[];
  me: string;
  used: ReadonlyMap<string, number>;
  resetsAt: Date;
  account?: AccountUse;
}): AskUsage {
  const houseUsed = [...input.used.values()].reduce((a, b) => a + b, 0);
  const mineUsed = input.used.get(input.me) ?? 0;
  const { cap, left, house, limit, resetsAt } = askAllowance({
    pool: input.pool,
    people: input.people.length,
    houseUsed,
    mineUsed,
    resetsAt: input.resetsAt,
    account: input.account,
  });
  const allowance = { left, house, limit, resetsAt };
  const share = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : 1);
  return {
    ...allowance,
    pass: input.pass,
    people: Math.max(1, input.people.length),
    houseUsed: share(houseUsed, input.pool),
    mineUsed: share(mineUsed, cap),
    usedBy: input.people
      .map((userId) => ({ userId, used: share(input.used.get(userId) ?? 0, input.pool) }))
      .sort((a, b) => b.used - a.used),
  };
}
