import type { HouseRules } from '@app/core';

import { loadTable } from './table';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
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
const NOW = new Date('2026-10-21T12:00:00Z');
const read = (over: Record<string, unknown> = {}) => ({ assignments: [], recentShares: [], totals: [], ...over });

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(read());
});

it("scores the house's month, from the Johns due in it", async () => {
  call.mockResolvedValue(
    read({
      assignments: [
        { id: 'a1', userId: 'ava', points: 4, outcome: 'done', doneAt: '2026-10-05T10:00:00Z', dueAt: '2026-10-05T19:00:00Z', excused: false, coveredBy: null, flaggedAt: null, closesAt: null, jobId: null, absentAt: null, weekEndsAt: '2026-10-11T23:00:00Z', crew: [] },
        { id: 'a2', userId: 'ben', points: 2, outcome: 'missed', doneAt: null, dueAt: '2026-10-06T19:00:00Z', excused: false, coveredBy: null, flaggedAt: null, closesAt: null, jobId: null, absentAt: null, weekEndsAt: '2026-10-11T23:00:00Z', crew: [] },
      ],
    }),
  );
  const table = await loadTable('h1', RULES, ['ava', 'ben'], NOW);
  expect(call).toHaveBeenCalledWith('house_month', { houseId: 'h1', month: '2026-10' });
  expect(table.month).toBe('2026-10');
  expect(table.monthTable.map((r) => [r.userId, r.points, r.missed])).toEqual([
    ['ava', 4, 0],
    ['ben', 0, 1],
  ]);
});

it('balances everyone against everything they owed, over every week before this one', async () => {
  call.mockResolvedValue(
    read({
      totals: [
        { userId: 'ava', owed: 40, credited: 38 },
        { userId: 'ben', owed: 40, credited: 42 },
      ],
      recentShares: [
        { userId: 'ava', share: 2 },
        { userId: 'ava', share: 4 },
        { userId: 'ben', share: 2 },
      ],
    }),
  );
  const table = await loadTable('h1', RULES, ['ava', 'ben'], NOW);
  // Ava is 2 behind; at half her usual 3-point week extra, that's 2 weeks to even.
  expect(table.balances).toEqual([
    { userId: 'ava', balance: -2, weeksToEven: 2 },
    { userId: 'ben', balance: 2, weeksToEven: 0 },
  ]);
});

it('is level for a house with no weeks behind it, and fails when it cannot read', async () => {
  expect((await loadTable('h1', RULES, ['ava'], NOW)).balances).toEqual([{ userId: 'ava', balance: 0, weeksToEven: 0 }]);
  call.mockRejectedValue(new Error('offline'));
  await expect(loadTable('h1', RULES, ['ava'], NOW)).rejects.toThrow('offline');
});
