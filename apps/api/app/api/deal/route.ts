import { DealRequest, MoveResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { dealThisWeek } from "@/lib/moves/deal";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/deal `{ houseId }`: an admin hands out this week's Johns, or
 * re-deals a week nobody has ticked in yet (lib/moves/deal.ts, which the
 * web's action shares).
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = DealRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayHouseToDeal"));

  const refusal = await dealThisWeek({ db: auth.supabase, userId: auth.user.id }, body.data.houseId, new Date());
  if (refusal) return refused(request, refusal);
  return json(request, MoveResponse.parse({ ok: true }));
}

export const OPTIONS = preflight;
