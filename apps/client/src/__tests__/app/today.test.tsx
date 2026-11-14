import { BIN_NIGHT, buildStake, type DisputeRow, dueInLine, localDate, monthOf, planLabel, wordsFor, zoneGap } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { getCalendars } from 'expo-localization';
import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Text, useWindowDimensions } from 'react-native';

import { loadAway } from '@/api/away';
import type { HouseSnapshot, Housemate } from '@/api/board';
import { loadHouse } from '@/api/board';
import { castVote } from '@/api/disputes';
import { raiseFlag } from '@/api/flags';
import { catchUp } from '@/api/house';
import { answerSwap, askSwap, markDone, planJohn, undoDone } from '@/api/johns';
import { pickPhoto } from '@/api/photos';
import { dealThisWeek, loadJohnList } from '@/api/settings';
import { loadPocket } from '@/api/pocket';
import { loadStake } from '@/api/stake';
import Today from '@/app/(house)/today';
import { JohnSheetProvider } from '@/components/john-sheet';
import { ToastProvider } from '@/components/toast';
import { assignment, snapshot, KINDS } from '@/testing/house';
import { BINS } from '@/testing/pages';
import { testQueryClient } from '@/testing/query';
import { hoursFromNow as at, NOW } from '@/testing/clock';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/away', () => ({ loadAway: jest.fn(), setAway: jest.fn(), cancelAway: jest.fn() }));
jest.mock('@/api/settings', () => ({ dealThisWeek: jest.fn(), loadJohnList: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/pocket', () => ({ loadPocket: jest.fn(), payPocketMoney: jest.fn() }));
jest.mock('@/api/disputes', () => ({ castVote: jest.fn(), raiseDispute: jest.fn() }));
jest.mock('@/api/flags', () => ({ raiseFlag: jest.fn() }));
jest.mock('@/api/johns', () => ({
  markDone: jest.fn(),
  undoDone: jest.fn(),
  spendImmunity: jest.fn(),
  spendSwap: jest.fn(),
  planJohn: jest.fn(),
  askSwap: jest.fn(),
  answerSwap: jest.fn(),
}));
jest.mock('@/api/photos', () => ({ pickPhoto: jest.fn(), uploadProof: jest.fn() }));
jest.mock('@/api/wall', () => ({ loadWall: jest.fn(), setReaction: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: { auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) } } }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const read = loadHouse as jest.Mock;
const HOUR = 3_600_000;

const MEGAN: Housemate = { userId: 'megan', name: 'Megan', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } };

/** Priya, with what she holds changed. */
function priyaWith(tokens: Partial<Housemate>): Housemate[] {
  const [priya, ...rest] = snapshot().members;
  return [{ ...priya, ...tokens }, ...rest];
}

/** Somewhere for Today's links to land. */
const Landed = ({ name }: { name: string }) => <Text>{`Landed on ${name}`}</Text>;

async function show() {
  const client = testQueryClient();
  await renderRouter(
    {
      // As the house layout has it: the toasts and the one John sheet around every tab.
      _layout: () => (
        <QueryClientProvider client={client}>
          <ToastProvider>
            <JohnSheetProvider houseId="h1" userId="priya">
              <Slot />
            </JohnSheetProvider>
          </ToastProvider>
        </QueryClientProvider>
      ),
      today: Today,
      'house/index': () => <Landed name="House" />,
      'house/away': () => <Landed name="Away" />,
      'you/index': () => <Landed name="You" />,
      'you/moving': () => <Landed name="Moving" />,
      'house/johns': () => <Landed name="Johns" />,
    },
    { initialUrl: '/today' },
  );
}

// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 412, height: 915, scale: 1, fontScale: 1 })),
}));

async function open() {
  await show();
  // Next up's card, or what takes its place: the house has been read.
  return screen.findByTestId('next-up');
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [] });
  read.mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (markDone as jest.Mock).mockResolvedValue(undefined);
  (undoDone as jest.Mock).mockResolvedValue(undefined);
  (pickPhoto as jest.Mock).mockResolvedValue(null);
  (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [BINS], groups: [] });
  (loadStake as jest.Mock).mockResolvedValue(
    buildStake({
      ledger: [{ id: 1, user_id: 'sam', kind: 'forfeit', amount_minor: -300, month: '2026-10', counterparty_user_id: null, created_at: '2026-10-10T12:00:00Z' }],
      closedMonths: [],
      memberIds: ['priya', 'sam'],
      stakeMinor: 2000,
      month: '2026-10',
    }),
  );
});

it("reads the house under Focus's title bar, and leaves signing out to House", async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('common.title.today') })).toBeOnTheScreen();
  // The day it is in the house, first on the page rather than in the bar.
  const day = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/;
  expect(bar.queryByText(day)).toBeNull();
  expect(within(screen.getByTestId('top-line')).getByText(day)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledWith('h1', expect.any(Date));
  expect(screen.queryByTestId('sign-out')).toBeNull();
});

describe('Next up', () => {
  it('posts your next John on a plate, with what it is, when it is due and what late costs', async () => {
    const card = await open();
    // The plate says it's next: "Next up" is heard, not shown.
    expect(within(card).queryByText(words('today.nextUp.label'))).toBeNull();
    expect(within(card).getByRole('button', { name: `${words('today.nextUp.label')}: Bins out` })).toBeOnTheScreen();
    expect(within(card).getByText('Bins out')).toBeOnTheScreen();
    expect(within(card).getByTestId('plate-border')).toBeOnTheScreen();
    expect(screen.getByTestId('next-up-meta')).toHaveTextContent(/^Bins, due .+, £1 if late$/);
    expect(within(card).getByRole('button', { name: words('john.row.markDone') })).toBeOnTheScreen();
    expect(within(card).getByRole('button', { name: words('today.nextUp.photo') })).toBeOnTheScreen();
    // Not overdue, and no skip to use: no hazard, no way to skip.
    expect(screen.queryByTestId('overdue-edge')).toBeNull();
    expect(screen.queryByTestId('skip-or-swap')).toBeNull();
    // Someone else's John is never yours to do.
    expect(screen.queryByText('Clean the bath')).toBeNull();
  });

  it('plans it in one tap, before it is due', async () => {
    (planJohn as jest.Mock).mockResolvedValue(undefined);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('week.steady.plan') }));
    const [id, when] = (planJohn as jest.Mock).mock.calls[0];
    expect(id).toBe('a1');
    expect((when as Date).getTime()).toBeGreaterThan(NOW.getTime());
    expect((when as Date).getTime()).toBeLessThan(Date.parse(snapshot().assignments[0].due_at));
  });

  it('says when it is planned for, with a reminder set', async () => {
    const plannedAt = at(20);
    read.mockResolvedValue(snapshot({ assignments: [assignment({ planned_at: plannedAt }), ...snapshot().assignments.slice(1)] }));
    await open();
    expect(screen.getByTestId('plan-it-when')).toHaveTextContent(
      words('week.steady.planned', { when: planLabel(new Date(plannedAt), new Date(NOW), 'Europe/London', words) }),
    );
    expect(screen.queryByRole('button', { name: words('week.steady.plan') })).toBeNull();
  });

  it('ticks it, reads the house again, and moves on to the next', async () => {
    await open();
    read.mockResolvedValue(snapshot({ assignments: [assignment({ done_at: at(0) }), ...snapshot().assignments.slice(1)] }));
    await fireEvent.press(screen.getByTestId('mark-done'));
    expect(markDone).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(within(screen.getByTestId('next-up')).getByText('Hoover the stairs')).toBeOnTheScreen());
    // The tick waits for the house in the rest of the week, with Undo.
    const rows = within(screen.getByTestId('rest-of-week')).getAllByTestId('my-john');
    expect(rows[0]).toHaveTextContent(/Bins out/);
    expect(rows[0]).toHaveTextContent(/Bins, stands in 2\dh/);
  });

  it('ticks with a photo from the camera', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('done-with-photo'));
    expect(pickPhoto).toHaveBeenCalledWith('camera');
    // No photo taken: nothing ticked.
    expect(markDone).not.toHaveBeenCalled();
  });

  it('leads a photo John with the camera, and offers the library beside it', async () => {
    read.mockResolvedValue(snapshot({ assignments: [assignment({ needs_photo: true })] }));
    await open();
    expect(screen.getByTestId('mark-done')).toHaveTextContent(words('today.nextUp.takePhoto'));
    await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.library') }));
    expect(pickPhoto).toHaveBeenCalledWith('library');
    await fireEvent.press(screen.getByTestId('mark-done'));
    expect(pickPhoto).toHaveBeenLastCalledWith('camera');
  });

  it('without the House Pass, ticks a photo John plainly and offers no photo', async () => {
    const ended = { plan: 'trial' as const, until: new Date(0), buyerId: null };
    const base = snapshot({ assignments: [assignment({ needs_photo: true })] });
    read.mockResolvedValue({ ...base, house: { ...base.house, pass: ended } });
    await open();
    expect(screen.getByTestId('mark-done')).toHaveTextContent(words('john.row.markDone'));
    expect(screen.queryByTestId('done-with-photo')).toBeNull();
    expect(screen.queryByTestId('choose-photo')).toBeNull();
    await fireEvent.press(screen.getByTestId('mark-done'));
    expect(markDone).toHaveBeenCalledWith('a1');
    expect(pickPhoto).not.toHaveBeenCalled();
  });

  it('says a refusal on the card', async () => {
    (markDone as jest.Mock).mockRejectedValue(new Error('That week has closed.'));
    const card = await open();
    await fireEvent.press(screen.getByTestId('mark-done'));
    expect(await within(card).findByRole('alert')).toHaveTextContent('That week has closed.');
  });

  it("draws the plate's border in hazard when overdue, keeps its kind, and says what it costs now", async () => {
    read.mockResolvedValue(snapshot({ assignments: [assignment({ due_at: at(-3) })] }));
    await open();
    expect(screen.getByTestId('overdue-edge')).toBeOnTheScreen();
    expect(screen.queryByTestId('plate-border')).toBeNull();
    expect(screen.getByTestId('next-up-meta')).toHaveTextContent(/^Bins$/);
    expect(screen.getByTestId('next-up-overdue')).toHaveTextContent(/^Overdue since .+, £1 now, £3 if missed$/);
  });

  it('says no more than lateness can still cost you this month', async () => {
    // Priya has forfeited £19.50 of her £20 stake: being late costs her 50p more at most.
    const thisMonth = () => monthOf(new Date(NOW.getTime() + HOUR), 'Europe/London');
    (loadStake as jest.Mock).mockResolvedValue(
      buildStake({
        ledger: [{ id: 1, user_id: 'priya', kind: 'forfeit', amount_minor: -1950, month: thisMonth(), counterparty_user_id: null, created_at: at(-1) }],
        closedMonths: [],
        memberIds: ['priya', 'sam'],
        stakeMinor: 2000,
        month: thisMonth(),
      }),
    );
    read.mockResolvedValue(snapshot({ assignments: [assignment({ due_at: at(1) })] }));
    await open();
    await waitFor(() => expect(screen.getByTestId('next-up-meta')).toHaveTextContent(/, £0\.50 if late$/));
  });

  it('opens the John sheet from its name', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('next-up-name'));
    expect(await screen.findByTestId('john-sheet-body')).toBeOnTheScreen();
    expect(screen.getByTestId('john-sheet-name')).toHaveTextContent('Bins out');
  });

  it.each([
    [{ immunityTokens: 1 }, words('today.nextUp.cant', { skip: true, swap: false }), 'skip-confirm'],
    [{ swapTokens: 1 }, words('today.nextUp.cant', { skip: false, swap: true }), 'swap-picker'],
    [{ immunityTokens: 2, swapTokens: 1 }, words('today.nextUp.cant', { skip: true, swap: true }), 'if-you-cant'],
  ])('offers to skip or swap while you hold %o, and opens the sheet on it', async (tokens, words, part) => {
    read.mockResolvedValue(snapshot({ members: priyaWith(tokens) }));
    await open();
    const way = screen.getByTestId('skip-or-swap');
    expect(way).toHaveTextContent(words);
    await fireEvent.press(way);
    expect(await within(await screen.findByTestId('john-sheet-body')).findByTestId(part)).toBeOnTheScreen();
  });

  it("offers no swap with nobody's John to swap for", async () => {
    read.mockResolvedValue(snapshot({ members: priyaWith({ swapTokens: 1 }), assignments: snapshot().assignments.slice(0, 3) }));
    await open();
    expect(screen.queryByTestId('skip-or-swap')).toBeNull();
  });
});

describe("on a phone away from the house's clock", () => {
  // Priya's phone is in Regina, 6 hours behind the house in London this November.
  const phoneIn = (timeZone: string) =>
    jest.mocked(getCalendars).mockReturnValue([{ calendar: 'gregory', timeZone, uses24hourClock: true, firstWeekday: 2 }] as ReturnType<typeof getCalendars>);
  const due = new Date(at(48));
  beforeEach(() => phoneIn('America/Regina'));
  afterEach(() => phoneIn('Europe/London'));

  it('says times on your own clock, says so once under the date, and shows house time on a tap', async () => {
    await open();
    const line = screen.getByTestId('zone-line');
    expect(line).toHaveTextContent(`${words('common.zone.yours', { city: 'Regina', gap: zoneGap({ zone: 'Europe/London', from: 'America/Regina' }, NOW, words) })} ${words('common.zone.showHouse')}`);
    expect(screen.getByTestId('next-up-meta')).toHaveTextContent(dueInLine(due, NOW, 'America/Regina', words), { exact: false });
    await fireEvent.press(line);
    expect(screen.getByTestId('zone-line')).toHaveTextContent(words('common.zone.houses', { city: 'London', gap: '6 hours behind' }), { exact: false });
    expect(screen.getByTestId('next-up-meta')).toHaveTextContent(dueInLine(due, NOW, 'Europe/London', words), { exact: false });
    // Back to your own clock, as this phone remembers the choice.
    await fireEvent.press(screen.getByTestId('zone-line'));
    expect(screen.getByTestId('zone-line')).toHaveTextContent(words('common.zone.showHouse'), { exact: false });
  });

  it("says nothing about clocks when the phone's says the house's time", async () => {
    phoneIn('Europe/Dublin');
    await open();
    expect(screen.queryByTestId('zone-line')).toBeNull();
    expect(screen.getByTestId('next-up-meta')).toHaveTextContent(dueInLine(due, NOW, 'Europe/London', words), { exact: false });
  });
});

describe('what takes Next up’s place', () => {
  it('says you are clear until the week turns over, with no amber', async () => {
    const done = { done_at: at(-40), outcome: 'done' as const };
    read.mockResolvedValue(
      snapshot({ assignments: snapshot().assignments.map((a) => (a.user_id === 'priya' ? { ...a, ...done } : a)) }),
    );
    const card = await open();
    expect(within(card).getByText(/^You’re clear until (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)).toBeOnTheScreen();
    expect(within(card).getByText(words('today.nextUp.clearBody'))).toBeOnTheScreen();
    expect(screen.queryByTestId('mark-done')).toBeNull();
    // The finished ones are folded away.
    expect(screen.getByTestId('done-fold')).toHaveTextContent(words('common.shell.done', { count: 3 }));
  });

  it('says so when nothing on the list is yours this week', async () => {
    read.mockResolvedValue(snapshot({ assignments: [assignment({ user_id: 'sam' })] }));
    const card = await open();
    expect(within(card).getByText(words('today.nextUp.nothingYours'))).toBeOnTheScreen();
    expect(screen.queryByTestId('rest-of-week')).toBeNull();
  });

  describe('time away', () => {
    const trip = (startsOn: string, endsOn: string) => ({ id: 'p1', userId: 'priya', startsOn, endsOn, note: null });

    it('says until when, how your share catches up, and where to change the dates', async () => {
      (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [trip('2026-10-20', '2026-10-28')] });
      await show();
      const card = await screen.findByText(/^You’re away until Wed 28 Oct$/);
      expect(card).toBeOnTheScreen();
      expect(screen.getByText(words('today.nextUp.awayBody', { share: 'full' }))).toBeOnTheScreen();
      expect(screen.queryByTestId('mark-done')).toBeNull();
      await fireEvent.press(screen.getByRole('link', { name: words('today.nextUp.changeDates') }));
      expect(screen).toHavePathname('/house/away');
    });

    it('runs back-to-back trips together', async () => {
      (loadAway as jest.Mock).mockResolvedValue({
        today: '2026-10-21',
        periods: [trip('2026-10-20', '2026-10-23'), { ...trip('2026-10-24', '2026-10-30'), id: 'p2' }],
      });
      await show();
      expect(await screen.findByText(/^You’re away until Fri 30 Oct$/)).toBeOnTheScreen();
    });

    it("stays on your John for a trip still to come, and says when under the week, on to the dates", async () => {
      (loadAway as jest.Mock).mockResolvedValue({
        today: '2026-10-21',
        periods: [trip('2026-10-23', '2026-10-28'), { ...trip('2026-10-20', '2026-10-23'), id: 'p2', userId: 'sam' }],
      });
      await open();
      const line = await screen.findByTestId('away-line');
      expect(line).toHaveTextContent('You’re away 23–28 Oct');
      expect(screen.getByTestId('mark-done')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('link', { name: `You’re away 23–28 Oct. ${words('today.nextUp.changeDates')}` }));
      expect(screen).toHavePathname('/house/away');
    });

    it("says nothing of someone else's trip, or one more than a fortnight off", async () => {
      (loadAway as jest.Mock).mockResolvedValue({
        today: '2026-10-21',
        periods: [{ ...trip('2026-10-20', '2026-10-23'), userId: 'sam' }, trip('2026-11-06', '2026-11-08')],
      });
      await open();
      await waitFor(() => expect(loadAway).toHaveBeenCalled());
      expect(await screen.findByTestId('standing-line')).toBeOnTheScreen();
      expect(screen.queryByTestId('away-line')).toBeNull();
      expect(screen.queryByText(/^You’re away/)).toBeNull();
    });
  });

  describe('before the first deal', () => {
    const first = () => snapshot({ week: null, assignments: [], house: { ...snapshot().house, everDealt: false } });

    it('gives an admin the steps, and deals week 1 in amber once the first two are done', async () => {
      (dealThisWeek as jest.Mock).mockResolvedValue(undefined);
      read.mockResolvedValue(first());
      const card = await open();
      expect(within(card).getByText('Set up Flat 3')).toBeOnTheScreen();
      expect(await within(card).findByText(words('today.nextUp.onTheList', { count: 1 }))).toBeOnTheScreen();
      expect(within(card).getByText(words('today.nextUp.soFar', { count: 2 }))).toBeOnTheScreen();
      const deal = within(card).getByRole('button', { name: words('today.nextUp.dealWeek1') });
      expect(deal).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
      await fireEvent.press(deal);
      expect(dealThisWeek).toHaveBeenCalledWith('h1');
    });

    it('offers the deal in outline until there are Johns and a housemate, and says what the server says', async () => {
      (dealThisWeek as jest.Mock).mockRejectedValue(new Error('Add some Johns to the list first.'));
      (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [], groups: [] });
      read.mockResolvedValue({ ...first(), members: first().members.slice(0, 1) });
      const card = await open();
      expect(await within(card).findByText(words('today.nextUp.onTheList', { count: 0 }))).toBeOnTheScreen();
      const deal = within(card).getByRole('button', { name: words('today.nextUp.dealWeek1') });
      expect(deal).toHaveStyle({ backgroundColor: 'transparent' });
      await fireEvent.press(deal);
      expect(dealThisWeek).toHaveBeenCalledWith('h1');
      expect(await within(card).findByRole('alert')).toHaveTextContent('Add some Johns to the list first.');
    });

    it('opens the John list, and the invite in a sheet', async () => {
      read.mockResolvedValue({ ...first(), members: first().members.slice(0, 1) });
      await open();
      expect(screen.getByText(words('today.nextUp.soFar', { count: 1 }))).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: new RegExp(words('today.nextUp.invite')) }));
      // House's invite sheet: the code to read out, the link, and the sheet's one amber button.
      const sheet = within(await screen.findByTestId('invite-sheet'));
      expect(sheet.getByRole('header', { name: words('house.page.invite') })).toBeOnTheScreen();
      expect(sheet.getByTestId('invite-code')).toHaveTextContent('AB3DEF7H');
      expect(sheet.getByTestId('invite-url')).toHaveTextContent('https://jonz.app/join/AB3DEF7H');
      expect(sheet.getByRole('button', { name: words('house.page.shareInvite') })).toHaveStyle({
        backgroundColor: BIN_NIGHT.light.hivis,
      });
      await fireEvent.press(sheet.getByTestId('sheet-close'));
      await fireEvent.press(screen.getByRole('link', { name: new RegExp(words('today.nextUp.addJohns')) }));
      expect(screen).toHavePathname('/house/johns');
    });

    it("tells everyone else who will deal it", async () => {
      const house = first();
      read.mockResolvedValue({
        ...house,
        members: [
          { ...house.members[0], role: 'member' },
          { ...house.members[1], role: 'admin' },
        ],
      });
      const card = await open();
      expect(within(card).getByText(words('today.nextUp.waiting', { admin: 'Sam' }))).toBeOnTheScreen();
      expect(screen.queryByTestId('setup-steps')).toBeNull();
    });
  });

  it("says when a dealt house has nothing handed out this week", async () => {
    read.mockResolvedValue(snapshot({ week: null, assignments: [] }));
    const card = await open();
    expect(within(card).getByText(words('today.notDealt.nothingThisWeek'))).toBeOnTheScreen();
    expect(screen.queryByTestId('standing-line')).toBeNull();
  });
});

describe('swapping a John you’d rather not', () => {
  const prefs = (rather: Record<string, 1 | -1>) => ({ days: [], bestTime: null, rather });
  // Priya would rather not put the bins out; Sam would rather.
  const house = (offers: HouseSnapshot['offers'] = []) => {
    const base = snapshot();
    return snapshot({
      members: base.members.map((m) => ({ ...m, prefs: prefs(m.userId === 'priya' ? { bins: -1 } : { bins: 1 }) })),
      assignments: base.assignments.map((a) => (a.id === 'a1' ? { ...a, john_id: 'bins' } : a)),
      offers,
    });
  };

  it('says who would rather do it, and asks them', async () => {
    (askSwap as jest.Mock).mockResolvedValue('o1');
    read.mockResolvedValue(house());
    await open();
    const offer = within(screen.getByTestId('swap-suggestion'));
    expect(offer.getByText(words('week.steady.ratherDoIt', { name: 'Sam' }))).toBeOnTheScreen();
    expect(offer.getByText(words('week.steady.swapFor', { name: 'Sam', john: 'Clean the bath', points: '2 pts' }))).toBeOnTheScreen();
    expect(offer.getByText(words('week.steady.askNote', { name: 'Sam', john: 'Bins out' }))).toBeOnTheScreen();
    await fireEvent.press(offer.getByRole('button', { name: words('week.steady.ask', { name: 'Sam' }) }));
    expect(askSwap).toHaveBeenCalledWith('a1', 'a4');
  });

  it('says once it has asked', async () => {
    read.mockResolvedValue(house([{ id: 'o1', mine: 'a1', theirs: 'a4', asked_by: 'priya', asked_user_id: 'sam', expires_at: at(6) }]));
    await open();
    expect(screen.getByTestId('swap-asked')).toHaveTextContent(words('week.steady.asked', { name: 'Sam' }));
    expect(screen.queryByTestId('swap-suggestion')).toBeNull();
  });

  it('shows an ask made to you, with Swap and No thanks', async () => {
    (answerSwap as jest.Mock).mockResolvedValue(undefined);
    const base = snapshot();
    read.mockResolvedValue(
      snapshot({
        assignments: base.assignments,
        offers: [{ id: 'o2', mine: 'a4', theirs: 'a2', asked_by: 'sam', asked_user_id: 'priya', expires_at: at(6) }],
      }),
    );
    await open();
    const card = within(screen.getByTestId('swap-offer'));
    expect(card.getByText(words('week.steady.offerTitle', { name: 'Sam' }))).toBeOnTheScreen();
    expect(card.getByText(words('week.steady.offerBody', { theirs: 'Clean the bath', yours: 'Hoover the stairs', points: '2 pts' }))).toBeOnTheScreen();
    await fireEvent.press(card.getByRole('button', { name: words('week.steady.accept') }));
    expect(answerSwap).toHaveBeenCalledWith('o2', true);
    await fireEvent.press(card.getByRole('button', { name: words('week.steady.decline') }));
    expect(answerSwap).toHaveBeenLastCalledWith('o2', false);
  });
});

describe('Needs you', () => {
  const disputed = () => {
    const dispute: DisputeRow = {
      id: 'd1',
      assignment_id: 'a4',
      raised_by: 'megan',
      reason: 'Ring round the bath',
      closes_at: at(17.5),
      dispute_votes: [{ user_id: 'megan', uphold: true }],
    };
    return snapshot({
      members: [...snapshot().members, MEGAN],
      assignments: [...snapshot().assignments.slice(0, 3), assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', done_at: at(-2) })],
      disputes: [dispute],
    });
  };

  it('is not there when nothing waits for your vote', async () => {
    await open();
    expect(screen.queryByTestId('needs-you')).toBeNull();
  });

  it('lists the disputes waiting for your vote, saying whose John each is', async () => {
    read.mockResolvedValue(disputed());
    await open();
    const section = screen.getByTestId('needs-you');
    expect(within(section).getByText(`${words('today.nextUp.needsYou')}`)).toBeOnTheScreen();
    const row = within(section).getByTestId('vote-row');
    expect(within(row).getByText('Vote on Sam’s Clean the bath')).toBeOnTheScreen();
    expect(row).toHaveTextContent(/Megan says it’s not done, closes in 1[78]h/);
    expect(within(row).getByTestId('avatar', { includeHiddenElements: true })).toHaveTextContent('SA');
  });

  it('opens the John sheet at the vote, which closes it and says where to change it', async () => {
    (castVote as jest.Mock).mockResolvedValue(undefined);
    read.mockResolvedValue(disputed());
    await open();
    await fireEvent.press(within(screen.getByTestId('needs-you')).getByTestId('vote-row'));
    const body = await screen.findByTestId('john-sheet-body');
    expect(within(body).getByText('“Ring round the bath”')).toBeOnTheScreen();
    await fireEvent.press(within(body).getByRole('button', { name: words('john.dispute.notDone') }));
    expect(castVote).toHaveBeenCalledWith('d1', true);
    await waitFor(() => expect(screen.queryByTestId('john-sheet-body')).toBeNull());
    expect(screen.getByText(words('john.sheet.voted'))).toBeOnTheScreen();
  });

  it("lists a housemate's John past due and the grace, to cover, and opens its sheet", async () => {
    read.mockResolvedValue(
      snapshot({
        assignments: [
          ...snapshot().assignments.slice(0, 3),
          assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', due_at: at(-5) }),
          assignment({ id: 'a5', user_id: 'sam', name: 'Hoover', due_at: at(-1) }),
        ],
      }),
    );
    await open();
    expect(screen.queryByTestId('needs-you')).toBeNull();
    const section = screen.getByTestId('could-cover');
    const rows = within(section).getAllByTestId('cover-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Cover Sam’s Clean the bath')).toBeOnTheScreen();
    await fireEvent.press(rows[0]);
    const body = await screen.findByTestId('john-sheet-body');
    expect(within(body).getByRole('button', { name: words('john.sheet.coverIt') })).toBeOnTheScreen();
  });
});

describe('Needs your OK, in a family', () => {
  const family = (kind: 'family' | 'housemates' = 'family') => {
    const base = snapshot();
    return snapshot({
      house: { ...base.house, kind },
      rules: { ...base.rules, disputeHours: kind === 'family' ? 0 : 24 },
      assignments: [
        ...base.assignments.slice(0, 3),
        assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', done_at: at(-2), awaits_ok: kind === 'family' }),
      ],
    });
  };

  it("lists a kid's tick for a parent, in place of the vote", async () => {
    read.mockResolvedValue(family());
    await open();
    const section = screen.getByTestId('needs-your-ok');
    expect(within(section).getByText(words('today.parentOk.needsYourOk'))).toBeOnTheScreen();
    const row = within(section).getByTestId('ok-row');
    expect(within(row).getByText('Sam did Clean the bath')).toBeOnTheScreen();
    expect(row).toHaveTextContent(/Ticked 2h ago/);
    expect(screen.queryByTestId('needs-you')).toBeNull();
    await fireEvent.press(row);
    const body = await screen.findByTestId('john-sheet-body');
    expect(within(body).getByRole('button', { name: words('today.parentOk.ok') })).toBeOnTheScreen();
  });

  it('is not there for housemates', async () => {
    read.mockResolvedValue(family('housemates'));
    await open();
    expect(screen.queryByTestId('needs-your-ok')).toBeNull();
  });
});

describe('pocket money, in a family', () => {
  /** Priya as a kid this time, with Sam the parent; her Johns earn 50p each. */
  const kid = () => {
    const base = snapshot();
    return snapshot({
      house: { ...base.house, kind: 'family', pocketCapMinor: 1000 },
      rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
      members: base.members.map((m) => ({ ...m, role: m.userId === 'sam' ? 'admin' : 'member' })),
      assignments: base.assignments.map((a) => ({ ...a, pay_minor: 50 })),
    });
  };

  it("tells a kid what each John earns, and what they've earned this month", async () => {
    read.mockResolvedValue(kid());
    (loadPocket as jest.Mock).mockResolvedValue({ month: '2026-10', soFar: 450, earned: { priya: 450 }, owed: [], history: [] });
    await open();
    expect(screen.getByTestId('next-up')).toHaveTextContent(/earns 50p/);
    expect(within(screen.getByTestId('rest-of-week')).getAllByText('50p').length).toBeGreaterThan(0);
    expect(await screen.findByTestId('earned-line')).toHaveTextContent('£4.50 earned so far in October');
  });
});

describe('the rest of your week', () => {
  it('lists your other Johns, ticked from their tick box, with the finished ones folded', async () => {
    await open();
    const section = screen.getByTestId('rest-of-week');
    expect(within(section).getByText(words('today.nextUp.rest'))).toBeOnTheScreen();
    // Next up's John isn't listed twice.
    expect(within(section).queryByText('Bins out')).toBeNull();
    expect(within(section).getByText('Hoover the stairs')).toBeOnTheScreen();
    expect(within(section).queryByText('Wipe the hob')).toBeNull();

    await fireEvent.press(within(section).getByRole('checkbox', { name: words('today.nextUp.tick', { john: 'Hoover the stairs' }) }));
    expect(markDone).toHaveBeenCalledWith('a2');

    const fold = screen.getByTestId('done-fold');
    expect(fold).toHaveTextContent(words('common.shell.done', { count: 1 }));
    await fireEvent.press(fold);
    // Done once: the green box, then the points it earned, not a second mark.
    const hob = within(section).getAllByTestId('my-john')[1];
    expect(hob).toHaveTextContent(/^Wipe the hobKitchen, done .+2 pts$/);
    expect(within(hob).getByLabelText(words('today.nextUp.stateLabel.done'))).toBeOnTheScreen();
    expect(within(hob).queryByTestId('status-done')).toBeNull();
  });

  it('shows a skip with its shield, folded with the done, and a disputed John with who raised it', async () => {
    const dispute: DisputeRow = {
      id: 'd1',
      assignment_id: 'a2',
      raised_by: 'sam',
      reason: 'Stairs still dusty',
      closes_at: at(17.5),
      dispute_votes: [{ user_id: 'sam', uphold: true }],
    };
    read.mockResolvedValue(
      snapshot({
        assignments: [
          assignment(),
          assignment({ id: 'a2', name: 'Hoover the stairs', category: 'floors', due_at: at(-5), done_at: at(-6) }),
          assignment({ id: 'a3', name: 'Wipe the hob', category: 'kitchen', due_at: at(-30), excused: true }),
        ],
        disputes: [dispute],
      }),
    );
    await open();
    const section = screen.getByTestId('rest-of-week');
    const stairs = within(section).getByTestId('my-john');
    expect(stairs).toHaveTextContent(/^Hoover the stairsDisputed by Sam, 1[78]h left2 pts$/);
    expect(within(stairs).getByLabelText(words('today.nextUp.stateLabel.disputed'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('done-fold'));
    const hob = within(section).getAllByTestId('my-john')[1];
    expect(hob).toHaveTextContent(/^Wipe the hobKitchen, skipped$/);
    // Never spoken as "Not done".
    expect(within(hob).queryByLabelText(words('today.nextUp.stateLabel.open'))).toBeNull();
  });

  it('says how many of the folded ones were late, as Week does', async () => {
    read.mockResolvedValue(
      snapshot({
        assignments: [
          assignment(),
          assignment({ id: 'a2', name: 'Hoover the stairs', category: 'floors', due_at: at(-30), done_at: at(-20), outcome: 'late' }),
          assignment({ id: 'a3', name: 'Wipe the hob', category: 'kitchen', due_at: at(-30), done_at: at(-40), outcome: 'done' }),
        ],
      }),
    );
    await open();
    const fold = within(screen.getByTestId('done-fold'));
    expect(fold.getByText(`${words('common.shell.done', { count: 2 })},`)).toBeOnTheScreen();
    expect(fold.getByText(words('week.summary.late', { count: 1 }))).toBeOnTheScreen();
  });

  it('offers Undo while the house checks your tick', async () => {
    read.mockResolvedValue(
      snapshot({ assignments: [assignment(), assignment({ id: 'a2', name: 'Hoover the stairs', category: 'floors', due_at: at(72), done_at: at(-1) })] }),
    );
    await open();
    const row = within(screen.getByTestId('rest-of-week')).getByTestId('my-john');
    expect(within(row).getByLabelText(words('today.nextUp.stateLabel.checking'))).toBeOnTheScreen();
    expect(within(row).queryByTestId('status-checking')).toBeNull();
    await fireEvent.press(within(row).getByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) }));
    expect(undoDone).toHaveBeenCalledWith('a2');
  });

  it('marks an overdue John with the hazard edge, and opens the sheet from the row', async () => {
    read.mockResolvedValue(
      snapshot({ assignments: [assignment(), assignment({ id: 'a2', name: 'Hoover the stairs', category: 'floors', due_at: at(-5) })] }),
    );
    await open();
    // The overdue one is next up; Bins out waits in the rest of the week.
    expect(within(screen.getByTestId('next-up')).getByText('Hoover the stairs')).toBeOnTheScreen();
    const row = within(screen.getByTestId('rest-of-week')).getByTestId('my-john');
    await fireEvent.press(within(row).getByText('Bins out'));
    expect(await screen.findByTestId('john-sheet-name')).toHaveTextContent('Bins out');
  });

  it('says a refusal under the row', async () => {
    (markDone as jest.Mock).mockRejectedValue(new Error('That week has closed.'));
    await open();
    const section = screen.getByTestId('rest-of-week');
    await fireEvent.press(within(section).getByRole('checkbox', { name: words('today.nextUp.tick', { john: 'Hoover the stairs' }) }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('That week has closed.');
  });
});

it('says where you stand in one line, on to House', async () => {
  await open();
  // Priya alone has points this week; Sam's forfeit is in the pot.
  const line = await screen.findByTestId('standing-line');
  expect(line).toHaveTextContent(/^1st this week, up £3 in October$/);
  // No trip coming: no line about one.
  expect(screen.queryByTestId('away-line')).toBeNull();
  await fireEvent.press(line);
  expect(screen).toHavePathname('/house');
});

describe('catching up', () => {
  it('catches the house up as it comes into view', async () => {
    await open();
    expect(catchUp).toHaveBeenCalledWith('h1');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads the house again when the server had something to do', async () => {
    (catchUp as jest.Mock).mockResolvedValue(true);
    await open();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it("doesn't mind when catching up fails", async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (catchUp as jest.Mock).mockRejectedValue(new Error('offline'));
    expect(await open()).toBeOnTheScreen();
  });
});

it("says when it can't read the house, and tries again", async () => {
  read.mockRejectedValueOnce(new Error('offline'));
  await show();
  expect(await screen.findByRole('alert')).toHaveTextContent(words('common.shell.unreadable'));
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
  expect(await screen.findByTestId('next-up')).toBeOnTheScreen();
});

describe('On call', () => {
  const BINS_ON_CALL = { john_id: 'j-bins', user_id: 'sam', johns: { name: 'Empty the bins', category: 'bins' } };

  it('lists each on-call John with who has it, and flags it for them', async () => {
    (raiseFlag as jest.Mock).mockResolvedValue('f1');
    read.mockResolvedValue(snapshot({ onCall: [BINS_ON_CALL] }));
    await open();
    const section = within(await screen.findByTestId('on-call'));
    expect(section.getByText('Empty the bins')).toBeOnTheScreen();
    expect(section.getByText(`${words('today.onCall.holder', { name: 'Sam' })}, ${words('today.onCall.times', { n: 0 })}`)).toBeOnTheScreen();
    await fireEvent.press(section.getByTestId('on-call-flag'));
    await waitFor(() => expect(raiseFlag).toHaveBeenCalledWith('j-bins'));
    expect(markDone).not.toHaveBeenCalled();
  });

  it('lets whoever is on call say it is done without waiting to be asked', async () => {
    (raiseFlag as jest.Mock).mockResolvedValue('f1');
    read.mockResolvedValue(snapshot({ onCall: [{ ...BINS_ON_CALL, user_id: 'priya' }] }));
    await open();
    const section = within(await screen.findByTestId('on-call'));
    expect(section.getByText(`${words('today.onCall.youreOnCall')}, ${words('today.onCall.times', { n: 0 })}`)).toBeOnTheScreen();
    await fireEvent.press(section.getByTestId('on-call-done'));
    await waitFor(() => expect(markDone).toHaveBeenCalledWith('f1'));
    expect(raiseFlag).toHaveBeenCalledWith('j-bins');
  });

  it('shows a Done it as done for ten minutes, so another tap can’t count it twice', async () => {
    const doneIt = assignment({
      id: 'f1',
      john_id: 'j-bins',
      week_id: 'w1',
      user_id: 'priya',
      name: 'Empty the bins',
      flagged_at: at(-0.05),
      flagged_by: 'priya',
      done_at: at(-0.05),
      due_at: at(12),
    });
    read.mockResolvedValue(
      snapshot({ onCall: [{ ...BINS_ON_CALL, user_id: 'priya' }], assignments: [...snapshot().assignments, doneIt] }),
    );
    await open();
    const section = within(await screen.findByTestId('on-call'));
    expect(section.getByTestId('on-call-done-it')).toBeOnTheScreen();
    expect(section.getByText(words('today.onCall.done'))).toBeOnTheScreen();
    expect(section.queryByTestId('on-call-done')).toBeNull();
  });

  it('says who an open flag is with, and opens it rather than flagging it again', async () => {
    const flag = assignment({
      id: 'f1',
      john_id: 'j-bins',
      week_id: 'w1',
      user_id: 'sam',
      name: 'Empty the bins',
      flagged_at: at(-1),
      flagged_by: 'priya',
      due_at: at(11),
    });
    read.mockResolvedValue(snapshot({ onCall: [BINS_ON_CALL], assignments: [...snapshot().assignments, flag] }));
    await open();
    const section = within(await screen.findByTestId('on-call'));
    expect(section.getByTestId('on-call-flagged')).toBeOnTheScreen();
    expect(section.getByText(new RegExp(`^${words('today.onCall.flagged', { name: 'Sam' })}, due `))).toBeOnTheScreen();
    expect(section.queryByTestId('on-call-flag')).toBeNull();
  });

  it('shows nothing in a house with no on-call Johns', async () => {
    await open();
    expect(screen.queryByTestId('on-call')).toBeNull();
  });
});

describe('moving out', () => {
  const today = localDate(new Date(NOW), 'Europe/London');
  const later = '2099-06-30';

  it('says your moving-out day, onward to change it', async () => {
    read.mockResolvedValue(snapshot({ members: priyaWith({ movingOutOn: later }) }));
    await open();
    expect(screen.getByTestId('moving-line')).toHaveTextContent(words('house.moving.youMoveOut', { day: 'Tue 30 Jun' }));
    await fireEvent.press(screen.getByTestId('moving-line'));
    expect(await screen.findByText('Landed on Moving')).toBeOnTheScreen();
  });

  it('on the day, says it is time to leave, onward to You', async () => {
    read.mockResolvedValue(snapshot({ members: priyaWith({ movingOutOn: today }) }));
    await open();
    expect(screen.getByTestId('moving-line')).toHaveTextContent(words('house.moving.movingDay', { house: 'Flat 3' }));
    await fireEvent.press(screen.getByTestId('moving-line'));
    expect(await screen.findByText('Landed on You')).toBeOnTheScreen();
    // Never asked who's moving in: it's them moving out.
    expect(screen.queryByTestId('move-in-ask')).toBeNull();
  });

  it('asks the people who stay who is moving in, with the join card a tap away', async () => {
    const [priya, sam] = snapshot().members;
    read.mockResolvedValue(snapshot({ members: [priya, { ...sam, movingOutOn: later }] }));
    await open();
    expect(screen.queryByTestId('moving-line')).toBeNull();
    const ask = screen.getByTestId('move-in-ask');
    expect(within(ask).getByText(words('house.moving.askTitle'))).toBeOnTheScreen();
    await fireEvent.press(within(ask).getByRole('button', { name: words('house.moving.askButton') }));
    expect(await screen.findByTestId('invite-code')).toBeOnTheScreen();
  });

  it('keeps asking for a while after someone has gone, until someone moves in', async () => {
    const left = new Date(NOW.getTime() - 3 * 86_400_000).toISOString();
    read.mockResolvedValue(snapshot({ moves: { lastMovedOut: left, lastJoined: null } }));
    await open();
    expect(screen.getByTestId('move-in-ask')).toBeOnTheScreen();
  });

  it('asks nothing of a house nobody is leaving', async () => {
    await open();
    expect(screen.queryByTestId('move-in-ask')).toBeNull();
    expect(screen.queryByTestId('moving-line')).toBeNull();
  });
});

describe('on a laptop', () => {
  const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };
  beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP));
  afterEach(() => (useWindowDimensions as jest.Mock).mockReturnValue({ width: 412, height: 915, scale: 1, fontScale: 1 }));

  it('runs Next up across the main column over the rest of your week, and puts the house’s week beside them', async () => {
    await open();
    const main = within(screen.getByTestId('column-main'));
    const side = within(screen.getByTestId('column-side'));
    // The day's line heads the main column, a section label's height, so Next up lines up with the first group beside it.
    expect(main.getByTestId('top-line')).toBeOnTheScreen();
    expect(main.getByTestId('next-up')).toBeOnTheScreen();
    // Under it, not beside it: the main column is one stack, Next up first.
    expect(screen.queryByTestId('today-pair')).toBeNull();
    expect(main.getByTestId('rest-of-week')).toBeOnTheScreen();
    const glance = side.getByTestId('week-glance');
    expect(within(glance).getByTestId('week-bar')).toBeOnTheScreen();
    // The glance's parts are one line, not Week's filters.
    expect(within(glance).getByTestId('week-parts')).toBeOnTheScreen();
    expect(within(glance).queryByRole('button', { name: /done/ })).toBeNull();
    expect(within(glance).getByRole('link', { name: new RegExp(words('today.page.seeWeek')) })).toBeOnTheScreen();
  });

  it('still fills the room with no space for the panel: Next up across it, the rest of your week beside the week', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ ...LAPTOP, width: 1100 });
    await open();
    expect(screen.queryByTestId('columns')).toBeNull();
    // Next up runs across the page, over the pair.
    expect(within(screen.getByTestId('today-pair')).queryByTestId('next-up')).toBeNull();
    expect(screen.getByTestId('next-up')).toBeOnTheScreen();
    expect(within(screen.getByTestId('today-pair-start')).getByTestId('rest-of-week')).toBeOnTheScreen();
    expect(within(screen.getByTestId('today-pair-end')).getByTestId('week-glance')).toBeOnTheScreen();
  });
});

describe("a parent ticking for a kid, in a family", () => {
  /** Priya the parent; Sam a kid who doesn't sign in, with Clean the bath. */
  const family = (signsIn = false) => {
    const base = snapshot();
    return snapshot({
      house: { ...base.house, kind: 'family', pocketCapMinor: 1000 },
      rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
      members: base.members.map((m) => (m.userId === 'sam' ? { ...m, signsIn, bornYear: 2016 } : m)),
    });
  };

  it("switches Today to the kid, and ticks their John", async () => {
    read.mockResolvedValue(family());
    (loadPocket as jest.Mock).mockResolvedValue({ month: '2026-10', soFar: 0, earned: {}, owed: [], history: [] });
    await open();
    expect(within(screen.getByTestId('next-up')).getByText('Bins out')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('kid-switch'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sam' }));
    await waitFor(() => expect(within(screen.getByTestId('next-up')).getByText('Clean the bath')).toBeOnTheScreen());
    // The kid's Today: no Ask Jonz.
    expect(screen.queryByTestId('ask-jonz')).toBeNull();
    await fireEvent.press(screen.getByTestId('mark-done'));
    expect(markDone).toHaveBeenCalledWith('a4');
  });

  it("has no switcher when every kid signs in", async () => {
    read.mockResolvedValue(family(true));
    await open();
    expect(screen.queryByTestId('kid-switch')).toBeNull();
  });
});
