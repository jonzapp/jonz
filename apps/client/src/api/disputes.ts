import { AnswerTick, CastVote, disputeProblem, humanError, MoveResponse, RaiseDispute } from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

// Housemate check. Disputing and voting go through apps/api, which runs the
// database's own functions as you and then tells the house and decides at
// once when the votes already say (lib/moves/disputes.ts there).

/** Say a housemate's tick wasn't really done. Throws the reason's problem, or the API's refusal, as a sentence. */
export async function raiseDispute(assignmentId: string, reason: string): Promise<void> {
  const body = RaiseDispute.safeParse({ assignmentId, reason });
  if (!body.success) throw new Error(disputeProblem(body.error.issues));
  await apiPost('/api/disputes', body.data, MoveResponse);
}

/** Vote on a dispute: `uphold` true says it wasn't done. */
export async function castVote(disputeId: string, uphold: boolean): Promise<void> {
  await apiPost(`/api/disputes/${disputeId}/votes`, CastVote.parse({ uphold }), MoveResponse);
}

/**
 * A parent answers a kid's tick, in a family: OK lets it stand, Not yet
 * (`ok` false) sends it back. Through apps/api, which tells the kid on Not
 * yet and settles an OK'd John at once (lib/moves/oks.ts there).
 */
export async function answerTick(assignmentId: string, ok: boolean): Promise<void> {
  await apiPost(`/api/oks/${assignmentId}`, AnswerTick.parse({ ok }), MoveResponse);
}

/**
 * Answer a question on your tick with a photo of it done (answer_dispute),
 * already uploaded to the John's folder. True when that settled it: with
 * only one voter the photo decides, and the tick stands.
 */
export async function answerDispute(disputeId: string, photoPath: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('answer_dispute', { p_dispute: disputeId, p_photo_path: photoPath });
  if (error) throw new Error(humanError(error));
  return Boolean(data);
}
