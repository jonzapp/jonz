import "server-only";

import { bornYearOk, houseKind, languageOf, listPages, newHouseFacts, pageMarkdown, promotionProblems, rulesOf, type PageId, type AwayDraft, type ChatRequest, type DeleteHouseRequest, type OwnerAskRequest, type OwnerMessageRequest, type PassCheckoutRequest, type PromotionRequest, type ReportFixRequest, type ReportMessageRequest, type ReportRequest, type RollCallRequest, type SwapAskRequest, wordsFor } from "@app/core";
import { fromDatabase, Problem, type HandlerContext } from "@app/server";
import type { Handlers } from "v1";

import { inOperation } from "@/lib/db/scope";
import { ensureFresh } from "@/lib/engine/fresh";
import { env } from "@/lib/env";
import { seeLinks, uploadLink } from "@/lib/files";
import { houseUsage } from "@/lib/moves/ask-usage";
import { bookAway } from "@/lib/moves/away";
import { dealThisWeek } from "@/lib/moves/deal";
import { castVote, raiseDispute, type Caller, type Refusal } from "@/lib/moves/disputes";
import { chatTurn } from "@/lib/moves/draft";
import { raiseFlag } from "@/lib/moves/flags";
import { deleteHouse } from "@/lib/moves/houses";
import { addKid } from "@/lib/moves/kids";
import { sendMessage } from "@/lib/moves/messages";
import { answerTick } from "@/lib/moves/oks";
import { ownerTurn } from "@/lib/moves/owner-ask";
import { openBilling, startCheckout, type PassAnswer } from "@/lib/moves/pass";
import { emailPromotion, makePromotion, retryPromotion, stopPromotion } from "@/lib/moves/promotions";
import { fixReport, replyToReport, sendReport, writeBack } from "@/lib/moves/reports";
import { resetHouse } from "@/lib/moves/resets";
import { rollCall } from "@/lib/moves/roll-call";
import { supportDraft } from "@/lib/moves/support-draft";
import { askSwap } from "@/lib/moves/swap-ask";
import { copyNotices } from "@/lib/notices/copy";
import { offerStripe, passStripe } from "@/lib/pass/stripe";
import { userClient } from "@/lib/supabase/user";

// Server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

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
  throw new Problem(STATUS_PROBLEM[answer.status] ?? "internal", answer.say(words));
}

const houseId = (ctx: HandlerContext) => ctx.input.houseId as string;
const appUrl = (ctx: HandlerContext) => env.appUrlForOrigin(ctx.origin);
const filesSite = (ctx: HandlerContext) => env.filesSiteForOrigin(ctx.origin);

const HANDLERS: Handlers = {
  async proof_upload(ctx: HandlerContext) {
    const { assignmentId } = ctx.input as { assignmentId: string };
    return uploadLink(ctx.token, ctx.claims.sub, filesSite(ctx), "proof", "image/jpeg", { houseId: houseId(ctx), assignmentId });
  },

  async file_upload(ctx: HandlerContext) {
    const { kind, type } = ctx.input as { kind: "shot" | "photo"; type: string };
    return uploadLink(ctx.token, ctx.claims.sub, filesSite(ctx), kind, type);
  },

  async file_links(ctx: HandlerContext) {
    const { kind, paths } = ctx.input as { kind: "proof" | "shot"; paths: string[] };
    return { links: await seeLinks(ctx.token, filesSite(ctx), kind, paths) };
  },

  async ask_usage(ctx: HandlerContext) {
    const result = await houseUsage(callerOf(ctx), houseId(ctx), ctx.now);
    if ("refusal" in result) throw refusal(result.refusal);
    return result;
  },

  async list_pages(ctx: HandlerContext) {
    return listPages(wordsFor(await readerLanguage(ctx), "housemates"));
  },

  async read_page(ctx: HandlerContext) {
    const { pageId, houseId: asked } = ctx.input as { pageId: PageId; houseId?: string };
    // Read as the person, so a house they're not in reads as nothing. With no
    // house named, the guide uses theirs, or a new house's numbers if they have none.
    type House = Parameters<typeof rulesOf>[0] & { kind: string; away_makeup: number };
    const [house] = asked
      ? await ctx.tx<House[]>`select * from public.houses where id = ${asked}::uuid`
      : await ctx.tx<House[]>`select h.* from public.houses h join public.members m on m.house_id = h.id where m.user_id = ${ctx.claims.sub}::uuid order by m.joined_at desc limit 1`;
    if (asked && !house) throw refusal({ code: "42501", message: "not_in_house" });
    const kind = houseKind(house?.kind ?? "housemates");
    const facts = house ? { rules: rulesOf(house), family: kind === "family", awayMakeup: house.away_makeup } : newHouseFacts(kind, "Europe/London", "GBP");
    return { id: pageId, markdown: pageMarkdown(pageId, { words: wordsFor(await readerLanguage(ctx), kind), house: facts }) };
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
    if (!bornYearOk(bornYear, ctx.now.getUTCFullYear())) throw new Problem("invalid_input", words('people.kids.problems.born'));
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
    const email = typeof ctx.claims.email === "string" ? ctx.claims.email : undefined;
    const answer = await startCheckout({ ...callerOf(ctx), email }, passStripe(), houseId(ctx), plan, appUrl(ctx), env.stage(), ctx.now, offer ?? null);
    return passAnswer(answer);
  },

  async pass_billing(ctx: HandlerContext) {
    const stripe = passStripe();
    if (!stripe) throw new Problem("rejected", words('house.pass.checkoutClosed'));
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

  // The operations that run a database function and then tell people (a
  // push, an email, Stripe): the same move their /api route runs, so /v1 and
  // MCP send what the app's button sends. `refusal` throws a move's no.

  async set_away(ctx: HandlerContext) {
    return { ok: true, ...(await done(bookAway(callerOf(ctx), body<AwayDraft>(ctx), ctx.now))) };
  },

  async send_report(ctx: HandlerContext) {
    return { ok: true, id: (await done(sendReport(callerOf(ctx), body<ReportRequest>(ctx)))).id };
  },

  async write_back(ctx: HandlerContext) {
    await none(writeBack(callerOf(ctx), id(ctx, "reportId"), body<ReportMessageRequest>(ctx)));
    return { ok: true };
  },

  async roll_call(ctx: HandlerContext) {
    return { ok: true, people: (await done(rollCall(callerOf(ctx), ctx.input as RollCallRequest))).people };
  },

  async offer_swap(ctx: HandlerContext) {
    return { ok: true, offerId: (await done(askSwap(callerOf(ctx), ctx.input as SwapAskRequest))).offerId };
  },

  async raise_flag(ctx: HandlerContext) {
    return { ok: true, assignmentId: (await done(raiseFlag(callerOf(ctx), id(ctx, "johnId"), ctx.now))).assignmentId };
  },

  async raise_dispute(ctx: HandlerContext) {
    await none(raiseDispute(callerOf(ctx), id(ctx, "assignmentId"), ctx.input.reason as string, ctx.now));
    return { ok: true };
  },

  async cast_vote(ctx: HandlerContext) {
    await none(castVote(callerOf(ctx), id(ctx, "disputeId"), ctx.input.uphold as boolean, ctx.now));
    return { ok: true };
  },

  async answer_tick(ctx: HandlerContext) {
    await none(answerTick(callerOf(ctx), id(ctx, "assignmentId"), ctx.input.ok as boolean, ctx.now));
    return { ok: true };
  },

  async owner_reply_report(ctx: HandlerContext) {
    await none(replyToReport(callerOf(ctx), id(ctx, "reportId"), body<ReportMessageRequest>(ctx)));
    return { ok: true };
  },

  async owner_fix_report(ctx: HandlerContext) {
    return { ok: true, ...(await done(fixReport(callerOf(ctx), id(ctx, "reportId"), body<ReportFixRequest>(ctx)))) };
  },

  async claim_support_draft(ctx: HandlerContext) {
    return done(supportDraft(callerOf(ctx), id(ctx, "reportId"), ctx.now));
  },

  async owner_send_message(ctx: HandlerContext) {
    return { ok: true, ...(await done(sendMessage(callerOf(ctx), ctx.input as OwnerMessageRequest))) };
  },

  async owner_make_promotion(ctx: HandlerContext) {
    const draft = ctx.input as PromotionRequest;
    const problem = Object.values(promotionProblems(draft, ctx.now))[0];
    if (problem) throw new Problem("invalid_input", problem);
    return { ok: true, ...(await done(makePromotion(callerOf(ctx), offerStripe(), draft))) };
  },

  async owner_stop_promotion(ctx: HandlerContext) {
    await none(stopPromotion(callerOf(ctx), offerStripe(), id(ctx, "promotionId")));
    return { ok: true };
  },

  async owner_promotion_emails(ctx: HandlerContext) {
    return { ok: true, sent: (await done(emailPromotion(callerOf(ctx), id(ctx, "promotionId")))).sent };
  },

  async owner_delete_house(ctx: HandlerContext) {
    return { ok: true, ...(await done(deleteHouse(callerOf(ctx), houseId(ctx), body<DeleteHouseRequest>(ctx), passStripe()))) };
  },
};

/**
 * Each handler with its operation's transaction as where its queries go
 * (lib/db/scope.ts): the person's client and the server's both run in it.
 */
/** The language the person reads Jonz in, English until they've chosen: Jonz's pages come in it. */
async function readerLanguage(ctx: HandlerContext) {
  const [me] = await ctx.tx<{ language: string | null }[]>`select language from public.profiles where id = ${ctx.claims.sub}::uuid`;
  return languageOf(me?.language);
}

export const V1_HANDLERS: Handlers = Object.fromEntries(
  Object.entries(HANDLERS).map(([name, handler]) => [name, (ctx: HandlerContext) => inOperation(ctx.tx, ctx.pool, ctx.claims, () => Promise.resolve(handler!(ctx)))]),
) as Handlers;

/** A path key from the input. */
const id = (ctx: HandlerContext, key: string) => ctx.input[key] as string;

/** The input without its path keys: the body the move's /api route took. */
function body<T>(ctx: HandlerContext): T {
  const out = { ...ctx.input };
  for (const key of ["reportId", "promotionId", "houseId", "disputeId"]) delete out[key];
  return out as T;
}

/** A move's answer, or its refusal thrown as a Problem. */
async function done<T extends object>(result: Promise<{ refusal: Refusal } | T>): Promise<T> {
  const answer = await result;
  if ("refusal" in answer) throw refusal(answer.refusal);
  return answer as T;
}

/** A move that answers only a refusal, or nothing. */
async function none(result: Promise<Refusal | null>): Promise<void> {
  const refused = await result;
  if (refused) throw refusal(refused);
}
