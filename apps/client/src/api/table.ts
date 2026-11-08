import {
  balanceRows,
  monthOf,
  monthStandings,
  monthWindow,
  recentBalances,
  USUAL_WEEKS,
  weekWindow,
  type BalanceRow,
  type HouseRules,
  type TableRow,
} from '@app/core';

import { supabase } from './supabase';

// The Table beyond this week: the month's standings and everyone's fair
// share, read through your own session (RLS decides) and summed by core, as
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
  const window = monthWindow(month, rules.timezone);
  const thisWeek = weekWindow(now, rules.timezone, rules.weekStarts);

  const [monthRows, pastWeeks] = await Promise.all([
    supabase
      .from('assignments')
      .select(
        'id, user_id, points, outcome, done_at, due_at, excused, covered_by, flagged_at, closes_at, job_id, absent_at, weeks(ends_at), crew:crew_members(user_id, helper, points)',
      )
      .eq('house_id', houseId)
      .gte('due_at', window.startsAt.toISOString())
      .lt('due_at', window.endsAt.toISOString()),
    supabase
      .from('weeks')
      .select('id')
      .eq('house_id', houseId)
      .lt('starts_on', thisWeek.startsOn)
      .order('starts_on', { ascending: false })
      .limit(USUAL_WEEKS),
  ]);
  if (monthRows.error) throw monthRows.error;
  if (pastWeeks.error) throw pastWeeks.error;

  // Every week before this one, summed by the database; the recent weeks' shares, for a usual week.
  const weekIds = (pastWeeks.data ?? []).map((w) => w.id);
  const [totals, shares] = await Promise.all([
    supabase.rpc('house_balances', { p_house: houseId, p_before: thisWeek.startsOn }),
    weekIds.length
      ? supabase.from('week_shares').select('user_id, share').in('week_id', weekIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (totals.error) throw totals.error;
  if (shares.error) throw shares.error;

  const { balances, usualShare } = recentBalances(
    { totals: totals.data ?? [], recentShares: shares.data ?? [] },
    memberIds,
  );
  return {
    month,
    monthTable: monthStandings(monthRows.data ?? [], memberIds, rules.disputeHours, now),
    balances: balanceRows(balances, usualShare, memberIds),
  };
}
