import { cancelAway, loadAway, setAway } from './away';
import { apiPost } from './http';
import { supabase } from './supabase';

jest.mock('./http', () => ({ apiPost: jest.fn() }));

const mockCalls: [string, unknown[]][] = [];
let mockAnswer: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('./supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'order']) {
        builder[method] = jest.fn((...args: unknown[]) => {
          mockCalls.push([method, args]);
          return builder;
        });
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(mockAnswer).then(resolve, reject);
      return builder;
    }),
  },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const post = apiPost as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockAnswer = { data: [], error: null };
});

describe('loadAway', () => {
  it("reads the house's time away from a week ago, with today in the house's zone", async () => {
    mockAnswer = {
      data: [{ id: 'p1', user_id: 'ben', starts_on: '2026-10-26', ends_on: '2026-10-28', note: 'Lisbon' }],
      error: null,
    };
    // 23:30 on the 25th in London is already the 26th in Auckland.
    const away = await loadAway('h1', 'Pacific/Auckland', new Date('2026-10-25T23:30:00Z'));
    expect(away).toEqual({
      today: '2026-10-26',
      periods: [{ id: 'p1', userId: 'ben', startsOn: '2026-10-26', endsOn: '2026-10-28', note: 'Lisbon' }],
    });
    expect(mockCalls).toContainEqual(['eq', ['house_id', 'h1']]);
    expect(mockCalls).toContainEqual(['gte', ['ends_on', '2026-10-19']]);
  });

  it('throws what the database said', async () => {
    mockAnswer = { data: null, error: { message: 'offline' } };
    await expect(loadAway('h1', 'Europe/London', new Date())).rejects.toEqual({ message: 'offline' });
  });
});

describe('setAway', () => {
  it('books through the API, which tells whoever it hands a John to, and says what it did to your Johns', async () => {
    post.mockResolvedValue({ ok: true, before: 1, handed: 1, skipped: 0 });
    expect(await setAway({ from: '2026-10-26', to: '2026-10-28', note: ' Lisbon ' })).toEqual({ before: 1, handed: 1, skipped: 0 });
    expect(post).toHaveBeenCalledWith('/api/away', { from: '2026-10-26', to: '2026-10-28', note: 'Lisbon' }, expect.anything());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says what's wrong before asking, and the API's refusal after", async () => {
    await expect(setAway({ from: '', to: '2026-10-28' })).rejects.toThrow("Pick the first day you’re away.");
    expect(post).not.toHaveBeenCalled();
    post.mockRejectedValue(new Error("You’re already away for some of those days."));
    await expect(setAway({ from: '2026-10-26', to: '2026-10-28' })).rejects.toThrow("You’re already away for some of those days.");
  });
});

describe('cancelAway', () => {
  it('cancels through cancel_away, in words when refused', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await cancelAway('p1');
    expect(rpc).toHaveBeenCalledWith('cancel_away', { p_away: 'p1' });
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'away_over' } });
    await expect(cancelAway('p1')).rejects.toThrow('That time away has already finished.');
  });
});
