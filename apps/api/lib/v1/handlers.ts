import "server-only";

import { bornYearOk, KIDS_COPY, PASS_COPY, PASS_ENFORCED, type ChatRequest, type OwnerAskRequest, type PassCheckoutRequest } from "@app/core";
import { fromDatabase, Problem, type HandlerContext } from "@app/server";
import type { Handlers } from "v1";

import { ensureFresh } from "@/lib/engine/fresh";
import { env } from "@/lib/env";
import { houseUsage } from "@/lib/moves/ask-usage";
import { dealThisWeek } from "@/lib/moves/deal";
import type { Caller, Refusal } from "@/lib/moves/disputes";
import { chatTurn } from "@/lib/moves/draft";
import { addKid } from "@/lib/moves/kids";
import { ownerTurn } from "@/lib/moves/owner-ask";
import { openBilling, startCheckout, type PassAnswer } from "@/lib/moves/pass";
import { retryPromotion } from "@/lib/moves/promotions";
import { resetHouse } from "@/lib/moves/resets";
import { copyNotices } from "@/lib/notices/copy";
import { offerStripe, passStripe } from "@/lib/pass/stripe";
import { userClient } from "@/lib/supabase/user";

// The /v1 operations whose logic is TypeScript (docs/specs/api.md, C2): each
// runs the same move its /api route runs, after the executor's checks (token,
// rate limit, input, house, permission, House Pass), and its answer is checked
// against the operation's contract. A move's refusal becomes the Problem a
// database function's would (fromDatabase); a Pass answer's HTTP status, its
// matching Problem. /v1's refusal codes are a fixed list (adding one breaks
// clients), so "Stripe isn't open" is `rejected`, in its own words.

/** The person, as the moves take them: a client that acts as them, and who they are. */
const callerOf = (ctx: HandlerContext): Caller => ({ db: userClient(ctx.token), userId: ctx.claims.sub });

/** A refusal word a move chose ("not_found", "promotion_unknown"), as opposed to an error's text. */
const REFUSAL_WORD = /^[a-z][a-z_]*$/;

/**
 * A move's refusal, as the Problem a database function raising it would give.
 * One without a code is the move's own word only when it looks like one; any
 * other text came from an error, and stays in the logs.
 */
export const refusal = (r: Refusal): Problem => {
  if (r.code) return fromDatabase(r);
  if (r.message && REFUSAL_WORD.test(r.message)) return fromDatabase({ code: "P0001", message: r.message });
  console.error("refusal with no code", r.message);
  return fromDatabase({});
};

const STATUS_PROBLEM: Record<number, Problem["code"]> = { 403: "forbidden", 404: "not_found", 409: "rejected", 503: "rejected" };

/** A Pass move's answer: the page to send the browser to, or the Problem its status means. */
export function passAnswer(answer: PassAnswer): { url: string } {
  if ("url" in answer) return answer;
  throw new Problem(STATUS_PROBLEM[answer.status] ?? "internal", answer.message);
}

const houseId = (ctx: HandlerContext) => ctx.input.houseId as string;
const appUrl = (ctx: HandlerContext) => env.appUrlForOrigin(ctx.origin);

export const V1_HANDLERS: Handlers = {
  async ask_usage(ctx: HandlerContext) {
    const result = await houseUsage(callerOf(ctx), houseId(ctx), ctx.now);
    if ("refusal" in result) throw refusal(result.refusal);
    return result;
  },

  async catch_up(ctx: HandlerContext) {
    // The executor found the house as the person, so it's theirs to see.
    const [house] = await ctx.tx<{ id: string; ticked_at: Date | null }[]>`select id, ticked_at from public.houses where id = ${houseId(ctx)}::uuid`;
    if (!house) throw refusal({ code: "42501", message: "not_in_house" });
    const ticked = await ensureFresh(house.id, house.ticked_at?.toISOString() ?? null, ctx.now);
    return { ticked };
  },

  async deal_week(ctx: HandlerContext) {
    const refused = await dealThisWeek(callerOf(ctx), houseId(ctx), ctx.now);
    if (refused) throw refusal(refused);
    return { ok: true };
  },

  async reset_house(ctx: HandlerContext) {
    const { weekId, userId, assignmentId, ...rest } = ctx.input;
    const result = await resetHouse(callerOf(ctx), { ...rest, week: weekId, user: userId, assignment: assignmentId } as Parameters<typeof resetHouse>[1], ctx.now);
    if ("refusal" in result) throw refusal(result.refusal);
    return result;
  },

  async add_kid(ctx: HandlerContext) {
    const { name, bornYear } = ctx.input as { name: string; bornYear: number };
    if (!bornYearOk(bornYear, ctx.now.getUTCFullYear())) throw new Problem("invalid_input", KIDS_COPY.problems.born);
    const added = await addKid(callerOf(ctx), { name, bornYear });
    if (!("userId" in added)) throw refusal(added);
    return added;
  },

  async ask_house(ctx: HandlerContext) {
    const { messages, draft } = ctx.input as Pick<ChatRequest, "messages" | "draft">;
    const result = await chatTurn(callerOf(ctx), houseId(ctx), messages, draft ?? null, ctx.now);
    if ("refusal" in result) throw refusal(result.refusal);
    return result;
  },

  async pass_checkout(ctx: HandlerContext) {
    const { plan, offer } = ctx.input as PassCheckoutRequest;
    if (!PASS_ENFORCED && !offer) throw new Problem("rejected", PASS_COPY.betaFree);
    const email = typeof ctx.claims.email === "string" ? ctx.claims.email : undefined;
    const answer = await startCheckout({ ...callerOf(ctx), email }, passStripe(), houseId(ctx), plan, appUrl(ctx), env.stage(), ctx.now, offer ?? null);
    return passAnswer(answer);
  },

  async pass_billing(ctx: HandlerContext) {
    const stripe = passStripe();
    if (!stripe) throw new Problem("rejected", PASS_COPY.checkoutClosed);
    return passAnswer(await openBilling(callerOf(ctx), stripe, houseId(ctx), appUrl(ctx)));
  },

  async ask_owner(ctx: HandlerContext) {
    const result = await ownerTurn(callerOf(ctx), (ctx.input as OwnerAskRequest).messages, ctx.now);
    if ("refusal" in result) throw refusal(result.refusal);
    return result;
  },

  async write_notice_copy(ctx: HandlerContext) {
    try {
      return { copied: (await copyNotices(callerOf(ctx).db, ctx.now)) === "copied" };
    } catch {
      throw new Problem("conflict", "The notice saved, but its copy for outages didn't. Try again.");
    }
  },

  async retry_promotion(ctx: HandlerContext) {
    const result = await retryPromotion(callerOf(ctx), offerStripe(), ctx.input.promotionId as string);
    if ("refusal" in result) throw refusal(result.refusal);
    return { ok: true, ready: result.ready };
  },
};
