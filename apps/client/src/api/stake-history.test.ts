import type { HouseRules } from '@app/core';

import { loadStake } from './stake';

// What loadStake reads for House and Stake history on top of the Stake
// itself: the whole ledger, each forfeit with its John, and the closed
// months. stake.test.ts covers the Stake and Mark received.

const mockAnswers: Record<string, { data: unknown; error: unknown }> = {};
const mockCalls: [string, string, unknown[]][] = [];

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'lt', 'order', 'limit']) {
        builder[method] = jest.fn((...args: unknown[]) => {
          mockCalls.push([table, method, args]);
          return builder;
        });
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(mockAnswers[table] ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    }),
  },
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  for (const key of Object.keys(mockAnswers)) delete mockAnswers[key];
});

it('keeps the whole ledger, each forfeit with its John, and the closed months', async () => {
  const john = { name: 'Bins out', outcome: 'missed', due_at: '2026-10-08T07:00:00Z' };
  mockAnswers.ledger_entries = {
    data: [
      { ...row(2, 'ava', 'forfeit', -300, '2026-10'), assignments: john },
      { ...row(1, 'ben', 'share', 400, '2026-09'), assignments: null },
    ],
    error: null,
  };
  mockAnswers.month_closes = { data: [{ month: '2026-09' }], error: null };
  const stake = await loadStake('h1', RULES, ['ava', 'ben'], new Date('2026-10-21T12:00:00Z'));
  expect(stake.ledger).toEqual([
    { ...row(2, 'ava', 'forfeit', -300, '2026-10'), john },
    { ...row(1, 'ben', 'share', 400, '2026-09'), john: null },
  ]);
  expect(stake.closedMonths).toEqual(['2026-09']);
  expect(mockCalls).toContainEqual(['ledger_entries', 'select', [expect.stringContaining('assignments(name, outcome, due_at)')]]);
});

it('keeps a closed month with nothing in it', async () => {
  mockAnswers.month_closes = { data: [{ month: '2026-08' }], error: null };
  const stake = await loadStake('h1', RULES, ['ava'], new Date('2026-10-21T12:00:00Z'));
  expect(stake.ledger).toEqual([]);
  expect(stake.closedMonths).toEqual(['2026-08']);
});
