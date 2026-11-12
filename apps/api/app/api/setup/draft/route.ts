import { ChatRequest, ChatResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { chatTurn } from "@/lib/moves/draft";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/setup/draft `{ houseId, summary?, messages, draft }`: one turn of the
 * Describe your house chat. An admin's message in; Jonz's reply, a question
 * to tap an answer to, and the new draft out (lib/moves/draft.ts). Nothing
 * is added to the list here.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, body.error.issues[0]?.message ?? "Say something about the house.");

  const { houseId, summary, messages, draft } = body.data;
  const result = await chatTurn({ db: auth.supabase, userId: auth.user.id }, houseId, messages, draft, new Date(), undefined, { summary });
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, ChatResponse.parse(result));
}

export const OPTIONS = preflight;
