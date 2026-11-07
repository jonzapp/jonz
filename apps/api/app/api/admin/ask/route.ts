import { OwnerAskRequest, OwnerAskResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { ownerTurn } from "@/lib/moves/owner-ask";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/admin/ask: the owner's Ask Jonz. Only the owner, signed in with
 * their code this session; it reads as them and changes nothing
 * (lib/moves/owner-ask.ts). A housemate's Ask Jonz is /api/setup/draft.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = OwnerAskRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, body.error.issues[0]?.message ?? "Ask something.");

  const result = await ownerTurn({ db: auth.supabase, userId: auth.user.id }, body.data.messages, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, OwnerAskResponse.parse(result));
}

export const OPTIONS = preflight;

// Long enough for Claude to read a few lists before it answers.
export const maxDuration = 60;
