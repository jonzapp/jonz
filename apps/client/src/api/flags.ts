import { callV1 } from './v1';

// On-call Johns. Flagging runs raise_flag as you on /v1, and then tells
// whoever is on call (apps/api lib/moves/flags.ts).

/** Say an on-call John needs doing. Answers the flag's id: the one already open, if it is. */
export async function raiseFlag(johnId: string): Promise<string> {
  const { assignmentId } = await callV1('raise_flag', { johnId });
  return assignmentId;
}
