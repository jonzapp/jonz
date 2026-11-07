import {
  houseKind,
  myPrefsOf,
  passOf,
  weekStateOf,
  weekWindow,
  rulesOf,
  type AssignmentRow,
  type DisputeRow,
  type HouseKind,
  type HousePass,
  type HouseRules,
  type MyPrefs,
  type OnCallRow,
  type SettleIn,
  type SteadyAheadWeek,
  type SwapOfferRow,
  type WeekRow,
} from '@app/core';

import { supabase } from './supabase';

// Everything a house screen shows, read through your own session (RLS
// decides), as rows. Screens build the week from them with core's
// buildWeekBoard at the moment they render, so statuses move on with the
// clock between reads.

export interface Housemate {
  userId: string;
  name: string;
  /** Their sign-in photo's address, or null: the avatar shows initials. */
  photo: string | null;
  role: 'admin' | 'member';
  streak: number;
  immunityTokens: number;
  swapTokens: number;
  /** Days that suit them, their best time and the Johns they'd rather do or not (House, You, Preferences). */
  prefs: MyPrefs;
  /** The day they move out (the house's local date), once they've said. */
  movingOutOn?: string | null;
  /** False for a kid without a sign-in, whose parents tick for them (family step 4). */
  signsIn?: boolean;
  /** In a family: the year a kid was born, which the deal keeps to (johns.min_age). */
  bornYear?: number | null;
}

export interface HouseSnapshot {
  house: {
    id: string;
    name: string;
    joinCode: string;
    everDealt: boolean;
    /** Housemates or a family (houses.kind). */
    kind: HouseKind;
    awayMakeup: number;
    /** Where the house settles up at month end (houses.settle_in). */
    settleIn: SettleIn;
    /** In a family: the most each kid can earn in a month (houses.pocket_cap_minor); 0 for housemates. */
    pocketCapMinor?: number;
    /** A switch from Rules' Who lives here that waits for the 1st (houses.next_kind, next_kind_on). */
    nextKind?: { kind: HouseKind; on: string } | null;
    /** The House Pass: who has the extras, and until when. */
    pass: HousePass;
  };
  rules: HouseRules;
  members: Housemate[];
  week: WeekRow | null;
  /** This week's Johns, and any flag from last week still open (it stays its holder's). */
  assignments: AssignmentRow[];
  disputes: DisputeRow[];
  /** Who is on call for each on-call John this week. */
  onCall: OnCallRow[];
  /** What this week's deal kept: the Johns waiting their turn (John id → weeks waited) and the next two weeks as it would hand them out. */
  steady: { waiting: Record<string, number>; ahead: SteadyAheadWeek[] };
  /** Asks to swap still open that you made or were asked (only the two of them can read one). */
  offers: SwapOfferRow[];
  /** When someone last moved out and last moved in, from the Wall: whether to ask who's moving in. */
  moves?: { lastMovedOut: string | null; lastJoined: string | null };
}

/** One read of a house: its rules and people, and this week's Johns and disputes. */
export async function loadHouse(houseId: string, now: Date): Promise<HouseSnapshot> {
  const [{ data: house, error: houseError }, { data: members, error: membersError }, movedOut, joined] = await Promise.all([
    supabase.from('houses').select('*').eq('id', houseId).single(),
    supabase
      .from('members')
      .select(
        'user_id, role, streak, immunity_tokens, swap_tokens, suits_days, best_time, rather, moving_out_on, signs_in, born_year, profiles(display_name, avatar_url)',
      )
      .eq('house_id', houseId)
      .order('joined_at'),
    lastEvent(houseId, 'moved_out'),
    lastEvent(houseId, 'joined'),
  ]);
  if (houseError) throw houseError;
  if (membersError) throw membersError;

  const rules = rulesOf(house);
  const window = weekWindow(now, rules.timezone, rules.weekStarts);
  const { data: week, error: weekError } = await supabase
    .from('weeks')
    .select('id, starts_on, starts_at, ends_at, waiting, ahead')
    .eq('house_id', houseId)
    .eq('starts_on', window.startsOn)
    .maybeSingle();
  if (weekError) throw weekError;

  const [assignments, carried, disputes, onCall, offers] = week
    ? await Promise.all([
        // With how often each comes round, from the John it was dealt from (the John sheet says so).
        supabase.from('assignments').select('*, johns(every_weeks, every_months), crew(user_id, helper, points)').eq('week_id', week.id).order('due_at'),
        // A John from last week can still be open (a flag, or one due late on
        // its last day, inside its late window): it stays with whoever had it.
        supabase
          .from('assignments')
          .select('*, johns(every_weeks, every_months), crew(user_id, helper, points)')
          .eq('house_id', houseId)
          .neq('week_id', week.id)
          .is('outcome', null),
        supabase
          .from('disputes')
          .select('id, assignment_id, raised_by, reason, closes_at, photo_path, dispute_votes(user_id, uphold)')
          .eq('house_id', houseId)
          .is('resolution', null),
        supabase.from('on_call').select('john_id, user_id, johns(name, category, needs_photo, archived_at)').eq('week_id', week.id),
        supabase
          .from('swap_offers')
          .select('id, mine, theirs, asked_by, asked_to, expires_at')
          .eq('house_id', houseId)
          .is('answer', null)
          .gt('expires_at', now.toISOString()),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (assignments.error) throw assignments.error;
  if (carried.error) throw carried.error;
  if (disputes.error) throw disputes.error;
  if (onCall.error) throw onCall.error;
  if (offers.error) throw offers.error;

  return {
    house: {
      id: house.id,
      name: house.name,
      joinCode: house.join_code,
      everDealt: house.first_dealt_at !== null,
      kind: houseKind(house.kind),
      awayMakeup: house.away_makeup,
      settleIn: house.settle_in === 'splitwise' ? 'splitwise' : 'jonz',
      pocketCapMinor: house.pocket_cap_minor ?? 0,
      nextKind: house.next_kind && house.next_kind_on ? { kind: houseKind(house.next_kind), on: house.next_kind_on } : null,
      pass: passOf(house),
    },
    rules,
    members: (members ?? []).map((m) => ({
      userId: m.user_id,
      name: m.profiles?.display_name ?? 'Housemate',
      photo: m.profiles?.avatar_url ?? null,
      role: m.role as Housemate['role'],
      streak: m.streak,
      immunityTokens: m.immunity_tokens,
      swapTokens: m.swap_tokens,
      prefs: myPrefsOf(m),
      movingOutOn: m.moving_out_on,
      signsIn: m.signs_in ?? true,
      bornYear: m.born_year ?? null,
    })),
    week: week ? { id: week.id, starts_on: week.starts_on, starts_at: week.starts_at, ends_at: week.ends_at } : null,
    assignments: [...(assignments.data ?? []), ...(carried.data ?? [])],
    disputes: disputes.data ?? [],
    onCall: onCall.data ?? [],
    steady: (({ waiting, ahead }) => ({ waiting, ahead }))(weekStateOf(week ?? {})),
    offers: offers.data ?? [],
    moves: { lastMovedOut: movedOut, lastJoined: joined },
  };
}

/** When the Wall last said this kind of thing, or null. */
async function lastEvent(houseId: string, kind: 'moved_out' | 'joined'): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('created_at')
    .eq('house_id', houseId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}
