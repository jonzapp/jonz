import type { HouseRules } from '@app/core';

import { confirmPayment, loadStake } from './stake';
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
const row = (id: number, userId: string, kind: string, amountMinor: number, month: string) => ({
  id,
  userId,
  kind,
  amountMinor,
  month,
  counterpartyUserId: null,
  doers: null,
  createdAt: '2026-10-10T12:00:00Z',
  john: null,
});
const NOW = new Date('2026-10-21T12:00:00Z');

beforeEach(() => jest.clearAllMocks());

describe('loadStake', () => {
  it("builds the Stake from the house's ledger and its closed months, read in one go on /v1", async () => {
    call.mockResolvedValue({
      ledger: [
        { ...row(2, 'ava', 'forfeit', -300, '2026-10'), john: { name: 'Bins', outcome: 'missed', dueAt: '2026-10-05T19:00:00Z' } },
        row(1, 'ava', 'forfeit', -400, '2026-09'),
        row(0, 'ben', 'share', 400, '2026-09'),
      ],
      closedMonths: ['2026-09'],
    });
    const stake = await loadStake('h1', RULES, ['ava', 'ben'], NOW);
    expect(call).toHaveBeenCalledWith('house_stake', { houseId: 'h1' });
    expect(stake.month).toBe('2026-10');
    expect(stake.projection.find((p) => p.userId === 'ava')).toMatchObject({ forfeited: 300, net: -300 });
    expect(stake.transfers).toEqual([{ from: 'ava', to: 'ben', amount: 400 }]);
    expect(stake.closedMonths).toEqual(['2026-09']);
    expect(stake.ledger[0]).toMatchObject({ user_id: 'ava', amount_minor: -300, john: { name: 'Bins', outcome: 'missed', due_at: '2026-10-05T19:00:00Z' } });
  });

  it('fails when it cannot be read', async () => {
    call.mockRejectedValue(new Error('offline'));
    await expect(loadStake('h1', RULES, ['ava'], NOW)).rejects.toThrow('offline');
  });
});

describe('confirmPayment', () => {
  it('records the payment through confirm_payment, and says why when refused', async () => {
    const call = callV1 as jest.Mock;
    call.mockResolvedValue(null);
    await confirmPayment('h1', 'ava', 400);
    expect(call).toHaveBeenCalledWith('confirm_payment', { houseId: 'h1', fromId: 'ava', amount: 400, via: undefined });
    // Added in Splitwise instead: the same payment, saying so.
    await confirmPayment('h1', 'ava', 400, 'splitwise');
    expect(call).toHaveBeenLastCalledWith('confirm_payment', { houseId: 'h1', fromId: 'ava', amount: 400, via: 'splitwise' });

    call.mockRejectedValue(new Error('That’s more than is owed.'));
    await expect(confirmPayment('h1', 'ava', 9999)).rejects.toThrow('That’s more than is owed.');
  });
});
