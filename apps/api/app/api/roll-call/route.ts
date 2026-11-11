import { RollCallRequest, RollCallResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { rollCall } from "@/lib/moves/roll-call";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/roll-call `{ assignmentId, crew, photoPath? }`: tick a John with
 * who did it. Everyone it names hears about it (lib/moves/roll-call.ts).
 * Answers how many did it.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = RollCallRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayJohnAndWho"));

  const result = await rollCall({ db: auth.supabase, userId: auth.user.id }, body.data);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, RollCallResponse.parse({ ok: true, people: result.people }));
}

export const OPTIONS = preflight;
