import { humanError, PromotionMade, promotionProblems, PromotionRequest } from "@app/core";

import { requireUser } from "@/lib/auth";
import { makePromotion } from "@/lib/moves/promotions";
import { offerStripe } from "@/lib/pass/stripe";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/admin/promotions: the owner, signed in with their code, makes a
 * promotion (docs/specs/promotions.md). The database checks it's the owner
 * and writes the audit entry; money off is then set up in Stripe. Answers
 * `ready: false` when Stripe couldn't be reached: it's saved, and its page
 * offers Try again.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = PromotionRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, humanError({ message: "promotion_bad" }));
  const problem = Object.values(promotionProblems(body.data, new Date()))[0];
  if (problem) return error(request, 400, problem);

  const made = await makePromotion({ db: auth.supabase, userId: auth.user.id }, offerStripe(), body.data);
  if ("refusal" in made) return refused(request, made.refusal);
  return json(request, PromotionMade.parse({ ok: true, ...made }));
}

export const OPTIONS = preflight;
