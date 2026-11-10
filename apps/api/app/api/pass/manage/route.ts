import { PassManageRequest, PassRedirect, wordsFor } from "@app/core";

import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { openBilling } from "@/lib/moves/pass";
import { passStripe } from "@/lib/pass/stripe";
import { error, json, preflight } from "@/lib/respond";

// Server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

/**
 * POST /api/pass/manage `{ houseId }`: the housemate who bought the House
 * Pass changes plan, changes card or cancels. Answers Stripe's billing page
 * to send the browser to (lib/moves/pass.ts).
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = PassManageRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Say which house.");

  const stripe = passStripe();
  if (!stripe) return error(request, 503, words('house.pass.checkoutClosed'));

  const answer = await openBilling({ db: auth.supabase, userId: auth.user.id }, stripe, body.data.houseId, env.appUrlFor(request));
  if ("status" in answer) return error(request, answer.status, answer.message);
  return json(request, PassRedirect.parse(answer));
}

export const OPTIONS = preflight;
