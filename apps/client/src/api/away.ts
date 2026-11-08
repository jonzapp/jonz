import { addDaysTo, AwayDraft, awayPeriod, AwayResponse, humanError, localDate, type AwayPeriod } from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

// Time away, read through your own session. Booking goes through apps/api
// (POST /api/away, which calls set_away as you and pushes whoever it hands a
// John to); cancelling is cancel_away. The database decides everything: no
// Johns due while you're gone, the ones you already have pulled forward to
// before you go, and on cancelling, any it handed on come back to you.

export interface AwayView {
  /** Today in the house's zone, `yyyy-MM-dd`. */
  today: string;
  /** Everyone's time away from the last week onwards, earliest first. */
  periods: AwayPeriod[];
}

/** The house's time away: what's on now, what's coming, and the last week of it, as the web reads it. */
export async function loadAway(houseId: string, zone: string, now: Date): Promise<AwayView> {
  const today = localDate(now, zone);
  const { data, error } = await supabase
    .from('away_periods')
    .select('id, user_id, starts_on, ends_on, note')
    .eq('house_id', houseId)
    .gte('ends_on', addDaysTo(today, -7))
    .order('starts_on');
  if (error) throw error;
  return { today, periods: (data ?? []).map(awayPeriod) };
}

/** What booking did to your Johns: made due before you go, handed to housemates, or skipped. */
export interface Booked {
  before: number;
  handed: number;
  skipped: number;
}

/** Book time away for yourself. Answers what it did to your Johns. */
export async function setAway(draft: AwayDraft): Promise<Booked> {
  const parsed = AwayDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { before, handed, skipped } = await apiPost('/api/away', parsed.data, AwayResponse);
  return { before, handed, skipped };
}

/** Cancel time away, or come back early from it. The Johns it moved go back to when they were due, and any it handed on that are still open come back to you. */
export async function cancelAway(awayId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_away', { p_away: awayId });
  if (error) throw new Error(humanError(error));
}
