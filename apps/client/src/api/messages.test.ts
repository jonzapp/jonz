import { findHouses, findPeople, messageReach, sendMessage, sentCount, sentPage } from './messages';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const FILTER = { q: '', audience: null, way: 'email' as const, after: null, before: null };

beforeEach(() => jest.clearAllMocks());

it('reads what was sent a page at a time on /v1', async () => {
  call.mockResolvedValue({
    data: [{ id: 'm1', sentAt: '2026-11-01T00:00:00Z', audience: 'house', toName: 'Elm', subject: 'Hi', body: 'Hello', byPush: true, byWall: false, byEmail: true, people: 3, walls: 0, waiting: 1 }],
    hasMore: true,
    startingAfter: 'next',
  });
  const page = await sentPage('this', FILTER);
  expect(call).toHaveBeenCalledWith('owner_messages_page', { ...FILTER, limit: 50, startingAfter: 'this' });
  expect(page).toEqual({
    items: [{ id: 'm1', sentAt: '2026-11-01T00:00:00Z', audience: 'house', toName: 'Elm', subject: 'Hi', body: 'Hello', push: true, wall: false, email: true, people: 3, walls: 0, waiting: 1 }],
    more: true,
    next: 'next',
  });
});

it('sends, with the words tidied, and reaches, finds and counts on /v1', async () => {
  call.mockResolvedValue({ ok: true, people: 2 });
  await sendMessage({ audience: 'house', personId: null, houseId: 'h1', subject: ' Hi ', body: ' Hello ', ways: { push: true, wall: false, email: true } });
  expect(call).toHaveBeenCalledWith('owner_send_message', { audience: 'house', personId: null, houseId: 'h1', subject: 'Hi', body: 'Hello', push: true, wall: false, email: true });
  call.mockResolvedValue({ people: 1, push: 1, email: 0, houses: 1 });
  await expect(messageReach('person', 'u1', null)).resolves.toEqual({ people: 1, push: 1, email: 0, houses: 1 });
  expect(call).toHaveBeenLastCalledWith('owner_message_reach', { audience: 'person', personId: 'u1', houseId: null });
  call.mockResolvedValue([{ id: 'u1', name: null, email: 'a@b.c', houseId: null, houseName: null }]);
  await expect(findPeople('a@')).resolves.toEqual([{ id: 'u1', name: '', email: 'a@b.c', houseName: null }]);
  call.mockResolvedValue([{ id: 'h1', name: 'Elm', people: 3 }]);
  await expect(findHouses('el')).resolves.toEqual([{ id: 'h1', name: 'Elm', people: 3 }]);
  call.mockResolvedValue(5);
  await expect(sentCount(FILTER)).resolves.toBe(5);
});

it('asks nothing for an empty search', async () => {
  await expect(findPeople(' ')).resolves.toEqual([]);
  await expect(findHouses('')).resolves.toEqual([]);
  expect(call).not.toHaveBeenCalled();
});
