import { AnswerTick, humanError, MoveResponse } from "@app/core";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { answerTick } from "@/lib/moves/oks";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/oks/:assignmentId `{ ok }`: a parent answers a kid's tick in a
 * family. OK lets it stand; Not yet (`ok` false) sends it back to the kid
 * (lib/moves/oks.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return error(request, 404, humanError({ message: "not_in_house" }));
  const body = AnswerTick.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Say OK or Not yet.");

  const refusal = await answerTick({ db: auth.supabase, userId: auth.user.id }, id.data, body.data.ok, new Date());
  if (refusal) return refused(request, refusal);
  return json(request, MoveResponse.parse({ ok: true }));
}

export const OPTIONS = preflight;
