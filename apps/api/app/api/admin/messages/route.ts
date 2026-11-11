import { humanError, OwnerMessageRequest, OwnerMessageResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { sendMessage } from "@/lib/moves/messages";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/admin/messages: the owner, signed in with their code, sends a
 * message to a person, a house or everyone, or a test of it to themself
 * (`audience: "test"`). The database checks it's the owner and writes the
 * audit entry; this then pushes and emails as many as it can before
 * answering, and the clock sends the rest.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = OwnerMessageRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, humanError({ message: "message_who" }, wordsOf(request)));

  const result = await sendMessage({ db: auth.supabase, userId: auth.user.id }, body.data);
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, OwnerMessageResponse.parse({ ok: true, ...result }));
}

export const OPTIONS = preflight;

// Long enough to push and email a few thousand people before answering.
export const maxDuration = 60;
