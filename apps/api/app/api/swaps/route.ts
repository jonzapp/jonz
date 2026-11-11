import { SwapAskRequest, SwapAskResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { askSwap } from "@/lib/moves/swap-ask";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/swaps `{ mine, theirs }`: ask a housemate who'd rather do your
 * John to swap it for one of theirs. They get a push, and answer in Jonz by
 * tonight (lib/moves/swap-ask.ts). Answers the ask's id.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = SwapAskRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayWhichSwap"));

  const result = await askSwap({ db: auth.supabase, userId: auth.user.id }, body.data);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, SwapAskResponse.parse({ ok: true, offerId: result.offerId }));
}

export const OPTIONS = preflight;
