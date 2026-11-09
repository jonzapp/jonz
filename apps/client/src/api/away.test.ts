import { cancelAway, loadAway, setAway } from './away';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const post = callV1 as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('loadAway', () => {
  it("reads the house's time away from a week ago, with today in the house's zone", async () => {
    const period = { id: 'p1', userId: 'ben', startsOn: '2026-10-26', endsOn: '2026-10-28', note: 'Lisbon' };
    post.mockResolvedValue([period]);
    // 23:30 on the 25th in London is already the 26th in Auckland.
    const away = await loadAway('h1', 'Pacific/Auckland', new Date('2026-10-25T23:30:00Z'));
    expect(away).toEqual({ today: '2026-10-26', periods: [period] });
    expect(post).toHaveBeenCalledWith('house_away', { houseId: 'h1', from: '2026-10-19' });
  });

  it('passes on a refusal', async () => {
    post.mockRejectedValue(new Error('offline'));
    await expect(loadAway('h1', 'Europe/London', new Date('2026-10-25T12:00:00Z'))).rejects.toThrow('offline');
  });
});

describe('setAway', () => {
  it('books on /v1, which tells whoever it hands a John to, and says what it did to your Johns', async () => {
    post.mockResolvedValue({ ok: true, before: 1, handed: 1, skipped: 0 });
    expect(await setAway({ from: '2026-10-26', to: '2026-10-28', note: ' Lisbon ' })).toEqual({ before: 1, handed: 1, skipped: 0 });
    expect(post).toHaveBeenCalledWith('set_away', { from: '2026-10-26', to: '2026-10-28', note: 'Lisbon' });
  });

  it("says what's wrong before asking, and the API's refusal after", async () => {
    await expect(setAway({ from: '', to: '2026-10-28' })).rejects.toThrow("Pick the first day you’re away.");
    expect(post).not.toHaveBeenCalled();
    post.mockRejectedValue(new Error("You’re already away for some of those days."));
    await expect(setAway({ from: '2026-10-26', to: '2026-10-28' })).rejects.toThrow("You’re already away for some of those days.");
  });
});

describe('cancelAway', () => {
  it('cancels on /v1, passing on a refusal', async () => {
    post.mockResolvedValue(null);
    await cancelAway('p1');
    expect(post).toHaveBeenCalledWith('cancel_away', { awayId: 'p1' });
    post.mockRejectedValue(new Error('That time away has already finished.'));
    await expect(cancelAway('p1')).rejects.toThrow('That time away has already finished.');
  });
});
