import { PASS_ENFORCED, PassCheckoutRequest, PassRedirect, wordsFor } from "@app/core";

import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { startCheckout } from "@/lib/moves/pass";
import { passStripe } from "@/lib/pass/stripe";
import { error, json, preflight, wordsOf } from "@/lib/respond";

// Server lines read the housemates' words for now; each person's own language comes with translation 7.
const words = wordsFor("en", "housemates");

/**
 * POST /api/pass/checkout `{ houseId, plan, offer? }`: a housemate buys the
 * House Pass on the web, with a promotion's code if they came from its
 * link. Answers Stripe Checkout's URL to send the browser to
 * (lib/moves/pass.ts); the webhook gives the house the Pass once it's paid.
 * 503 while Stripe isn't set up, except for a free Pass's link, which needs
 * no Stripe. During the beta, while nothing is locked (PASS_ENFORCED off),
 * a plain purchase is refused too, so nobody pays for what everyone has; a
 * promotion's link still works.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = PassCheckoutRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayHouseAndPlan"));
  if (!PASS_ENFORCED && !body.data.offer) return error(request, 503, words('house.pass.betaFree'));

  // Null while Stripe isn't set up: then only a free Pass's link works (503 otherwise).
  const answer = await startCheckout(
    { db: auth.supabase, userId: auth.user.id, email: auth.user.email },
    passStripe(),
    body.data.houseId,
    body.data.plan,
    env.appUrlFor(request),
    env.stage(),
    new Date(),
    body.data.offer ?? null,
  );
  if ("status" in answer) return error(request, answer.status, answer.say(wordsOf(request)));
  return json(request, PassRedirect.parse(answer));
}

export const OPTIONS = preflight;
