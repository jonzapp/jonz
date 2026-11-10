import { OPERATION_IO, type AskCardOperation, type Words } from '@app/core';
import type { z } from 'zod';

import { addKid } from './kids';
import { castVote, answerTick, raiseDispute } from './disputes';
import { raiseFlag } from './flags';
import { undoAction } from './history';
import {
  answerSwap,
  askSwap,
  boardTick,
  coverJohn,
  holdCover,
  markDone,
  planJohn,
  removeFlag,
  rollCall,
  spendImmunity,
  spendSwap,
  undoCover,
  undoDone,
} from './johns';
import { saveMyPrefs } from './my-prefs';
import { takeOffer } from './offer';
import { leaveFor, passCheckoutUrl } from './pass';
import { payPocketMoney } from './pocket';
import {
  dealThisWeek,
  deleteGroup,
  handOver,
  removeMember,
  resetJoinCode,
  saveDealMode,
  setHouseKind,
  setRole,
  updateHouse,
} from './settings';
import { confirmPayment } from './stake';
import { setReaction } from './wall';

// Each house write Ask Jonz can put on its card (core ask-operations.ts),
// done through the same call the app's own button makes, as the person. The
// map is exhaustive: a new house write on the card doesn't build until it
// says which call does it here.

type Input<N extends AskCardOperation> = z.infer<(typeof OPERATION_IO)[N]['input']>;

/** Who is doing it, for the calls that need them named. */
export type OperationContext = { userId: string; words: Words };

export const CARD_OPERATIONS: { [N in AskCardOperation]: (input: Input<N>, ctx: OperationContext) => Promise<unknown> } = {
  mark_done: (i) => markDone(i.assignmentId, i.photoPath),
  undo_done: (i) => undoDone(i.assignmentId),
  plan_john: (i) => planJohn(i.assignmentId, i.at ? new Date(i.at) : null),
  roll_call: (i) => rollCall(i.assignmentId, i.crew, i.photoPath),
  save_prefs: (i) => saveMyPrefs(i.houseId, { days: i.days, bestTime: i.bestTime, rather: i.rather }),
  use_immunity: (i) => spendImmunity(i.assignmentId),
  use_swap: (i) => spendSwap(i.mine, i.theirs),
  offer_swap: (i) => askSwap(i.mine, i.theirs),
  answer_swap: (i) => answerSwap(i.offerId, i.accept),
  undo_action: (i) => undoAction(i.actionId),
  cover_john: (i) => coverJohn(i.assignmentId, i.photoPath),
  hold_cover: (i) => holdCover(i.assignmentId),
  undo_cover: (i) => undoCover(i.assignmentId),
  raise_flag: (i) => raiseFlag(i.johnId),
  raise_dispute: (i) => raiseDispute(i.assignmentId, i.reason),
  cast_vote: (i) => castVote(i.disputeId, i.uphold),
  confirm_payment: (i) => confirmPayment(i.houseId, i.fromId, i.amount, i.via === 'splitwise' ? 'splitwise' : undefined),
  // Checkout is Stripe's page: the card leaves for it, as the Pass page's button does.
  pass_checkout: async (i) => leaveFor(i.offer ? await takeOffer(i.houseId, i.plan, i.offer) : await passCheckoutUrl(i.houseId, i.plan)),
  react: (i, ctx) => setReaction(i.eventId, ctx.userId, i.kind, true),
  unreact: (i, ctx) => setReaction(i.eventId, ctx.userId, i.kind, false),
  save_house_rules: ({ houseId, ...settings }, ctx) => updateHouse(houseId, settings, ctx.words),
  set_deal_mode: (i) => saveDealMode(i.houseId, i.mode),
  answer_tick: (i) => answerTick(i.assignmentId, i.ok),
  board_tick: (i) => boardTick(i.assignmentId),
  remove_flag: (i) => removeFlag(i.assignmentId),
  delete_group: (i) => deleteGroup(i.groupId),
  reset_join_code: (i) => resetJoinCode(i.houseId),
  set_house_kind: (i) => setHouseKind(i.houseId, i.kind),
  deal_week: (i) => dealThisWeek(i.houseId),
  pay_pocket_money: (i) => payPocketMoney(i.houseId, i.kidId, i.month),
  add_kid: (i) => addKid(i.houseId, i.name, i.bornYear),
  remove_member: (i) => removeMember(i.houseId, i.userId),
  set_member_role: (i) => setRole(i.houseId, i.userId, i.role),
  hand_over: (i) => handOver(i.houseId, i.toId),
};

/** Does one operation from the card, with the input the API checked against the operation's own. */
export function runCardOperation(name: AskCardOperation, input: unknown, ctx: OperationContext): Promise<unknown> {
  const run = CARD_OPERATIONS[name] as (input: unknown, ctx: OperationContext) => Promise<unknown>;
  // The API checked it; it's checked again here, as it arrived.
  return run(OPERATION_IO[name].input.parse(input), ctx);
}
