import {
  houseKind,
  myPrefsOf,
  passOf,
  weekStateOf,
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

import { snakeKeys } from './base';
import { callV1 } from './v1';

// Everything a house screen shows, in one read on /v1 (house_today), as
// rows. Screens build the week from them with core's
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

/** A crew as core reads it. */
const crewRows = (crew: readonly { userId: string; helper: boolean; points: number }[]) => crew.map((c) => ({ user_id: c.userId, helper: c.helper, points: c.points }));

/** One read of a house on /v1: its rules and people, and this week's Johns and disputes. */
export async function loadHouse(houseId: string, _now: Date): Promise<HouseSnapshot> {
  const today = await callV1('house_today', { houseId });
  // core reads the house as its row, by its columns' own names; stored JSON keeps its own.
  const house = snakeKeys(today.house) as Parameters<typeof rulesOf>[0] & Parameters<typeof passOf>[0];
  const { week } = today;
  return {
    house: {
      id: today.house.id,
      name: today.house.name,
      joinCode: today.house.joinCode,
      everDealt: today.house.firstDealtAt !== null,
      kind: houseKind(today.house.kind),
      awayMakeup: today.house.awayMakeup,
      settleIn: today.house.settleIn === 'splitwise' ? 'splitwise' : 'jonz',
      pocketCapMinor: today.house.pocketCapMinor ?? 0,
      nextKind: today.house.nextKind && today.house.nextKindOn ? { kind: houseKind(today.house.nextKind), on: today.house.nextKindOn } : null,
      pass: passOf(house),
    },
    rules: rulesOf(house),
    members: today.members.map((m) => ({
      userId: m.userId,
      name: m.name ?? 'Someone',
      photo: m.photo,
      role: m.role as Housemate['role'],
      streak: m.streak,
      immunityTokens: m.immunityTokens,
      swapTokens: m.swapTokens,
      prefs: myPrefsOf({ suits_days: m.suitsDays, best_time: m.bestTime, rather: m.rather }),
      movingOutOn: m.movingOutOn,
      signsIn: m.signsIn ?? true,
      bornYear: m.bornYear ?? null,
    })),
    week: week ? { id: week.id, starts_on: week.startsOn, starts_at: week.startsAt, ends_at: week.endsAt } : null,
    assignments: today.assignments.map(({ everyWeeks, everyMonths, crew, ...a }) => ({
      ...(snakeKeys(a) as AssignmentRow),
      // With how often each comes round, from the John it was dealt from (the John sheet says so).
      johns: everyWeeks === null ? null : { every_weeks: everyWeeks, every_months: everyMonths },
      crew: crewRows(crew),
    })),
    disputes: today.disputes.map((d) => ({
      id: d.id,
      assignment_id: d.assignmentId,
      raised_by: d.raisedBy,
      reason: d.reason,
      closes_at: d.closesAt,
      photo_path: d.photoPath,
      dispute_votes: d.votes.map((v) => ({ user_id: v.userId, uphold: v.uphold })),
    })),
    onCall: today.onCall.map((o) => ({
      john_id: o.johnId,
      user_id: o.userId,
      johns: o.john && { name: o.john.name, category: o.john.category, kind_name: o.john.kindName, kind_colour: o.john.kindColour, needs_photo: o.john.needsPhoto, archived_at: o.john.archivedAt },
    })),
    steady: (({ waiting, ahead }) => ({ waiting, ahead }))(weekStateOf(week ?? {})),
    offers: today.offers.map((o) => ({ id: o.id, mine: o.mine, theirs: o.theirs, asked_by: o.askedBy, asked_user_id: o.askedUserId, expires_at: o.expiresAt })),
    moves: today.moves,
  };
}
