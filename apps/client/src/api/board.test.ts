import { loadHouse } from './board';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const NOW = new Date('2026-10-21T12:00:00Z');

const HOUSE = {
  id: 'h1',
  name: 'Flat 3',
  joinCode: 'AB3DEF7H',
  firstDealtAt: '2026-10-01T09:00:00Z',
  awayMakeup: 100,
  passPlan: 'trial',
  passEndsAt: '2026-11-01T09:00:00Z',
  passBoughtBy: null,
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
  settleIn: 'jonz',
  kind: 'housemates',
  pocketCapMinor: 0,
  nextKind: null,
  nextKindOn: null,
};

const WEEK = { id: 'w1', startsOn: '2026-10-19', startsAt: '2026-10-18T23:00:00Z', endsAt: '2026-10-25T23:00:00Z', waiting: null, ahead: null };

const TODAY = {
  house: HOUSE,
  members: [
    { userId: 'u1', role: 'admin', streak: 3, immunityTokens: 1, swapTokens: 0, suitsDays: [6, 3], bestTime: 'morning', rather: { j1: 1 }, movingOutOn: null, signsIn: true, bornYear: null, name: 'Priya', photo: 'https://lh3.googleusercontent.com/a/priya=s96-c' },
    { userId: 'u2', role: 'member', streak: 0, immunityTokens: 0, swapTokens: 1, suitsDays: null, bestTime: null, rather: null, movingOutOn: null, signsIn: true, bornYear: null, name: null, photo: null },
  ],
  week: WEEK,
  assignments: [
    { id: 'a1', userId: 'u1', name: 'Bins', dueAt: '2026-10-25T20:00:00Z', outcome: null, dealt: { to: 'u1', by: 'turn' }, everyWeeks: 2, everyMonths: null, crew: [{ userId: 'u2', helper: true, points: 1 }] },
    { id: 'a0', userId: 'u2', name: 'Hob', dueAt: '2026-10-17T20:00:00Z', outcome: null, dealt: null, everyWeeks: null, everyMonths: null, crew: [] },
  ],
  disputes: [{ id: 'd1', assignmentId: 'a1', raisedBy: 'u2', reason: 'Not done', closesAt: '2026-10-22T12:00:00Z', photoPath: null, votes: [{ userId: 'u2', uphold: true }] }],
  onCall: [{ johnId: 'j9', userId: 'u2', john: { name: 'Bins', category: 'bins', needsPhoto: false, archivedAt: null } }],
  offers: [{ id: 'o1', mine: 'a1', theirs: 'a0', askedBy: 'u1', askedUserId: 'u2', expiresAt: '2026-10-22T12:00:00Z' }],
  moves: { lastMovedOut: null, lastJoined: '2026-10-01T09:00:00Z' },
};

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(TODAY);
});

it('reads the house, its people and this week in one go on /v1', async () => {
  const snapshot = await loadHouse('h1', NOW);
  expect(call).toHaveBeenCalledWith('house_today', { houseId: 'h1' });
  expect(snapshot.house).toEqual({
    id: 'h1',
    name: 'Flat 3',
    joinCode: 'AB3DEF7H',
    everDealt: true,
    kind: 'housemates',
    awayMakeup: 100,
    settleIn: 'jonz',
    pocketCapMinor: 0,
    nextKind: null,
    pass: { plan: 'trial', until: new Date('2026-11-01T09:00:00Z'), buyerId: null },
  });
  expect(snapshot.rules).toMatchObject({ timezone: 'Europe/London', currency: 'GBP', weekStarts: 1, disputeHours: 24, stakeMinor: 2000 });
  expect(snapshot.members).toEqual([
    {
      userId: 'u1',
      name: 'Priya',
      photo: 'https://lh3.googleusercontent.com/a/priya=s96-c',
      role: 'admin',
      streak: 3,
      immunityTokens: 1,
      swapTokens: 0,
      prefs: { days: [3, 6], bestTime: 'morning', rather: { j1: 1 } },
      movingOutOn: null,
      signsIn: true,
      bornYear: null,
    },
    { userId: 'u2', name: 'Someone', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 1, prefs: { days: [], bestTime: null, rather: {} }, movingOutOn: null, signsIn: true, bornYear: null },
  ]);
  expect(snapshot.week).toEqual({ id: 'w1', starts_on: '2026-10-19', starts_at: '2026-10-18T23:00:00Z', ends_at: '2026-10-25T23:00:00Z' });
  expect(snapshot.disputes).toEqual([
    { id: 'd1', assignment_id: 'a1', raised_by: 'u2', reason: 'Not done', closes_at: '2026-10-22T12:00:00Z', photo_path: null, dispute_votes: [{ user_id: 'u2', uphold: true }] },
  ]);
  expect(snapshot.onCall).toEqual([{ john_id: 'j9', user_id: 'u2', johns: { name: 'Bins', category: 'bins', needs_photo: false, archived_at: null } }]);
  expect(snapshot.offers).toEqual([{ id: 'o1', mine: 'a1', theirs: 'a0', asked_by: 'u1', asked_user_id: 'u2', expires_at: '2026-10-22T12:00:00Z' }]);
  expect(snapshot.moves).toEqual({ lastMovedOut: null, lastJoined: '2026-10-01T09:00:00Z' });
});

it('reads the Johns as rows, with how often each comes round and who did it, their deal kept as it was', async () => {
  const { assignments } = await loadHouse('h1', NOW);
  expect(assignments).toEqual([
    {
      id: 'a1',
      user_id: 'u1',
      name: 'Bins',
      due_at: '2026-10-25T20:00:00Z',
      outcome: null,
      dealt: { to: 'u1', by: 'turn' },
      johns: { every_weeks: 2, every_months: null },
      crew: [{ user_id: 'u2', helper: true, points: 1 }],
    },
    // A John from last week still open, whose John has since gone.
    { id: 'a0', user_id: 'u2', name: 'Hob', due_at: '2026-10-17T20:00:00Z', outcome: null, dealt: null, johns: null, crew: [] },
  ]);
});

it('reads what the deal kept on the week: the Johns waiting their turn and the weeks ahead', async () => {
  call.mockResolvedValue({ ...TODAY, week: { ...WEEK, waiting: { j2: 1 }, ahead: [{ startsOn: '2026-10-26', johns: { j2: ['u1'] } }] } });
  expect((await loadHouse('h1', NOW)).steady).toEqual({ waiting: { j2: 1 }, ahead: [{ startsOn: '2026-10-26', johns: { j2: ['u1'] } }] });
  call.mockResolvedValue({ ...TODAY, week: null, assignments: [] });
  expect(await loadHouse('h1', NOW)).toMatchObject({ week: null, assignments: [], steady: { waiting: {}, ahead: [] } });
});

it('passes on a refusal', async () => {
  call.mockRejectedValue(new Error('offline'));
  await expect(loadHouse('h1', NOW)).rejects.toThrow('offline');
});
