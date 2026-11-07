import { PASS_COPY, PassCheckoutRequest, PassRedirect } from "@app/core";

import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { startCheckout } from "@/lib/moves/pass";
import { passStripe } from "@/lib/pass/stripe";
import { error, json, preflight } from "@/lib/respond";

/**
 * POST /api/pass/checkout `{ houseId, plan, offer? }`: a housemate buys the
 * House Pass on the web, with a promotion's code if they came from its
 * link. Answers Stripe Checkout's URL to send the browser to
 * (lib/moves/pass.ts); the webhook gives the house the Pass once it's paid.
 * 503 while Stripe isn't set up.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = PassCheckoutRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Say which house, and which plan.");

  const stripe = passStripe();
  if (!stripe) return error(request, 503, PASS_COPY.checkoutClosed);

  const answer = await startCheckout(
    { db: auth.supabase, userId: auth.user.id, email: auth.user.email },
    stripe,
    body.data.houseId,
    body.data.plan,
    env.appUrlFor(request),
    env.stage(),
    new Date(),
    body.data.offer ?? null,
  );
  if ("status" in answer) return error(request, answer.status, answer.message);
  return json(request, PassRedirect.parse(answer));
}

export const OPTIONS = preflight;
