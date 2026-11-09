import { disputeProblem, RaiseDispute } from '@app/core';

import { callV1 } from './v1';

// Housemate check, on /v1. Disputing, voting and a parent's OK run the same
// move their app buttons always did (apps/api lib/moves), so the house is
// told and a dispute the votes already decide closes at once.

/** Say a housemate's tick wasn't really done. Throws the reason's problem, or the API's refusal, as a sentence. */
export async function raiseDispute(assignmentId: string, reason: string): Promise<void> {
  const body = RaiseDispute.safeParse({ assignmentId, reason });
  if (!body.success) throw new Error(disputeProblem(body.error.issues));
  await callV1('raise_dispute', body.data);
}

/** Vote on a dispute: `uphold` true says it wasn't done. */
export async function castVote(disputeId: string, uphold: boolean): Promise<void> {
  await callV1('cast_vote', { disputeId, uphold });
}

/**
 * A parent answers a kid's tick, in a family: OK lets it stand, Not yet
 * (`ok` false) sends it back, and the kid is told.
 */
export async function answerTick(assignmentId: string, ok: boolean): Promise<void> {
  await callV1('answer_tick', { assignmentId, ok });
}

/**
 * Answer a question on your tick with a photo of it done, already uploaded
 * to the John's folder. True when that settled it: with only one voter the
 * photo decides, and the tick stands.
 */
export async function answerDispute(disputeId: string, photoPath: string): Promise<boolean> {
  return callV1('answer_dispute', { disputeId, photoPath });
}
