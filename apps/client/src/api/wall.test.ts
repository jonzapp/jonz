import { supabase } from './supabase';
import { callV1 } from './v1';
import { loadWall, loadWallEvents, setReaction, signPhoto } from './wall';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { storage: { from: jest.fn(() => ({ createSignedUrls: jest.fn() })) } } }));

const call = callV1 as jest.Mock;
const storage = supabase.storage as unknown as { from: jest.Mock };

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    kind: 'done',
    userId: 'ben',
    assignmentId: 'a1',
    data: { name: 'Bins' },
    createdAt: '2026-10-21T12:00:00Z',
    photoPath: 'h1/a1/p.jpg',
    reactions: [{ userId: 'ava', kind: 'nice' }],
    ...overrides,
  };
}
const page = (data: unknown[], next: string | null = null) => ({ data, hasMore: next !== null, startingAfter: next });

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(page([]));
});

describe('loadWall', () => {
  it("reads the house's latest events on /v1", async () => {
    await loadWall('h1', 'ava');
    expect(call).toHaveBeenCalledWith('house_wall', { houseId: 'h1', limit: 60, startingAfter: undefined });
  });

  it('counts the reactions, reads what happened in its own names, and signs each photo for an hour in one go', async () => {
    call.mockResolvedValue(page([event({ kind: 'away', data: { startsOn: '2026-11-01' } }), event({ id: 'e2' })]));
    const createSignedUrls = jest.fn().mockResolvedValue({ data: [{ path: 'h1/a1/p.jpg', signedUrl: 'https://signed/p' }] });
    storage.from.mockReturnValue({ createSignedUrls });

    const wall = await loadWall('h1', 'ava');
    expect(wall.events[0].reactions.nice).toEqual({ count: 1, mine: true });
    expect(wall.events[0].data).toEqual({ starts_on: '2026-11-01' });
    expect(storage.from).toHaveBeenCalledWith('proofs');
    expect(createSignedUrls).toHaveBeenCalledWith(['h1/a1/p.jpg'], 3600);
    expect(wall.photos).toEqual({ 'h1/a1/p.jpg': 'https://signed/p' });
  });

  it('asks for no links when there are no photos, and fails when it cannot read', async () => {
    call.mockResolvedValue(page([event({ photoPath: null })]));
    await loadWall('h1', 'ava');
    expect(storage.from).not.toHaveBeenCalled();
    call.mockRejectedValue(new Error('offline'));
    await expect(loadWall('h1', 'ava')).rejects.toThrow('offline');
  });

  it('reads older pages from where the last one stopped, and says where the next starts', async () => {
    call.mockResolvedValue(page([event()], 'c-1'));
    expect((await loadWall('h1', 'ava', 2)).older).toBe('c-1');
    call.mockResolvedValue(page([event()]));
    expect((await loadWall('h1', 'ava', 2, 'c-1')).older).toBeNull();
    expect(call).toHaveBeenLastCalledWith('house_wall', { houseId: 'h1', limit: 2, startingAfter: 'c-1' });
  });

  it('reads the latest few for House without signing photos', async () => {
    call.mockResolvedValue(page([event()]));
    expect((await loadWallEvents('h1', 'ava', 3)).photos).toEqual({});
    expect(storage.from).not.toHaveBeenCalled();
  });
});

describe('signPhoto', () => {
  it('signs one receipt for an hour, and fails when storage says no', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/p' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Object not found') });
    storage.from.mockReturnValue({ createSignedUrl });

    await expect(signPhoto('h1/a1/p.jpg')).resolves.toBe('https://signed/p');
    expect(createSignedUrl).toHaveBeenCalledWith('h1/a1/p.jpg', 3600);
    await expect(signPhoto('h1/a1/gone.jpg')).rejects.toThrow('Object not found');
  });
});

describe('setReaction', () => {
  it('reacts, and takes it back, on /v1', async () => {
    call.mockResolvedValue(null);
    await setReaction('e1', 'ava', 'fire', true);
    expect(call).toHaveBeenCalledWith('react', { eventId: 'e1', kind: 'fire' });
    await setReaction('e1', 'ava', 'fire', false);
    expect(call).toHaveBeenLastCalledWith('unreact', { eventId: 'e1', kind: 'fire' });
  });
});
