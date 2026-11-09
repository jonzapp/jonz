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
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const OFFER = '00000000-0000-4000-8000-0000000000f1';

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(null);
});

it.each([
  ['mark_done', () => markDone(A1), { assignmentId: A1, photoPath: undefined }],
  ['mark_done', () => markDone(A1, 'h1/a1/receipt.jpg'), { assignmentId: A1, photoPath: 'h1/a1/receipt.jpg' }],
  ['undo_done', () => undoDone(A1), { assignmentId: A1 }],
  ['cover_john', () => coverJohn(A1, 'h1/a1/c.jpg'), { assignmentId: A1, photoPath: 'h1/a1/c.jpg' }],
  ['hold_cover', () => holdCover(A1), { assignmentId: A1 }],
  ['undo_cover', () => undoCover(A1), { assignmentId: A1 }],
  ['use_immunity', () => spendImmunity(A1), { assignmentId: A1 }],
  ['use_swap', () => spendSwap(A1, A2), { mine: A1, theirs: A2 }],
  ['answer_swap', () => answerSwap(OFFER, true), { offerId: OFFER, accept: true }],
  ['remove_flag', () => removeFlag(A1), { assignmentId: A1 }],
  ['board_tick', () => boardTick(A1), { assignmentId: A1 }],
  ['plan_john', () => planJohn(A1, new Date('2026-11-07T10:00:00Z')), { assignmentId: A1, at: '2026-11-07T10:00:00.000Z' }],
  ['plan_john', () => planJohn(A1, null), { assignmentId: A1, at: null }],
])('runs %s on /v1', async (name, run, input) => {
  await run();
  expect(call).toHaveBeenCalledWith(name, input);
});

it('ticks a John with who did it, and answers how many were told', async () => {
  call.mockResolvedValue({ ok: true, people: 2 });
  await expect(rollCall(A1, [A1, A2])).resolves.toBe(2);
  expect(call).toHaveBeenCalledWith('roll_call', { assignmentId: A1, crew: [A1, A2] });
  await rollCall(A1, [A1], 'h1/a1/receipt.jpg');
  expect(call).toHaveBeenLastCalledWith('roll_call', { assignmentId: A1, crew: [A1], photoPath: 'h1/a1/receipt.jpg' });
});

it("asks to swap, answering the ask's id", async () => {
  call.mockResolvedValue({ ok: true, offerId: OFFER });
  await expect(askSwap(A1, A2)).resolves.toBe(OFFER);
  expect(call).toHaveBeenCalledWith('offer_swap', { mine: A1, theirs: A2 });
});

it("passes on the API's refusal", async () => {
  call.mockRejectedValue(new Error('This John needs a photo with the tick.'));
  await expect(markDone(A1)).rejects.toThrow('This John needs a photo with the tick.');
});
