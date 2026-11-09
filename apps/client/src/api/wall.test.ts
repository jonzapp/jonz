import { callV1 } from './v1';
import { loadWall, loadWallEvents, setReaction, signPhoto } from './wall';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
/** Whether the Wall asked /v1 for photo links. */
const linked = () => call.mock.calls.some(([name]) => name === 'file_links');

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

  it('counts the reactions, reads what happened in its own names, and links each photo in one go', async () => {
    call
      .mockResolvedValueOnce(page([event({ kind: 'away', data: { startsOn: '2026-11-01' } }), event({ id: 'e2' })]))
      .mockResolvedValueOnce({ links: { 'h1/a1/p.jpg': 'https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=t' } });

    const wall = await loadWall('h1', 'ava');
    expect(wall.events[0].reactions.nice).toEqual({ count: 1, mine: true });
    expect(wall.events[0].data).toEqual({ starts_on: '2026-11-01' });
    expect(call).toHaveBeenLastCalledWith('file_links', { kind: 'proof', paths: ['h1/a1/p.jpg'] });
    expect(wall.photos).toEqual({ 'h1/a1/p.jpg': 'https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=t' });
  });

  it('asks for no links when there are no photos, and fails when it cannot read', async () => {
    call.mockResolvedValue(page([event({ photoPath: null })]));
    await loadWall('h1', 'ava');
    expect(linked()).toBe(false);
    call.mockRejectedValue(new Error('offline'));
    await expect(loadWall('h1', 'ava')).rejects.toThrow('offline');
  });

  it('reads older pages from where the last one stopped, and says where the next starts', async () => {
    call.mockResolvedValueOnce(page([event({ photoPath: null })], 'c-1'));
    expect((await loadWall('h1', 'ava', 2)).older).toBe('c-1');
    call.mockResolvedValueOnce(page([event({ photoPath: null })]));
    expect((await loadWall('h1', 'ava', 2, 'c-1')).older).toBeNull();
    expect(call).toHaveBeenLastCalledWith('house_wall', { houseId: 'h1', limit: 2, startingAfter: 'c-1' });
  });

  it('reads the latest few for House without signing photos', async () => {
    call.mockResolvedValue(page([event()]));
    expect((await loadWallEvents('h1', 'ava', 3)).photos).toEqual({});
    expect(linked()).toBe(false);
  });
});

describe('signPhoto', () => {
  it("links one receipt, and fails when it isn't there to see", async () => {
    call.mockResolvedValueOnce({ links: { 'h1/a1/p.jpg': 'https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=t' } }).mockResolvedValueOnce({ links: {} });
    await expect(signPhoto('h1/a1/p.jpg')).resolves.toBe('https://jonz.app/files/see/proofs/h1/a1/p.jpg?token=t');
    expect(call).toHaveBeenCalledWith('file_links', { kind: 'proof', paths: ['h1/a1/p.jpg'] });
    await expect(signPhoto('h1/a1/gone.jpg')).rejects.toThrow('That photo isn’t there any more.');
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
