import { CATEGORY_LABEL, startingKinds, type AssignmentRow } from '@app/core';

import type { HouseSnapshot } from '@/api/board';
import { hoursFromNow as at } from '@/testing/clock';

// A house as `loadHouse` reads it, for tests: Priya (an admin) and Sam, with
// this week dealt around the real clock, so statuses come out the same
// whenever the tests run.


/** The six starting kinds, as a house's John list reads them: their ids are their starting kinds. */
export const KINDS = startingKinds(CATEGORY_LABEL);

/** A dealt John's kind as house_today says it: its name and lid colour. */
const kind = (id: string, name: string) => ({ kind_name: name, kind_colour: KINDS.find((k) => k.id === id)!.colour });

export function assignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'a1',
    user_id: 'priya',
    name: 'Bins out',
    ...kind('bins', 'Bins'),
    points: 2,
    needs_photo: false,
    due_at: at(48),
    original_due_at: null,
    group_name: null,
    done_at: null,
    photo_path: null,
    outcome: null,
    excused: false,
    covered_by: null,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<HouseSnapshot> = {}): HouseSnapshot {
  return {
    house: { id: 'h1', name: 'Flat 3', joinCode: 'AB3DEF7H', everDealt: true, kind: 'housemates', awayMakeup: 100, settleIn: 'jonz', pass: { plan: 'founding', until: null, buyerId: null } },
    rules: {
      timezone: 'Europe/London',
      currency: 'GBP',
      weekStarts: 1,
      stakeMinor: 2000,
      lateForfeitMinor: 100,
      missedForfeitMinor: 300,
      disputeHours: 24,
      coverGraceHours: 3,
      lateHours: 24,
      dealMode: 'smart',
      dealBudget: 4,
    },
    members: [
      { userId: 'priya', name: 'Priya', photo: null, role: 'admin', streak: 3, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } },
      { userId: 'sam', name: 'Sam', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } },
    ],
    week: { id: 'w1', starts_on: '2026-10-19', starts_at: at(-48), ends_at: at(120) },
    assignments: [
      assignment(),
      assignment({ id: 'a2', name: 'Hoover the stairs', ...kind('floors', 'Floors'), due_at: at(72) }),
      assignment({ id: 'a3', name: 'Wipe the hob', ...kind('kitchen', 'Kitchen'), due_at: at(-30), done_at: at(-40), outcome: 'done' }),
      assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', ...kind('bathroom', 'Bathroom') }),
    ],
    disputes: [],
    onCall: [],
    steady: { waiting: {}, ahead: [] },
    offers: [],
    ...overrides,
  };
}
