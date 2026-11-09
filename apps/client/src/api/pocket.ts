import { monthOf, pocketView, type PocketView } from '@app/core';

import { supabase } from './supabase';
import { callV1 } from './v1';

// Pocket money, in a family: what each kid earned and what a parent marked
// paid, read through your own session (RLS lets anyone in the house read
// them) and summed by core. Paid is one SQL function, which decides.

/** The family's pocket money: this month so far, what's still to pay, and the history. */
export async function loadPocket(houseId: string, zone: string, kids: readonly string[], now: Date): Promise<PocketView> {
  const [earnings, pays] = await Promise.all([
    supabase.from('pocket_earnings').select('user_id, month, amount_minor').eq('house_id', houseId),
    supabase.from('pocket_pays').select('user_id, month, amount_minor, paid_by, created_at').eq('house_id', houseId),
  ]);
  if (earnings.error) throw earnings.error;
  if (pays.error) throw pays.error;
  return pocketView({ earnings: earnings.data ?? [], pays: pays.data ?? [], kids, month: monthOf(now, zone) });
}

/** A parent paid a kid what they earned in a month that's over (outside Jonz). Returns the amount. */
export async function payPocketMoney(houseId: string, kid: string, month: string): Promise<number> {
  return callV1('pay_pocket_money', { houseId, kidId: kid, month });
}
