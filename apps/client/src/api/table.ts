import { balanceRows, monthOf, monthStandings, recentBalances, type BalanceRow, type HouseRules, type MonthRow, type TableRow } from '@app/core';

import { snakeKeys } from './base';
import { callV1 } from './v1';

// The Table beyond this week: the month's standings and everyone's fair
// share, read on /v1 (house_month) and summed by core, as
// the web and the deal sum them.

export interface TableSnapshot {
  /** `yyyy-MM`, the house's month now. */
  month: string;
  monthTable: TableRow[];
  /** Furthest behind first. */
  balances: BalanceRow[];
}

export async function loadTable(
  houseId: string,
  rules: HouseRules,
  memberIds: readonly string[],
  now: Date,
): Promise<TableSnapshot> {
  const month = monthOf(now, rules.timezone);
  // The month's Johns; every week before this one, summed by the database; the recent weeks' shares, for a usual week.
  const read = await callV1('house_month', { houseId, month });
  const monthRows: MonthRow[] = read.assignments.map(({ weekEndsAt, crew, ...a }) => ({
    ...(snakeKeys(a) as Omit<MonthRow, 'weeks' | 'crew'>),
    weeks: { ends_at: weekEndsAt },
    crew: crew.map((c) => ({ user_id: c.userId, helper: c.helper, points: c.points })),
  }));
  const { balances, usualShare } = recentBalances(
    {
      totals: read.totals.map((t) => ({ user_id: t.userId, owed: t.owed, credited: t.credited })),
      recentShares: read.recentShares.map((r) => ({ user_id: r.userId, share: r.share })),
    },
    memberIds,
  );
  return {
    month,
    monthTable: monthStandings(monthRows, memberIds, rules.disputeHours, now),
    balances: balanceRows(balances, usualShare, memberIds),
  };
}
