import { buildStake, monthOf, type HistoryRow, type HouseRules, type StakeView } from '@app/core';

import { snakeKeys } from './base';
import { callV1 } from './v1';

// The Stake, read on /v1 (house_stake) and built by core,
// as the web builds it. The app never moves money: it only records that a
// payment arrived, and only the person paid can.

/**
 * The Stake as House and Stake history read it: core's StakeView, plus the
 * whole ledger (each forfeit with its John's name and how it ended) and the
 * months already closed, for saying which month a debt is from.
 */
export interface StakeRead extends StakeView {
  /** Newest first. */
  ledger: HistoryRow[];
  closedMonths: string[];
}

/** The house's ledger and closed months, as the Stake shows them now. */
export async function loadStake(
  houseId: string,
  rules: HouseRules,
  memberIds: readonly string[],
  now: Date,
): Promise<StakeRead> {
  const stake = await callV1('house_stake', { houseId });
  const rows: HistoryRow[] = stake.ledger.map(({ john, ...row }) => ({
    ...(snakeKeys(row) as Omit<HistoryRow, 'john'>),
    john: john && { name: john.name, outcome: john.outcome, due_at: john.dueAt },
  }));
  const { closedMonths } = stake;
  return {
    ...buildStake({
      ledger: rows,
      closedMonths,
      memberIds,
      stakeMinor: rules.stakeMinor,
      month: monthOf(now, rules.timezone),
    }),
    ledger: rows,
    closedMonths,
  };
}

/**
 * Say the money arrived, or (`splitwise`) that it's been added in Splitwise
 * instead: only the person owed can (confirm_payment checks).
 */
export async function confirmPayment(houseId: string, fromUserId: string, amountMinor: number, via?: 'splitwise'): Promise<void> {
  await callV1('confirm_payment', { houseId, fromId: fromUserId, amount: amountMinor, via });
}
