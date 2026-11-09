import { monthOf, pocketView, type PocketView } from '@app/core';

import { callV1 } from './v1';

// Pocket money, in a family: what each kid earned and what a parent marked
// paid, read on /v1 (anyone in the house may) and summed by core. Paid is
// one SQL function, which decides.

/** The family's pocket money: this month so far, what's still to pay, and the history. */
export async function loadPocket(houseId: string, zone: string, kids: readonly string[], now: Date): Promise<PocketView> {
  const { earnings, pays } = await callV1('house_pocket', { houseId });
  return pocketView({
    earnings: earnings.map((e) => ({ user_id: e.userId, month: e.month, amount_minor: e.amountMinor })),
    pays: pays.map((p) => ({ user_id: p.userId, month: p.month, amount_minor: p.amountMinor, paid_by: p.paidBy, created_at: p.createdAt })),
    kids,
    month: monthOf(now, zone),
  });
}

/** A parent paid a kid what they earned in a month that's over (outside Jonz). Returns the amount. */
export async function payPocketMoney(houseId: string, kid: string, month: string): Promise<number> {
  return callV1('pay_pocket_money', { houseId, kidId: kid, month });
}
