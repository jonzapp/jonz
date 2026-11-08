import { buildStake, humanError, monthOf, type HistoryRow, type HouseRules, type StakeView } from '@app/core';

import { supabase } from './supabase';

// The Stake, read through your own session (RLS decides) and built by core,
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
  const [ledger, closes] = await Promise.all([
    readLedger(houseId),
    supabase.from('month_closes').select('month').eq('house_id', houseId),
  ]);
  if (closes.error) throw closes.error;
  const rows: HistoryRow[] = ledger.map(({ assignments, ...row }) => ({ ...row, john: assignments ?? null }));
  const closedMonths = (closes.data ?? []).map((c) => c.month);
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
 * PostgREST hands back at most this many rows a read (`max_rows`, 1000 on
 * Supabase and in config.toml), and says nothing when it stops short.
 */
const PAGE = 1000;

/**
 * The house's whole ledger, newest first, a page at a time: every balance is
 * a sum of all of it, so a long-lived house can't lose its oldest rows. Each
 * page starts below the last id read rather than at a count of rows: the id
 * only grows, so a row written between two pages (a payment, a month
 * closing) lands above them all instead of pushing one onto the next page
 * twice.
 */
async function readLedger(houseId: string) {
  const page = (below: number | null) => {
    const query = supabase
      .from('ledger_entries')
      .select('id, user_id, kind, amount_minor, month, counterparty_user_id, doers, created_at, assignments(name, outcome, due_at)')
      .eq('house_id', houseId);
    return (below === null ? query : query.lt('id', below)).order('id', { ascending: false }).limit(PAGE);
  };
  const rows: NonNullable<Awaited<ReturnType<typeof page>>['data']> = [];
  for (let below: number | null = null; ; ) {
    const { data, error } = await page(below);
    if (error) throw error;
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE) return rows;
    below = got[got.length - 1].id;
  }
}

/**
 * Say the money arrived, or (`splitwise`) that it's been added in Splitwise
 * instead: only the person owed can (confirm_payment checks).
 */
export async function confirmPayment(houseId: string, fromUserId: string, amountMinor: number, via?: 'splitwise'): Promise<void> {
  const { error } = await supabase.rpc('confirm_payment', {
    p_house: houseId,
    p_from: fromUserId,
    p_amount: amountMinor,
    ...(via ? { p_via: via } : {}),
  });
  if (error) throw new Error(humanError(error));
}
