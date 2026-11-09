import type { ResetPreview, ResetRequest } from '@app/core';

import { callV1 } from './v1';

// An admin's resets go through the server (reset_house on /v1,
// apps/api/lib/moves/resets.ts), which works out the house's forfeits and
// tells everyone a reset touches. The same call says what one would change.

/** A reset, without `apply`: what it would change. */
export type ResetAsk = Omit<ResetRequest, 'apply'>;

/** The reset as /v1 takes it: its week, person and result by their ids. */
const resetInput = ({ week, user, assignment, ...ask }: ResetAsk, apply: boolean) => ({ ...ask, weekId: week, userId: user, assignmentId: assignment, apply });

/** What a reset would change, for the reset sheet. Nothing changes yet. */
export async function previewReset(ask: ResetAsk): Promise<ResetPreview> {
  const { preview } = await callV1('reset_house', resetInput(ask, false));
  if (!preview) throw new Error('Something went wrong. Try again.');
  return preview;
}

/** Make the reset. Answers its History action, for Undo. */
export async function applyReset(ask: ResetAsk): Promise<string> {
  const { action } = await callV1('reset_house', resetInput(ask, true));
  if (!action) throw new Error('Something went wrong. Try again.');
  return action;
}
