import { callV1 } from './v1';

// Your moves on a John, on /v1. Each is one SQL function, which decides (the
// rules live in supabase/migrations), or a move that runs it and then tells
// people (a roll call, a swap ask). A refusal arrives as a sentence.

/** Tick a John, with the storage path of a photo receipt when there is one. */
export async function markDone(assignmentId: string, photoPath?: string): Promise<void> {
  await callV1('mark_done', { assignmentId, photoPath });
}

/**
 * Tick a John with who did it (crew.ts); the people it names are told.
 * Everyone in `crew` shares the points; holders left off have a miss once it
 * stands.
 */
export async function rollCall(assignmentId: string, crew: readonly string[], photoPath?: string): Promise<number> {
  const { people } = await callV1('roll_call', { assignmentId, crew: [...crew], ...(photoPath ? { photoPath } : {}) });
  return people;
}

/** Plan when you'll do one of your Johns: it reminds you then instead. Null clears the plan. */
export async function planJohn(assignmentId: string, at: Date | null): Promise<void> {
  await callV1('plan_john', { assignmentId, at: at?.toISOString() ?? null });
}

/**
 * Ask a housemate who'd rather do one of your Johns to swap it for one of
 * theirs; they're told. Answers the ask's id.
 */
export async function askSwap(mine: string, theirs: string): Promise<string> {
  const { offerId } = await callV1('offer_swap', { mine, theirs });
  return offerId;
}

/** Answer an ask made to you: yes swaps the two Johns, no leaves them be. */
export async function answerSwap(offerId: string, accept: boolean): Promise<void> {
  await callV1('answer_swap', { offerId, accept });
}

/** Take a tick back while it's still being checked. */
export async function undoDone(assignmentId: string): Promise<void> {
  await callV1('undo_done', { assignmentId });
}

/**
 * Cover a housemate's overdue John: you did it instead. It counts as their
 * miss, and its points and their missed forfeit come to you once it stands.
 */
export async function coverJohn(assignmentId: string, photoPath?: string): Promise<void> {
  await callV1('cover_john', { assignmentId, photoPath });
}

/**
 * Say you're on your own overdue John: covers wait 2 hours (or until it
 * turns missed, if sooner). Once per John.
 */
export async function holdCover(assignmentId: string): Promise<void> {
  await callV1('hold_cover', { assignmentId });
}

/** Take a cover back while it's still being checked. */
export async function undoCover(assignmentId: string): Promise<void> {
  await callV1('undo_cover', { assignmentId });
}

/** Spend an immunity token: the John is excused, with no forfeit. */
export async function spendImmunity(assignmentId: string): Promise<void> {
  await callV1('use_immunity', { assignmentId });
}

/** Spend a swap token: one of your open Johns for a housemate's, this week. */
export async function spendSwap(mine: string, theirs: string): Promise<void> {
  await callV1('use_swap', { mine, theirs });
}

/** Take an open flag down: whoever raised it, or an admin (remove_flag decides). */
export async function removeFlag(assignmentId: string): Promise<void> {
  await callV1('remove_flag', { assignmentId });
}

/**
 * A kid's tick on the board, the family's shared screen signed in as a
 * parent: it's the kid's, so it waits for a parent's OK (board_tick).
 */
export async function boardTick(assignmentId: string): Promise<void> {
  await callV1('board_tick', { assignmentId });
}
