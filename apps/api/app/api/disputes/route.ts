import { disputeProblem, MoveResponse, RaiseDispute } from "@app/core";

import { requireUser } from "@/lib/auth";
import { raiseDispute } from "@/lib/moves/disputes";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/disputes `{ assignmentId, reason }`: say a housemate's tick
 * wasn't really done. The house hears about it, and in a house of two it is
 * decided at once (lib/moves/disputes.ts, which the web's action shares).
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = RaiseDispute.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, disputeProblem(body.error.issues));

  const refusal = await raiseDispute(
    { db: auth.supabase, userId: auth.user.id },
    body.data.assignmentId,
    body.data.reason,
    new Date());
  if (refusal) return refused(request, refusal);
  return json(request, MoveResponse.parse({ ok: true }));
}

export const OPTIONS = preflight;
