import { PushActionRequest, PushActionResponse } from "@app/core";

import { answerPush } from "@/lib/moves/push-actions";
import { error, json, preflight, refused, wordsOf } from "@/lib/respond";

/**
 * POST /api/push-actions `{ token, action }`: a button on a notification
 * (tick a John, answer a housemate check). The token from the push stands in
 * for a sign-in (lib/push-token.ts), so this takes no bearer token. Answers
 * what the notification should say now.
 */
export async function POST(request: Request) {
  const body = PushActionRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, wordsOf(request)("errors.api.buttonUnclear"));

  const answer = await answerPush(body.data, new Date());
  if ("expired" in answer) return error(request, 401, wordsOf(request)("errors.api.notificationExpired"));
  if ("mismatch" in answer) return error(request, 400, wordsOf(request)("errors.api.buttonUnclear"));
  if ("refusal" in answer) return refused(request, answer.refusal);
  return json(request, PushActionResponse.parse(answer.ok));
}

export const OPTIONS = preflight;
