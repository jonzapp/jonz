import type { HouseRules, Outcome } from "./domain";

/**
 * The Stake.
 *
 * Everyone stakes the same amount each month. Finishing your Johns keeps it;
 * a late John forfeits a little, a missed one more, and nobody can lose more
 * than their stake in a month. Whatever is forfeited is shared equally among
 * the rest of the house.
 *
 * Only the differences ever change hands, so the app never asks anyone to pay
 * the stake in up front. It keeps an append-only ledger instead, in minor
 * units (pence, cents) and from each person's side: negative means they owe,
 * positive means they are owed. A balance is a sum of entries, never a stored
 * number, and a month's entries always sum to zero.
 *
 *   forfeit     written as each late, missed or covered John is settled
 *               (negative); a covered John's names its coverer as the
 *               counterparty_user_id, and a no-show's on a John done together names
 *               everyone who did it (doers)
 *   cap_refund  at month end, gives back anything forfeited beyond the stake
 *   share       at month end, each person's cut of everyone else's forfeits,
 *               plus the whole of any forfeit for a John they covered
 *   payment     when a payee confirms money arrived: +payer, −payee
 *   correction  an admin's reset after a month was shared out: the
 *               difference, in the month that's open, summing to zero
 */

export type LedgerKind = "forfeit" | "cap_refund" | "share" | "payment" | "correction";

export interface LedgerEntry {
  userId: string;
  kind: LedgerKind;
  amount: number;
}

/** What one settled John costs. */
export function forfeitFor(
  outcome: Outcome,
  rules: Pick<HouseRules, "lateForfeitMinor" | "missedForfeitMinor">,
): number {
  if (outcome === "late") return rules.lateForfeitMinor;
  if (outcome === "missed" || outcome === "covered") return rules.missedForfeitMinor;
  return 0;
}

export interface MonthSettlement {
  /** Each person's forfeits after the cap, as a positive number. */
  forfeited: Record<string, number>;
  /** Each person's cut of the others' forfeits. */
  received: Record<string, number>;
  /** The entries that close the month (cap refunds and shares). */
  entries: LedgerEntry[];
}

/**
 * One forfeit going into a month's close. `to` is the coverer, for a covered
 * John, or everyone who did a John done together that its holder didn't turn
 * up for (crew.ts), who share it.
 */
export interface MonthForfeit {
  userId: string;
  amount: number;
  to?: string | readonly string[] | null;
}

/**
 * Close a month. `memberIds` is everyone sharing in it, in a stable order
 * (join order), and `month` is which one ("2026-10"): together they decide
 * who gets the odd penny when a forfeit does not split evenly, so neither
 * may change between runs. The odd pennies take turns, a place further down
 * the order each month, so over a year they land evenly rather than always
 * on whoever joined first.
 *
 * A forfeit with a `to` (a covered John) goes whole to that housemate rather
 * than round the house; with several (a no-show's), it's split evenly among
 * them, the odd penny to whoever comes first. When the cap trims someone's
 * forfeits, each covered one shrinks in the same proportion (rounded down)
 * and the rest of what they keep is shared as usual. Someone who has left
 * the house gets nothing: a coverer's cut is shared like any other forfeit,
 * and the shares go only to people in `memberIds`.
 */
export function settleMonth(
  memberIds: readonly string[],
  stakeMinor: number,
  forfeits: readonly MonthForfeit[],
  month: string,
): MonthSettlement {
  const turn = monthNumber(month);
  const ids = [...memberIds];
  for (const f of forfeits) if (!ids.includes(f.userId)) ids.push(f.userId);

  const raw = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const f of forfeits) raw.set(f.userId, raw.get(f.userId)! + f.amount);

  const forfeited: Record<string, number> = {};
  const received: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const entries: LedgerEntry[] = [];

  for (const id of ids) {
    const total = raw.get(id)!;
    // A house of one has nobody to pay; everything comes back.
    const cap = ids.length < 2 ? 0 : Math.max(0, stakeMinor);
    const kept = Math.min(total, cap);
    forfeited[id] = kept;
    if (total > kept) entries.push({ userId: id, kind: "cap_refund", amount: total - kept });
  }

  for (const payer of ids) {
    const kept = forfeited[payer];
    if (kept === 0) continue;
    const total = raw.get(payer)!;
    let amount = kept;
    for (const f of forfeits) {
      if (f.userId !== payer || !f.to) continue;
      const to = (typeof f.to === "string" ? [f.to] : f.to).filter((id) => id !== payer && memberIds.includes(id));
      if (to.length === 0) continue;
      const cut = Math.floor((f.amount * kept) / total);
      const base = Math.floor(cut / to.length);
      to.forEach((id, i) => {
        received[id] += base + (i < cut - base * to.length ? 1 : 0);
      });
      amount -= cut;
    }
    if (amount === 0) continue;
    // Only people still in the house share it: someone who left pays what
    // they owe, but gets none of anyone else's.
    const inOrder = memberIds.filter((id) => id !== payer);
    if (inOrder.length === 0) {
      forfeited[payer] -= amount;
      entries.push({ userId: payer, kind: "cap_refund", amount });
      continue;
    }
    const start = turn % inOrder.length;
    const others = [...inOrder.slice(start), ...inOrder.slice(0, start)];
    const base = Math.floor(amount / others.length);
    let remainder = amount - base * others.length;
    for (const id of others) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      received[id] += base + extra;
    }
  }

  for (const id of ids) {
    if (received[id] > 0) entries.push({ userId: id, kind: "share", amount: received[id] });
  }

  return { forfeited, received, entries };
}

/** Months since year 0 for "2026-10", so each month starts the odd pennies one place on. */
function monthNumber(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(m) ? year * 12 + m - 1 : 0;
}

/** Sum entries into balances. */
export function balances(entries: readonly { userId: string; amount: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.userId, (out.get(e.userId) ?? 0) + e.amount);
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Who pays whom to clear the balances, in as few transfers as the greedy
 * rule finds: the biggest debt pays the biggest credit until one is cleared.
 * At most one transfer fewer than the number of people with a balance.
 */
export function settleUp(balance: ReadonlyMap<string, number>): Transfer[] {
  const debtors = [...balance]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, left: -v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const creditors = [...balance]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, left: v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left);
    if (amount > 0) out.push({ from: debtors[d].id, to: creditors[c].id, amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (debtors[d].left === 0) d += 1;
    if (creditors[c].left === 0) c += 1;
  }
  return out;
}

/** A `ledger` row as read. */
export interface LedgerRow {
  id: number;
  user_id: string;
  kind: string;
  amount_minor: number;
  month: string;
  counterparty_user_id: string | null;
  /** A no-show's forfeit on a John done together: everyone who did it. Absent when not read. */
  doers?: string[] | null;
  created_at: string;
}

export interface StakeView {
  month: string;
  stakeMinor: number;
  /** This month so far, as if it closed now. */
  projection: {
    userId: string;
    /** Before the cap. */
    forfeitedRaw: number;
    forfeited: number;
    received: number;
    net: number;
  }[];
  /** Everything owed from closed months, after payments. */
  outstanding: Map<string, number>;
  transfers: Transfer[];
  /** The latest entries, newest first. */
  history: {
    id: number;
    userId: string;
    kind: string;
    amount: number;
    month: string;
    counterparty_user_id: string | null;
    createdAt: string;
  }[];
}

/** How many ledger entries the Stake lists. */
export const HISTORY_LENGTH = 50;

/**
 * The Stake as both apps show it, from the house's ledger (newest first) and
 * the months already closed: this month so far as if it ended now, what is
 * owed from closed months after payments, who pays whom to settle it, and
 * the latest entries. Only closed months (and payments against them) are
 * owed for real: this month's forfeits aren't shared out until it ends.
 */
export function buildStake(input: {
  ledger: readonly LedgerRow[];
  closedMonths: readonly string[];
  memberIds: readonly string[];
  stakeMinor: number;
  month: string;
}): StakeView {
  const { ledger, memberIds, stakeMinor, month } = input;
  const thisMonthForfeits = ledger
    .filter((r) => r.month === month && r.kind === "forfeit")
    .map((r) => ({ userId: r.user_id, amount: -r.amount_minor, to: r.counterparty_user_id ?? r.doers ?? null }));
  const live = settleMonth(memberIds, stakeMinor, thisMonthForfeits, month);
  const raw = new Map<string, number>();
  for (const f of thisMonthForfeits) raw.set(f.userId, (raw.get(f.userId) ?? 0) + f.amount);
  // An admin's corrections to months already shared out land in this one, as they stand.
  const corrections = new Map<string, number>();
  for (const r of ledger) {
    if (r.month === month && r.kind === "correction") corrections.set(r.user_id, (corrections.get(r.user_id) ?? 0) + r.amount_minor);
  }

  const projection = memberIds.map((id) => ({
    userId: id,
    forfeitedRaw: raw.get(id) ?? 0,
    forfeited: live.forfeited[id] ?? 0,
    received: live.received[id] ?? 0,
    net: (live.received[id] ?? 0) - (live.forfeited[id] ?? 0) + (corrections.get(id) ?? 0),
  }));

  const closed = new Set(input.closedMonths);
  const settled = ledger.filter((r) => r.kind === "payment" || closed.has(r.month));
  const outstanding = balances(settled.map((r) => ({ userId: r.user_id, amount: r.amount_minor })));

  return {
    month,
    stakeMinor,
    projection,
    outstanding,
    transfers: settleUp(outstanding),
    history: ledger.slice(0, HISTORY_LENGTH).map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      amount: r.amount_minor,
      month: r.month,
      counterparty_user_id: r.counterparty_user_id,
      createdAt: r.created_at,
    })),
  };
}
