import { CastVote, humanError, MoveResponse } from "@app/core";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { castVote } from "@/lib/moves/disputes";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/disputes/:id/votes `{ uphold }`: vote on a dispute (true: it
 * wasn't done). A vote that makes a majority decides it at once
 * (lib/moves/disputes.ts, which the web's action shares).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return error(request, 404, humanError({ message: "not_in_house" }, wordsOf(request)));
  const body = CastVote.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.sayWhetherDone"));

  const refusal = await castVote({ db: auth.supabase, userId: auth.user.id }, id.data, body.data.uphold, new Date());
  if (refusal) return refused(request, refusal);
  return json(request, MoveResponse.parse({ ok: true }));
}

export const OPTIONS = preflight;
