import { AwayDraft, AwayResponse } from "@app/core";

import { requireUser } from "@/lib/auth";
import { bookAway } from "@/lib/moves/away";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/away `{ from, to, note? }`: book time away. Whoever it hands a
 * John to gets a push (lib/moves/away.ts). Answers how many Johns it made
 * due before you go, handed on, and skipped.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const body = AwayDraft.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, body.error.issues[0]?.message ?? "Pick the days you’re away.");

  const result = await bookAway({ db: auth.supabase, userId: auth.user.id }, body.data, new Date());
  if ("refusal" in result) return refused(request, result.refusal);
  return json(request, AwayResponse.parse({ ok: true, ...result }));
}

export const OPTIONS = preflight;
