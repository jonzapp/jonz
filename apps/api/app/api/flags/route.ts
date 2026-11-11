import { FlagResponse, RaiseFlag } from "@app/core";

import { requireUser } from "@/lib/auth";
import { raiseFlag } from "@/lib/moves/flags";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/flags `{ johnId }`: say an on-call John needs doing. Whoever is
 * on call gets it, and a push (lib/moves/flags.ts). Answers the flag's id.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = RaiseFlag.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayWhichJohn"));

  const result = await raiseFlag({ db: auth.supabase, userId: auth.user.id }, body.data.johnId, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, FlagResponse.parse({ ok: true, assignmentId: result.assignmentId }));
}

export const OPTIONS = preflight;
