import { emailPromotion, makePromotion, promotion, promotionsCount, promotionsPage, retryPromotion, stopPromotion } from './promotions';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const P1 = '00000000-0000-4000-8000-0000000000c1';
const ROW = {
  id: P1,
  madeAt: '2026-11-01T00:00:00Z',
  code: 'FRIENDS',
  name: 'Friends',
  kind: 'percent',
  percentOff: 20,
  amountOff: null,
  duration: 'once',
  months: null,
  plans: ['yearly'],
  audience: 'named',
  people: 2,
  uses: 1,
  maxUses: null,
  endsAt: null,
  state: 'live',
};

beforeEach(() => jest.clearAllMocks());

it('reads a page of promotions with their money off, and where the next page starts', async () => {
  call.mockResolvedValue({ data: [ROW], hasMore: false, startingAfter: null });
  const page = await promotionsPage(null, { q: '', who: 'named', state: null }, 5);
  expect(call).toHaveBeenCalledWith('owner_promotions_page', { q: '', who: 'named', state: null, limit: 5, startingAfter: undefined });
  expect(page.next).toBeNull();
  expect(page.items[0]).toMatchObject({ code: 'FRIENDS', audience: 'named', state: 'live', terms: { kind: 'percent', percentOff: 20, plans: ['yearly'] } });
});

it('reads one promotion, or null', async () => {
  call.mockResolvedValue({ ...ROW, note: null, madeBy: null, stoppedAt: null, createdAt: ROW.madeAt, people: [], recent: [] });
  await expect(promotion(P1)).resolves.toMatchObject({ id: P1, people: [], recent: [], terms: { percentOff: 20 } });
  expect(call).toHaveBeenCalledWith('owner_promotion', { promotionId: P1 });
  call.mockResolvedValue(null);
  await expect(promotion(P1)).resolves.toBeNull();
});

it('makes, retries, stops, emails and counts on /v1', async () => {
  call.mockResolvedValue({ ok: true, ready: true, sent: 3 });
  await retryPromotion(P1);
  await stopPromotion(P1);
  await expect(emailPromotion(P1)).resolves.toBe(3);
  call.mockResolvedValue(4);
  await expect(promotionsCount({ q: 'x', who: null, state: 'live' })).resolves.toBe(4);
  expect(call.mock.calls.map(([name]) => name)).toEqual(['retry_promotion', 'owner_stop_promotion', 'owner_promotion_emails', 'owner_promotions_count']);
  const request = { name: 'Friends' } as never;
  call.mockResolvedValue({ ok: true, id: P1, ready: true });
  await makePromotion(request);
  expect(call).toHaveBeenLastCalledWith('owner_make_promotion', request);
});
