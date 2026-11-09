import { deleteHouse, housesCount, housesPage, ownerHouse, ownerOverview } from './houses';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const FILTER = { q: 'elm', pass: 'paid' as const, active: null, after: null, before: null };
const H1 = '00000000-0000-4000-8000-0000000000b1';

beforeEach(() => jest.clearAllMocks());

it('reads a page of houses on /v1, and passes on where the next starts', async () => {
  call.mockResolvedValue({
    data: [
      {
        id: H1,
        name: 'Elm',
        joinCode: 'ABC123',
        people: 3,
        passPlan: 'yearly',
        passEndsAt: '2027-01-01T00:00:00Z',
        lastActive: null,
        onTime: 90,
        settled: 2,
        createdAt: '2026-10-01T00:00:00Z',
        sortAt: '2026-10-01T00:00:00Z',
      },
    ],
    hasMore: true,
    startingAfter: 'next-page',
  });
  const page = await housesPage('this-page', FILTER);
  expect(call).toHaveBeenCalledWith('owner_houses_page', { ...FILTER, limit: 50, startingAfter: 'this-page' });
  expect(page).toMatchObject({ more: true, next: 'next-page', items: [{ id: H1, passUntil: '2027-01-01T00:00:00Z', joinCode: 'ABC123' }] });
  await housesPage(null, FILTER);
  expect(call).toHaveBeenLastCalledWith('owner_houses_page', { ...FILTER, limit: 50, startingAfter: undefined });
});

it('counts, reads one, reads the Overview, and deletes a house on /v1', async () => {
  call.mockResolvedValue(2);
  await expect(housesCount(FILTER)).resolves.toBe(2);
  expect(call).toHaveBeenCalledWith('owner_houses_count', FILTER);
  call.mockResolvedValue(null);
  await expect(ownerHouse(H1)).resolves.toBeNull();
  expect(call).toHaveBeenCalledWith('owner_house', { houseId: H1 });
  call.mockResolvedValue({ houses: 1 });
  await expect(ownerOverview('week', 'Europe/London')).resolves.toMatchObject({ overview: { houses: 1 } });
  expect(call).toHaveBeenCalledWith('owner_overview', { span: 'week', zone: 'Europe/London' });
  call.mockResolvedValue({ ok: true, people: 2, told: 2, passStopped: false });
  await deleteHouse(H1, '  asked to  ', true);
  expect(call).toHaveBeenCalledWith('owner_delete_house', { houseId: H1, reason: 'asked to', tell: true });
});
