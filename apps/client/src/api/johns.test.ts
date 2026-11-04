import { apiPost } from './http';
import { answerSwap, askSwap, markDone, planJohn, rollCall, spendImmunity, spendSwap, undoDone } from './johns';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./http', () => ({ apiPost: jest.fn() }));

const rpc = supabase.rpc as unknown as jest.Mock;
const post = apiPost as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
});

it('ticks a John through mark_done, with or without a photo', async () => {
  await markDone('a1');
  expect(rpc).toHaveBeenCalledWith('mark_done', { p_assignment: 'a1', p_photo_path: undefined });
  await markDone('a1', 'h1/a1/receipt.jpg');
  expect(rpc).toHaveBeenLastCalledWith('mark_done', { p_assignment: 'a1', p_photo_path: 'h1/a1/receipt.jpg' });
});

it('ticks a John with who did it through the roll call route, which tells them', async () => {
  const crew = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  post.mockResolvedValue({ ok: true, people: 2 });
  await expect(rollCall('00000000-0000-4000-8000-0000000000a1', crew)).resolves.toBe(2);
  expect(post).toHaveBeenCalledWith('/api/roll-call', { assignmentId: '00000000-0000-4000-8000-0000000000a1', crew }, expect.anything());
  await rollCall('00000000-0000-4000-8000-0000000000a1', crew, 'h1/a1/receipt.jpg');
  expect(post).toHaveBeenLastCalledWith(
    '/api/roll-call',
    { assignmentId: '00000000-0000-4000-8000-0000000000a1', crew, photoPath: 'h1/a1/receipt.jpg' },
    expect.anything(),
  );
});

it('takes a tick back, and uses a skip, through their own functions', async () => {
  await undoDone('a1');
  expect(rpc).toHaveBeenCalledWith('undo_done', { p_assignment: 'a1' });
  await spendImmunity('a1');
  expect(rpc).toHaveBeenLastCalledWith('use_immunity', { p_assignment: 'a1' });
});

it('swaps one of yours for a housemate\'s through use_swap', async () => {
  await spendSwap('a1', 'a2');
  expect(rpc).toHaveBeenCalledWith('use_swap', { p_mine: 'a1', p_theirs: 'a2' });
  rpc.mockResolvedValue({ data: null, error: { message: 'no_swap', code: 'P0001' } });
  await expect(spendSwap('a1', 'a2')).rejects.toThrow("You don’t have a swap.");
});

it('asks to swap through the swaps route, which tells them, and answers through answer_swap', async () => {
  const [mine, theirs, offerId] = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000f1'];
  post.mockResolvedValue({ ok: true, offerId });
  await expect(askSwap(mine, theirs)).resolves.toBe(offerId);
  expect(post).toHaveBeenCalledWith('/api/swaps', { mine, theirs }, expect.anything());
  await answerSwap(offerId, true);
  expect(rpc).toHaveBeenCalledWith('answer_swap', { p_offer: offerId, p_accept: true });
  rpc.mockResolvedValue({ data: null, error: { message: 'swap_gone', code: 'P0001' } });
  await expect(answerSwap(offerId, false)).rejects.toThrow(/^That ask has run out/);
});

it('plans a John through plan_john, and clears the plan with null', async () => {
  await planJohn('a1', new Date('2026-11-07T10:00:00Z'));
  expect(rpc).toHaveBeenCalledWith('plan_john', { p_assignment: 'a1', p_at: '2026-11-07T10:00:00.000Z' });
  await planJohn('a1', null);
  expect(rpc).toHaveBeenLastCalledWith('plan_john', { p_assignment: 'a1', p_at: null });
  rpc.mockResolvedValue({ data: null, error: { message: 'plan_time', code: 'P0001' } });
  await expect(planJohn('a1', new Date())).rejects.toThrow('Pick a time from now until the end of this week.');
});

it("says the database's refusal in words", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'photo_required', code: 'P0001' } });
  await expect(markDone('a1')).rejects.toThrow('This John needs a photo with the tick.');
  rpc.mockResolvedValue({ data: null, error: { message: 'under_dispute', code: 'P0001' } });
  await expect(undoDone('a1')).rejects.toThrow("Someone’s disputing this tick, so it can’t be undone now.");
  rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });
  await expect(spendImmunity('a1')).rejects.toThrow("You can’t do that.");
});
