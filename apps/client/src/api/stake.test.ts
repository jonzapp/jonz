import type { HouseRules } from '@app/core';

import { confirmPayment, loadStake } from './stake';
import { supabase } from './supabase';

type Answer = { data: unknown; error: unknown };
/** A read's filters: the id it starts below, and how many rows it asks for. */
type Read = { below?: number; limit?: number };
/** What a read of each table answers; a function answers by the read's filters. */
const mockAnswers: Record<string, Answer | ((read: Read) => Answer)> = {};
const mockCalls: [string, string, unknown[]][] = [];

jest.mock('./supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const read: Read = {};
      for (const method of ['select', 'eq', 'lt', 'order', 'limit']) {
        builder[method] = jest.fn((...args: unknown[]) => {
          mockCalls.push([table, method, args]);
          if (method === 'lt') read.below = args[1] as number;
          if (method === 'limit') read.limit = args[0] as number;
          return builder;
        });
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const answer = mockAnswers[table] ?? { data: [], error: null };
        return Promise.resolve(typeof answer === 'function' ? answer(read) : answer).then(resolve, reject);
      };
      return builder;
    }),
  },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const RULES: HouseRules = {
  timezone: 'Europe/London',
  currency: 'GBP',
  weekStarts: 1,
  stakeMinor: 2000,
  lateForfeitMinor: 100,
  missedForfeitMinor: 300,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: 'smart',
  dealBudget: 4,
};
const row = (id: number, user_id: string, kind: string, amount_minor: number, month: string) => ({
  id,
  user_id,
  kind,
  amount_minor,
  month,
  counterparty_user_id: null,
  created_at: '2026-10-10T12:00:00Z',
});

type Row = ReturnType<typeof row>;
/** The ledger as the database answers a read of it: newest id first, below the id asked for, as many as asked. */
const ledgerOf = (rows: Row[]) => (read: Read) => ({
  data: rows
    .filter((r) => read.below === undefined || r.id < read.below)
    .sort((a, b) => b.id - a.id)
    .slice(0, read.limit),
  error: null,
});
/** The calls a read of the ledger made with one method, in order. */
const ledgerCalls = (method: string) =>
  mockCalls.filter(([table, m]) => table === 'ledger_entries' && m === method).map(([, , args]) => args);

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  for (const key of Object.keys(mockAnswers)) delete mockAnswers[key];
});

describe('loadStake', () => {
  it("builds the Stake from the house's ledger and its closed months", async () => {
    mockAnswers.ledger_entries = {
      data: [row(2, 'ava', 'forfeit', -300, '2026-10'), row(1, 'ava', 'forfeit', -400, '2026-09'), row(0, 'ben', 'share', 400, '2026-09')],
      error: null,
    };
    mockAnswers.month_closes = { data: [{ month: '2026-09' }], error: null };
    const stake = await loadStake('h1', RULES, ['ava', 'ben'], new Date('2026-10-21T12:00:00Z'));
    expect(stake.month).toBe('2026-10');
    expect(stake.projection.find((p) => p.userId === 'ava')).toMatchObject({ forfeited: 300, net: -300 });
    expect(stake.transfers).toEqual([{ from: 'ava', to: 'ben', amount: 400 }]);
    expect(mockCalls).toContainEqual(['ledger_entries', 'eq', ['house_id', 'h1']]);
    expect(mockCalls).toContainEqual(['ledger_entries', 'order', ['id', { ascending: false }]]);
  });

  it('reads the whole ledger a page at a time, as the database hands back at most 1000 rows a read', async () => {
    // A thousand pennies shared in September, half of them Ben's to Ava (£5), then, on the second page, his £4 forfeit.
    const shares = Array.from({ length: 1000 }, (_, i) => row(2000 - i, i % 2 ? 'ava' : 'ben', 'share', i % 2 ? 1 : -1, '2026-09'));
    mockAnswers.ledger_entries = ledgerOf([...shares, row(1, 'ben', 'forfeit', -400, '2026-09'), row(0, 'ava', 'share', 400, '2026-09')]);
    mockAnswers.month_closes = { data: [{ month: '2026-09' }], error: null };
    const stake = await loadStake('h1', RULES, ['ava', 'ben'], new Date('2026-10-21T12:00:00Z'));
    expect(stake.ledger).toHaveLength(1002);
    expect(stake.transfers).toEqual([{ from: 'ben', to: 'ava', amount: 900 }]);
    // The second page starts below the first page's last id.
    expect(ledgerCalls('limit')).toEqual([[1000], [1000]]);
    expect(ledgerCalls('lt')).toEqual([['id', 1001]]);
  });

  it('asks below the last of exactly 1000 rows, to be sure there are no more', async () => {
    const shares = Array.from({ length: 1000 }, (_, i) => row(1000 - i, i % 2 ? 'ava' : 'ben', 'share', i % 2 ? 1 : -1, '2026-09'));
    mockAnswers.ledger_entries = ledgerOf(shares);
    mockAnswers.month_closes = { data: [{ month: '2026-09' }], error: null };
    const stake = await loadStake('h1', RULES, ['ava', 'ben'], new Date('2026-10-21T12:00:00Z'));
    expect(stake.ledger).toHaveLength(1000);
    expect(stake.transfers).toEqual([{ from: 'ben', to: 'ava', amount: 500 }]);
    expect(ledgerCalls('lt')).toEqual([['id', 1]]);
  });

  it('counts each row once when a row is written between two pages', async () => {
    // 1002 pennies in September: Ben owes Ava £5.01.
    const rows = Array.from({ length: 1002 }, (_, i) => row(1002 - i, i % 2 ? 'ben' : 'ava', 'share', i % 2 ? -1 : 1, '2026-09'));
    const read = ledgerOf(rows);
    mockAnswers.ledger_entries = (filters) => {
      const answer = read(filters);
      // A forfeit lands just after the first page is read: newer than everything, so the next read takes it.
      if (filters.below === undefined) rows.push(row(1003, 'ben', 'forfeit', -300, '2026-10'));
      return answer;
    };
    mockAnswers.month_closes = { data: [{ month: '2026-09' }], error: null };
    const stake = await loadStake('h1', RULES, ['ava', 'ben'], new Date('2026-10-21T12:00:00Z'));
    const ids = stake.ledger.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(1002);
    expect(stake.transfers).toEqual([{ from: 'ben', to: 'ava', amount: 501 }]);
  });

  it('fails when the ledger or the closed months cannot be read', async () => {
    mockAnswers.ledger_entries = { data: null, error: new Error('offline') };
    await expect(loadStake('h1', RULES, ['ava'], new Date())).rejects.toThrow('offline');
    mockAnswers.ledger_entries = { data: [], error: null };
    mockAnswers.month_closes = { data: null, error: new Error('still offline') };
    await expect(loadStake('h1', RULES, ['ava'], new Date())).rejects.toThrow('still offline');
  });
});

describe('confirmPayment', () => {
  it('records the payment through confirm_payment, and says why when refused', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await confirmPayment('h1', 'ava', 400);
    expect(rpc).toHaveBeenCalledWith('confirm_payment', { p_house: 'h1', p_from: 'ava', p_amount: 400 });
    // Added in Splitwise instead: the same payment, saying so.
    await confirmPayment('h1', 'ava', 400, 'splitwise');
    expect(rpc).toHaveBeenLastCalledWith('confirm_payment', { p_house: 'h1', p_from: 'ava', p_amount: 400, p_via: 'splitwise' });

    rpc.mockResolvedValue({ data: null, error: { message: 'more_than_owed', code: 'P0001' } });
    await expect(confirmPayment('h1', 'ava', 9999)).rejects.toThrow("That’s more than is owed.");
  });
});
