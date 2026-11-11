import { ResetRequest, ResetResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { resetHouse } from "@/lib/moves/resets";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/resets `{ houseId, kind, week?, user?, assignment?, outcome?,
 * month?, apply }`: an admin's reset (lib/moves/resets.ts). Without
 * `apply`, what it would change; with it, the change and its action's id.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = ResetRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayWhatToReset"));

  const result = await resetHouse({ db: auth.supabase, userId: auth.user.id }, body.data, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, ResetResponse.parse(result));
}

export const OPTIONS = preflight;
