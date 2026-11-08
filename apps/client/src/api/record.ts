import { awayPeriod, type RecordInput } from '@app/core';

import { supabase } from './supabase';

// The track record's rows: every week the house has had, each one's shares,
// every John handed out in them, and everyone's time away, read through your
// own session (RLS decides) and summed by core.

/** A few years of weeks: more than any screen of squares shows. */
const MOST_WEEKS = 260;


export type RecordRows = Omit<RecordInput, 'memberIds' | 'now' | 'zone'>;

export async function loadRecord(houseId: string): Promise<RecordRows> {
  const [weeks, away, shares, johns, crew] = await Promise.all([
    supabase
      .from('weeks')
      .select('id, starts_on, starts_at, ends_at, skipped_at')
      .eq('house_id', houseId)
      .order('starts_on', { ascending: false })
      .limit(MOST_WEEKS),
    supabase.from('away_periods').select('id, user_id, starts_on, ends_on, note').eq('house_id', houseId),
    allPages((from, to) =>
      supabase.from('week_shares').select('week_id, user_id, share').eq('house_id', houseId).order('week_id').range(from, to),
    ),
    allPages((from, to) =>
      supabase
        .from('assignments')
        .select('id, week_id, user_id, name, points, due_at, done_at, outcome, excused, covered_by, changed_by, job_id, absent_at')
        .eq('house_id', houseId)
        .order('id')
        .range(from, to),
    ),
    // Who did each John ticked by roll call (crew.ts): their shares and who helped.
    allPages((from, to) =>
      supabase
        .from('crew_members')
        .select('job_id, assignment_id, user_id, helper, points')
        .eq('house_id', houseId)
        .order('job_id')
        .order('user_id')
        .range(from, to),
    ),
  ]);
  if (weeks.error) throw weeks.error;
  if (away.error) throw away.error;
  // Shares and Johns of weeks older than the ones read fall away in core, with their weeks.
  return {
    weeks: weeks.data ?? [],
    shares,
    johns,
    crew,
    away: (away.data ?? []).map(awayPeriod),
  };
}

/** The server hands back at most this many rows a read (supabase/config.toml max_rows). */
const PAGE = 1000;

/** Every row of a read, a page at a time: a house's Johns over the years run past one page. */
async function allPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}
