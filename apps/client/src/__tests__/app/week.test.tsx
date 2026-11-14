import { BIN_NIGHT, buildStake, humanError, NEW_JOHN, type SteadyAheadWeek, wordsFor } from '@app/core';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Platform, Text, useWindowDimensions } from 'react-native';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { markDone, undoDone } from '@/api/johns';
import { pickPhoto } from '@/api/photos';
import { dealThisWeek, loadJohnList } from '@/api/settings';
import { loadStake } from '@/api/stake';
import { loadTable } from '@/api/table';
import Week from '@/app/(house)/week';
import { ToastProvider } from '@/components/toast';
import { houseKey } from '@/hooks/keys';
import { assignment, snapshot, KINDS } from '@/testing/house';
import { testQueryClient } from '@/testing/query';
import { hoursFromNow as at } from '@/testing/clock';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/away', () => ({ loadAway: jest.fn() }));
jest.mock('@/api/table', () => ({ loadTable: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/settings', () => ({ dealThisWeek: jest.fn(), loadJohnList: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/kids', () => ({ addKid: jest.fn() }));
jest.mock('@/api/johns', () => ({ markDone: jest.fn(), undoDone: jest.fn(), spendImmunity: jest.fn(), spendSwap: jest.fn() }));
jest.mock('@/api/photos', () => ({ pickPhoto: jest.fn(), uploadProof: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
// Whoever's looking: Priya (the admin) unless a test says otherwise.
const mockViewer = { id: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockViewer.id } }, house: { id: 'h1', name: 'Flat 3' } }),
}));
// The John sheet is the house layout's; here, what Week asks it to open.
const mockOpen = jest.fn();
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: mockOpen, close: jest.fn() }) }));
// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 412, height: 915, scale: 1, fontScale: 1 })),
}));

const read = loadHouse as jest.Mock;
const PHONE = { width: 412, height: 915, scale: 1, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

/**
 * Priya's two open Johns (Bins out, Hoover the stairs) and one done (Wipe the
 * hob); Sam's Clean the bath ticked and being checked, and his Mop the floor
 * disputed by Cal, waiting for Priya's vote. 1 done, 1 checking, 1 disputed,
 * 2 to go: five Johns.
 */
function busyWeek(overrides: Parameters<typeof snapshot>[0] = {}) {
  return snapshot({
    assignments: [
      ...snapshot().assignments.slice(0, 3),
      assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', kind_name: 'Bathroom', done_at: at(-1) }),
      assignment({ id: 'a5', user_id: 'sam', name: 'Mop the floor', kind_name: 'Floors', done_at: at(-2) }),
    ],
    disputes: [
      {
        id: 'd1',
        assignment_id: 'a5',
        raised_by: 'cal',
        reason: 'Still sticky',
        closes_at: at(5),
        dispute_votes: [{ user_id: 'cal', uphold: true }],
      },
    ],
    ...overrides,
  });
}

/** One of Sam's still to do, for a swap to trade for. */
const samsOpenJohn = assignment({ id: 'a6', user_id: 'sam', name: 'Descale the kettle', kind_name: 'Kitchen', due_at: at(30) });

/** Week under a stand-in layout, with the pages its menu goes to standing in as their names. */
async function open(): Promise<QueryClient> {
  const client = testQueryClient();
  await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={client}>
          <ToastProvider>
            <Slot />
          </ToastProvider>
        </QueryClientProvider>
      ),
      week: Week,
      'house/away': () => <Text>Time away page</Text>,
      'house/johns': () => <Text>John list page</Text>,
      'week/record': () => <Text>Track record page</Text>,
    },
    { initialUrl: '/week' },
  );
  // The house has been read once the spinner goes.
  await waitFor(() => expect(screen.queryByLabelText(words('common.shell.reading'))).toBeNull());
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: words('common.title.week') })).toBeOnTheScreen();
  return client;
}

/** Pulls the page down to refresh it, as a thumb would: what the scroll view's refresh control does. */
async function pull() {
  type Node = { props: Record<string, unknown>; children: (Node | string)[] };
  const find = (node: Node): Node | undefined =>
    node.props.refreshControl ? node : node.children.flatMap((c) => (typeof c === 'string' ? [] : [find(c)])).find(Boolean);
  const scroll = find(screen.getByTestId('week-screen') as unknown as Node)!;
  const control = scroll.props.refreshControl as { props: { onRefresh: () => void } };
  await act(async () => control.props.onRefresh());
}

/** A John's row, by its name. */
function row(john: string) {
  return screen.getAllByTestId('week-row').find((r) => within(r).queryByText(john) !== null)!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockViewer.id = 'priya';
  (useWindowDimensions as jest.Mock).mockReturnValue(PHONE);
  read.mockResolvedValue(busyWeek());
  (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [], groups: [] });
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [] });
  (loadTable as jest.Mock).mockResolvedValue({
    month: '2026-10',
    monthTable: [],
    balances: [
      { userId: 'priya', balance: 0, weeksToEven: 0 },
      { userId: 'sam', balance: 0, weeksToEven: 0 },
    ],
  });
  (catchUp as jest.Mock).mockResolvedValue(false);
  (markDone as jest.Mock).mockResolvedValue(undefined);
  (undoDone as jest.Mock).mockResolvedValue(undefined);
  (dealThisWeek as jest.Mock).mockResolvedValue(undefined);
});

describe('the summary', () => {
  it('adds up to the week: done, checking, disputed, overdue and to go, never counting a John twice', async () => {
    await open();
    expect(screen.getByRole('image', { name: '5 Johns: 1 done, 1 checking, 1 disputed, 2 to go' })).toBeOnTheScreen();
    for (const name of ['1 done', '1 checking', '1 disputed', '0 overdue', '2 to go']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: '0 overdue' })).toBeDisabled();
    // No stat tiles and no Table card any more.
    expect(screen.queryByTestId(`stat-${words('week.table.done')}`)).toBeNull();
    expect(screen.queryByTestId('standing')).toBeNull();
  });

  it('says the week ends, in a line above the bar', async () => {
    await open();
    expect(within(screen.getByTestId('week-summary')).getByText(/, ends /)).toBeOnTheScreen();
  });

  it('filters the list by a part of the legend, and shows everything when pressed again', async () => {
    await open();
    const toGo = screen.getByRole('button', { name: '2 to go' });
    await fireEvent.press(toGo);
    expect(toGo).toBeSelected();
    expect(screen.getAllByTestId('week-row')).toHaveLength(2);
    expect(screen.queryByTestId('person-sam')).toBeNull();
    expect(screen.queryByTestId('done-fold')).toBeNull();

    // A finished John shows as a row, unfolded, while its part is chosen.
    await fireEvent.press(screen.getByRole('button', { name: '1 done' }));
    expect(screen.getByRole('button', { name: '1 done' })).toBeSelected();
    expect(screen.getAllByTestId('week-row')).toHaveLength(1);
    expect(row('Wipe the hob')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '1 done' }));
    expect(screen.getByRole('button', { name: '1 done' })).not.toBeSelected();
    expect(screen.getByTestId('person-sam')).toBeOnTheScreen();
    expect(screen.getAllByTestId('week-row')).toHaveLength(4);
  });

  it('lets go of a filter whose part empties, and stays let go when the part fills again', async () => {
    const client = await open();
    await fireEvent.press(screen.getByRole('button', { name: '1 disputed' }));
    expect(screen.getAllByTestId('week-row')).toHaveLength(1);

    // The house decides the dispute: nothing is disputed, so everything shows again.
    const decided = busyWeek({ disputes: [] });
    decided.assignments[4] = { ...decided.assignments[4], outcome: 'done' };
    read.mockResolvedValue(decided);
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(screen.getByRole('button', { name: '0 disputed' })).toBeDisabled());
    expect(screen.getAllByTestId('week-row')).toHaveLength(3);

    // Later another dispute comes in. Nobody pressed anything, so the list stays whole.
    read.mockResolvedValue(busyWeek());
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(screen.getByRole('button', { name: '1 disputed' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '1 disputed' })).not.toBeSelected();
    expect(screen.getAllByTestId('week-row')).toHaveLength(4);
  });

  it('mutes a part with nothing in it, and it filters nothing', async () => {
    await open();
    const overdue = screen.getByRole('button', { name: '0 overdue' });
    expect(overdue).toBeDisabled();
    await fireEvent.press(overdue);
    expect(overdue).not.toBeSelected();
    expect(screen.getAllByTestId('week-row')).toHaveLength(4);
  });
});

describe('the track record', () => {
  it('opens from under the week', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('week-record'));
    expect(await screen.findByText('Track record page')).toBeOnTheScreen();
  });
});

describe('on a phone', () => {
  it('shows one group per person, you first, with how many are done and the points', async () => {
    await open();
    const groups = screen.getAllByTestId(/^person-/);
    expect(groups.map((g) => g.props.testID)).toEqual(['person-priya', 'person-sam']);
    const you = screen.getByTestId('person-priya');
    expect(within(you).getByRole('header', { name: words('week.table.you') })).toBeOnTheScreen();
    expect(within(you).getByText('1 of 3 done, 2 pts')).toBeOnTheScreen();
    expect(within(screen.getByTestId('person-sam')).getByText('0 of 2 done, 4 pts')).toBeOnTheScreen();
  });

  it('shows a John done together once, under Together, and counts it in each person\'s group', async () => {
    const garden = (id: string, user: string) =>
      assignment({ id, user_id: user, name: 'Garden tidy', kind_name: 'Outside', points: 4, job_id: 'job1', due_at: at(20) });
    read.mockResolvedValue(snapshot({ assignments: [garden('g1', 'priya'), garden('g2', 'sam')] }));
    await open();
    const together = within(screen.getByTestId('week-together'));
    expect(together.getAllByTestId('week-row')).toHaveLength(1);
    expect(together.getByText('Garden tidy')).toBeOnTheScreen();
    expect(together.getByText(/with Sam/)).toBeOnTheScreen();
    expect(within(screen.getByTestId('person-priya')).getByText('0 of 1 done, 0 pts')).toBeOnTheScreen();
    expect(within(screen.getByTestId('person-priya')).queryByText('Garden tidy')).toBeNull();
    // Ticked from its sheet, with who did it: no tick box to tick it from.
    await fireEvent.press(together.getByText('Garden tidy'));
    expect(mockOpen).toHaveBeenCalledWith('g1', undefined);
  });

  it('folds finished Johns away, counting the late ones', async () => {
    read.mockResolvedValue(
      busyWeek({
        assignments: [
          ...busyWeek().assignments.slice(0, 2),
          assignment({ id: 'a3', name: 'Wipe the hob', due_at: at(-30), done_at: at(-20), outcome: 'late' }),
        ],
      }),
    );
    await open();
    const fold = within(screen.getByTestId('person-priya')).getByRole('button', { name: /Done \(1\)/ });
    expect(within(fold).getByText('Done (1),')).toBeOnTheScreen();
    expect(within(fold).getByText('1 late')).toBeOnTheScreen();
    expect(fold).not.toBeExpanded();
    expect(screen.queryByText('Wipe the hob')).toBeNull();
    await fireEvent.press(fold);
    expect(fold).toBeExpanded();
    expect(within(row('Wipe the hob')).getByTestId('status-late')).toBeOnTheScreen();
  });

  it('ticks your open John from its tick box, and a photo John goes to the camera first', async () => {
    read.mockResolvedValue(
      busyWeek({
        assignments: [
          ...busyWeek().assignments.slice(0, 1),
          assignment({ id: 'a2', name: 'Hoover the stairs', kind_name: 'Floors', due_at: at(72), needs_photo: true }),
        ],
      }),
    );
    (pickPhoto as jest.Mock).mockResolvedValue(null);
    await open();
    const tick = screen.getByRole('checkbox', { name: words('today.nextUp.tick', { john: 'Bins out' }) });
    expect(tick).not.toBeChecked();
    await fireEvent.press(tick);
    expect(markDone).toHaveBeenCalledWith('a1');
    await fireEvent.press(screen.getByRole('checkbox', { name: words('today.nextUp.tickWithPhoto', { john: 'Hoover the stairs' }) }));
    expect(pickPhoto).toHaveBeenCalledWith('camera');
  });

  it("says why when the database refuses a tick, under the John's row", async () => {
    (markDone as jest.Mock).mockRejectedValue(new Error('This week has closed.'));
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: words('today.nextUp.tick', { john: 'Bins out' }) }));
    expect(await within(screen.getByTestId('person-priya')).findByText('This week has closed.')).toBeOnTheScreen();
  });

  it("never ticks a housemate's John: its tick box is only a picture, saying what Today's would", async () => {
    await open();
    const sam = screen.getByTestId('person-sam');
    expect(within(sam).queryByRole('checkbox')).toBeNull();
    expect(within(sam).getByRole('image', { name: words('today.nextUp.stateLabel.checking') })).toBeOnTheScreen();
  });

  it('offers Undo on your tick while the house checks it', async () => {
    read.mockResolvedValue(
      busyWeek({
        assignments: [
          ...busyWeek().assignments.slice(0, 1),
          assignment({ id: 'a2', name: 'Hoover the stairs', kind_name: 'Floors', done_at: at(-1) }),
        ],
      }),
    );
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) }));
    expect(undoDone).toHaveBeenCalledWith('a2');
  });

  describe('an undo that would make the John late', () => {
    // Priya's Hoover the stairs: ticked on time, now past its due time, being checked.
    const checking = () =>
      busyWeek({
        assignments: [
          ...busyWeek().assignments.slice(0, 1),
          assignment({ id: 'a2', name: 'Hoover the stairs', kind_name: 'Floors', due_at: at(-2), done_at: at(-3) }),
        ],
        disputes: [],
      });
    // A moment later: Sam disputes it.
    const disputed = () => ({
      ...checking(),
      disputes: [
        { id: 'd2', assignment_id: 'a2', raised_by: 'sam', reason: 'Still dusty', closes_at: at(20), dispute_votes: [{ user_id: 'sam', uphold: true }] },
      ],
    });
    /** The house read again, as a Realtime change does. */
    async function reread(client: QueryClient, house: ReturnType<typeof checking>) {
      read.mockResolvedValue(house);
      await act(async () => {
        await client.invalidateQueries({ queryKey: houseKey('h1') });
      });
    }

    it('asks first, and says a refusal under the row once a dispute has taken the question away', async () => {
      read.mockResolvedValue(checking());
      let refuse: (reason: Error) => void = () => undefined;
      (undoDone as jest.Mock).mockImplementation(() => new Promise((_ok, no) => (refuse = no)));
      const client = await open();
      await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) }));
      expect(undoDone).not.toHaveBeenCalled();
      const confirm = screen.getByTestId('undo-confirm');
      await fireEvent.press(within(confirm).getByRole('button', { name: words('john.sheet.undoIt') }));
      expect(undoDone).toHaveBeenCalledWith('a2');

      // Sam's dispute lands while the undo is on its way: the row offers no Undo, so the question goes.
      await reread(client, disputed());
      await waitFor(() => expect(screen.queryByTestId('undo-confirm')).toBeNull());
      const refusal = humanError({ message: 'under_dispute', code: 'P0001' });
      await act(async () => refuse(new Error(refusal)));
      expect(within(screen.getByTestId('person-priya')).getByText(refusal)).toBeOnTheScreen();
    });

    it('never asks again by itself when the dispute that took the question away is turned down', async () => {
      read.mockResolvedValue(checking());
      const client = await open();
      await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) }));
      expect(screen.getByTestId('undo-confirm')).toBeOnTheScreen();

      await reread(client, disputed());
      await waitFor(() => expect(screen.queryByTestId('undo-confirm')).toBeNull());
      // The house turns the dispute down before the tick stands: Undo is back, the question isn't.
      await reread(client, checking());
      expect(await screen.findByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) })).toBeOnTheScreen();
      expect(screen.queryByTestId('undo-confirm')).toBeNull();
      expect(undoDone).not.toHaveBeenCalled();
    });
  });

  it('opens the John sheet from any row: on Dispute for a fresh tick, on the vote for a dispute', async () => {
    await open();
    await fireEvent.press(within(row('Bins out')).getByRole('button'));
    expect(mockOpen).toHaveBeenLastCalledWith('a1', undefined);
    await fireEvent.press(within(row('Clean the bath')).getByRole('button'));
    expect(mockOpen).toHaveBeenLastCalledWith('a4', 'dispute');
    await fireEvent.press(within(row('Mop the floor')).getByRole('button', { name: /Disputed by/ }));
    expect(mockOpen).toHaveBeenLastCalledWith('a5', 'vote');
    // The dispute waits for Priya's vote: its row says so with a Vote button of its own.
    await fireEvent.press(screen.getByRole('button', { name: words('week.summary.voteOn', { john: 'Mop the floor' }) }));
    expect(mockOpen).toHaveBeenCalledTimes(4);
    expect(mockOpen).toHaveBeenLastCalledWith('a5', 'vote');
    // Cal, who raised it, has left the house since.
    expect(within(row('Mop the floor')).getByText('Disputed by someone who left, 5h left')).toBeOnTheScreen();
  });

  it('marks overdue Johns with the hazard mark', async () => {
    read.mockResolvedValue(busyWeek({ assignments: [assignment({ id: 'a1', due_at: at(-3) })] }));
    await open();
    expect(within(row('Bins out')).getByTestId('status-overdue')).toBeOnTheScreen();
  });

  it('tags your group "Swap ready" while you hold a swap token and a housemate has an open John to trade', async () => {
    const members = snapshot().members.map((m) => (m.userId === 'priya' ? { ...m, swapTokens: 1 } : m));
    read.mockResolvedValue(busyWeek({ members, assignments: [...busyWeek().assignments, samsOpenJohn] }));
    await open();
    expect(within(screen.getByTestId('person-priya')).getByTestId('swap-ready')).toHaveTextContent(words('week.summary.swapReady'));
    expect(within(screen.getByTestId('person-sam')).queryByTestId('swap-ready')).toBeNull();
  });

  it("doesn't tag it while there's nothing to trade, token or not: Sam's Johns are all ticked", async () => {
    const members = snapshot().members.map((m) => (m.userId === 'priya' ? { ...m, swapTokens: 1 } : m));
    read.mockResolvedValue(busyWeek({ members }));
    await open();
    expect(screen.queryByTestId('swap-ready')).toBeNull();
  });

  it("is quiet about swaps without a token, and has no swap button (it's in the John sheet)", async () => {
    await open();
    expect(screen.queryByTestId('swap-ready')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use your swap' })).toBeNull();
  });

  it("says in a person's header when they're away, and gives someone with no Johns a group too", async () => {
    read.mockResolvedValue(
      busyWeek({
        members: [...snapshot().members, { userId: 'cal', name: 'Cal', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } }],
      }),
    );
    (loadAway as jest.Mock).mockResolvedValue({
      today: '2026-10-21',
      periods: [
        { id: 'p1', userId: 'sam', startsOn: '2026-10-21', endsOn: '2026-10-23', note: null },
        { id: 'p2', userId: 'cal', startsOn: '2026-10-01', endsOn: '2026-11-30', note: null },
      ],
    });
    await open();
    const sam = screen.getByTestId('person-sam');
    // Each on a line of its own, so neither is cut short on a small phone.
    expect(await within(sam).findByText('away 21–23 Oct')).toBeOnTheScreen();
    expect(within(sam).getByText('0 of 2 done, 4 pts')).toBeOnTheScreen();
    const cal = screen.getByTestId('person-cal');
    expect(within(cal).getByText('away all week')).toBeOnTheScreen();
    expect(within(cal).getByText(words('week.summary.nothing'))).toBeOnTheScreen();
    expect(within(screen.getByTestId('person-priya')).queryByText(/away/)).toBeNull();
  });

  it('reads time away and the fair shares again on a pull', async () => {
    await open();
    expect(await screen.findByTestId('week-fairness')).toBeOnTheScreen();
    expect(loadAway).toHaveBeenCalledTimes(1);
    expect(loadTable).toHaveBeenCalledTimes(1);
    (loadAway as jest.Mock).mockResolvedValue({
      today: '2026-10-21',
      periods: [{ id: 'p1', userId: 'sam', startsOn: '2026-10-22', endsOn: '2026-10-23', note: null }],
    });
    await pull();
    expect(await within(screen.getByTestId('person-sam')).findByText('away 22–23 Oct')).toBeOnTheScreen();
    expect(loadTable).toHaveBeenCalledTimes(2);
  });

  it("ends a finished John's row with what it earned, not a second tick", async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.done', { count: 1 }) }));
    const hob = row('Wipe the hob');
    expect(within(hob).getByText('2 pts')).toBeOnTheScreen();
    expect(within(hob).queryByTestId('status-done')).toBeNull();
  });

  it('says when a tick stands, yours (with Undo in place of the mark) or a housemate\'s, as Today does', async () => {
    read.mockResolvedValue(
      busyWeek({ assignments: busyWeek().assignments.map((a) => (a.id === 'a2' ? { ...a, done_at: at(-1) } : a)) }),
    );
    await open();
    expect(within(row('Hoover the stairs')).getByText(/^Floors, stands in \d+h$/)).toBeOnTheScreen();
    expect(within(row('Hoover the stairs')).getByRole('button', { name: words('today.nextUp.undo', { john: 'Hoover the stairs' }) })).toBeOnTheScreen();
    expect(within(row('Clean the bath')).getByText(/^Bathroom, stands in /)).toBeOnTheScreen();
  });

  it("opens your own disputed John on nothing in particular, as you can't vote on it", async () => {
    read.mockResolvedValue(
      busyWeek({
        assignments: [...busyWeek().assignments.slice(0, 4), assignment({ id: 'a5', name: 'Mop the floor', kind_name: 'Floors', done_at: at(-2) })],
      }),
    );
    await open();
    const mop = row('Mop the floor');
    // The flag on its tick box and the meta line say it's disputed; its points trail, as on Today.
    expect(within(mop).getByText('Disputed by someone who left, 5h left')).toBeOnTheScreen();
    expect(within(mop).queryByTestId('status-disputed')).toBeNull();
    expect(within(mop).getByText('2 pts')).toBeOnTheScreen();
    await fireEvent.press(within(mop).getByRole('button'));
    expect(mockOpen).toHaveBeenLastCalledWith('a5', undefined);
  });
});

describe('the fairness footer', () => {
  it('says the deal is even when it is', async () => {
    await open();
    expect(await screen.findByText(words('week.summary.fairLevel'))).toBeOnTheScreen();
  });

  it('names whoever is furthest off their share', async () => {
    (loadTable as jest.Mock).mockResolvedValue({
      month: '2026-10',
      monthTable: [],
      balances: [
        { userId: 'sam', balance: -4, weeksToEven: 4 },
        { userId: 'priya', balance: 4, weeksToEven: 0 },
      ],
    });
    await open();
    expect(await screen.findByTestId('week-fairness')).toHaveTextContent(
      'Sam is 4 pts behind on fair shares, and catching up a little each week.',
    );
  });

  it("opens everyone's fair share from the sentence, you first", async () => {
    (loadTable as jest.Mock).mockResolvedValue({
      month: '2026-10',
      monthTable: [],
      balances: [
        { userId: 'sam', balance: -1, weeksToEven: 2 },
        { userId: 'priya', balance: 1, weeksToEven: 0 },
      ],
    });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: words('week.summary.fairClose') }));
    const sheet = screen.getByTestId('fair-shares');
    expect(within(sheet).getByRole('header', { name: words('house.table.shares') })).toBeOnTheScreen();
    expect(within(sheet).getByText(words('house.table.sharesBody'))).toBeOnTheScreen();
    const rows = within(sheet).getAllByTestId('fair-share');
    expect(within(rows[0]).getByText(words('week.table.you'))).toBeOnTheScreen();
    expect(within(rows[0]).getByText('+1')).toBeOnTheScreen();
    expect(within(rows[1]).getByText('Sam')).toBeOnTheScreen();
    expect(within(rows[1]).getByText('−1')).toBeOnTheScreen();
    expect(within(sheet).getByText('Below zero is behind, above is ahead. Time away is made up: in full.')).toBeOnTheScreen();
  });
});

describe('coming up', () => {
  // The fridge deep clean, first Saturday every 3 months from November 2026.
  const fridge = { ...NEW_JOHN, id: 'fridge', name: 'Fridge deep clean', points: 8, everyMonths: 3, weekOfMonth: 1, anchorMonth: 2026 * 12 + 10, dueDow: 6 as const };

  it('lists the long Johns that land in the next four weeks, with when and how often', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [{ ...NEW_JOHN, id: 'j1', name: 'Bins out' }, fridge], groups: [] });
    await open();
    const section = await screen.findByTestId('coming-up');
    expect(within(section).getByText(words('house.repeat.comingUp'))).toBeOnTheScreen();
    const rows = within(section).getAllByTestId('coming-up-john');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Fridge deep clean')).toBeOnTheScreen();
    expect(within(rows[0]).getByText('Sat 7 Nov, every 3 months')).toBeOnTheScreen();
  });

  it('shows nothing when no long John lands soon', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [{ ...fridge, anchorMonth: 2026 * 12 + 11 }], groups: [] });
    await open();
    await waitFor(() => expect(loadJohnList).toHaveBeenCalled());
    expect(screen.queryByTestId('coming-up')).toBeNull();
  });
});

describe('the look ahead', () => {
  const LIST = [
    { ...NEW_JOHN, id: 'j1', name: 'Bins out', kindId: 'bins' },
    { ...NEW_JOHN, id: 'mop', name: 'Mopping', kindId: 'floors', points: 3 },
    { ...NEW_JOHN, id: 'kitchen', name: 'Kitchen', kindId: 'kitchen', points: 2 },
  ];
  const WEEKS: SteadyAheadWeek[] = [
    { startsOn: '2026-10-26', johns: { mop: ['sam'], j1: ['priya'] } },
    { startsOn: '2026-11-02', johns: { kitchen: ['priya'], j1: ['sam'] } },
  ];
  // Bins out is this week's (a1); Mopping waits; Kitchen comes round in a fortnight.
  const dealt = (dealMode: 'smart' | 'classic') =>
    snapshot({
      rules: { ...snapshot().rules, dealMode },
      assignments: snapshot().assignments.map((a) => (a.id === 'a1' ? { ...a, john_id: 'j1' } : a)),
      steady: { waiting: { mop: 2 }, ahead: WEEKS },
    });

  it('lists the Johns waiting their turn, with when it comes, and whose turn is next', async () => {
    read.mockResolvedValue(dealt('smart'));
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: LIST, groups: [] });
    await open();
    const waiting = within(await screen.findByTestId('week-waiting'));
    expect(waiting.getByText(words('week.steady.waiting'))).toBeOnTheScreen();
    expect(waiting.getByTestId('waiting-john')).toHaveTextContent(/Mopping.*Floors & hoovering, next week.*3 pts/);
    expect(screen.getByText(words('week.steady.waitingNote'))).toBeOnTheScreen();
    const next = within(screen.getByTestId('week-turns-next'));
    expect(next.getAllByTestId('turn-next')).toHaveLength(1);
    expect(next.getByTestId('turn-next')).toHaveTextContent(/Kitchen.*Kitchen, your turn, week of 2 Nov/);
  });

  it('shows Classic as the next two weeks, person by person', async () => {
    read.mockResolvedValue(dealt('classic'));
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: LIST, groups: [] });
    await open();
    const weeks = await screen.findAllByTestId('week-ahead');
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveTextContent(/^Next week.*You.*Bins out.*Sam.*Mopping/);
    expect(weeks[1]).toHaveTextContent(/^Week of 2 Nov.*You.*Kitchen.*Sam.*Bins out/);
    expect(screen.queryByTestId('week-turns-next')).toBeNull();
  });

  it('shows nothing of it for a week dealt before Steady weeks', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: LIST, groups: [] });
    await open();
    await waitFor(() => expect(loadJohnList).toHaveBeenCalled());
    expect(screen.queryByTestId('week-waiting')).toBeNull();
    expect(screen.queryByTestId('week-turns-next')).toBeNull();
    expect(screen.queryByTestId('week-ahead')).toBeNull();
  });
});

describe('before the deal', () => {
  const notDealt = () => snapshot({ week: null, assignments: [], house: { ...snapshot().house, everDealt: false } });

  it('gives the admin the first deal as Today does, "Deal week 1", amber once there are Johns and housemates', async () => {
    read.mockResolvedValue(notDealt());
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [{ ...NEW_JOHN, id: 'j1', name: 'Bins out' }], groups: [] });
    await open();
    expect(screen.getByRole('header', { name: words('week.summary.notDealt') })).toBeOnTheScreen();
    expect(screen.queryByTestId('week-summary')).toBeNull();
    // Outline while the list is read, then amber.
    await waitFor(() => expect(screen.getByRole('button', { name: words('today.nextUp.dealWeek1') })).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis }));
    await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.dealWeek1') }));
    expect(dealThisWeek).toHaveBeenCalledWith('h1');
  });

  it("keeps it outline in a house of one, which may deal alone, as Today's checklist does", async () => {
    read.mockResolvedValue(snapshot({ ...notDealt(), members: [snapshot().members[0]] }));
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [{ ...NEW_JOHN, id: 'j1', name: 'Bins out' }], groups: [] });
    await open();
    await waitFor(() => expect(loadJohnList).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: words('today.nextUp.dealWeek1') })).not.toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
  });

  it('with no Johns yet, offers to add them rather than a deal that would be refused', async () => {
    read.mockResolvedValue(notDealt());
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [], groups: [] });
    await open();
    const add = await screen.findByRole('link', { name: words('today.nextUp.addJohns') });
    expect(add).not.toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
    expect(screen.queryByTestId('deal-week')).toBeNull();
    await fireEvent.press(add);
    expect(await screen.findByText('John list page')).toBeOnTheScreen();
  });

  it("says why when the database won't deal, under the button", async () => {
    read.mockResolvedValue(notDealt());
    (loadJohnList as jest.Mock).mockResolvedValue({ kinds: KINDS, johns: [{ ...NEW_JOHN, id: 'j1', name: 'Bins out' }], groups: [] });
    (dealThisWeek as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: words('today.nextUp.dealWeek1') }));
    expect(await within(screen.getByTestId('week-not-dealt')).findByText('Only the house admins can do that.')).toBeOnTheScreen();
  });

  it('tells everyone else who will deal it', async () => {
    mockViewer.id = 'sam';
    read.mockResolvedValue(notDealt());
    await open();
    expect(screen.getByText(words('today.nextUp.waiting', { admin: 'Priya' }))).toBeOnTheScreen();
    expect(screen.queryByTestId('deal-week')).toBeNull();
    // Nor is the John list read for them.
    expect(loadJohnList).not.toHaveBeenCalled();
  });

  it('says why a week with nothing on it is empty, once the house has begun', async () => {
    read.mockResolvedValue(snapshot({ week: null, assignments: [] }));
    await open();
    expect(screen.getByRole('header', { name: words('today.notDealt.nothingThisWeek') })).toBeOnTheScreen();
    expect(screen.queryByTestId('deal-week')).toBeNull();
  });
});

describe('the ••• menu', () => {
  // The menu's choice runs as it closes, as it does everywhere but iOS (which waits for the slide out).
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
  afterEach(() => jest.restoreAllMocks());

  const untouched = () =>
    snapshot({ assignments: snapshot().assignments.map((a) => ({ ...a, done_at: null, outcome: null })) });

  it("goes to time away from \"I'm away…\"", async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    await fireEvent.press(screen.getByRole('button', { name: words('week.summary.awayAction') }));
    expect(screen).toHavePathname('/house/away');
  });

  it('gives an admin the John list', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    await fireEvent.press(screen.getByRole('button', { name: words('week.summary.editJohns') }));
    expect(screen).toHavePathname('/house/johns');
  });

  it('lets an admin re-deal a week nobody has ticked in, after asking', async () => {
    read.mockResolvedValue(untouched());
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    await fireEvent.press(screen.getByRole('button', { name: words('week.summary.redeal') }));
    expect(screen.getByRole('header', { name: words('week.summary.redealTitle') })).toBeOnTheScreen();
    expect(screen.getByText(words('week.summary.redealBody'))).toBeOnTheScreen();
    expect(dealThisWeek).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm'));
    expect(dealThisWeek).toHaveBeenCalledWith('h1');
    expect(await screen.findByText(words('week.summary.redealt'))).toBeOnTheScreen();
  });

  it("says why when the database won't re-deal, in the confirm", async () => {
    read.mockResolvedValue(untouched());
    (dealThisWeek as jest.Mock).mockRejectedValue(new Error('Someone has already ticked a John this week.'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    await fireEvent.press(screen.getByRole('button', { name: words('week.summary.redeal') }));
    await fireEvent.press(screen.getByTestId('confirm'));
    expect(await screen.findByText('Someone has already ticked a John this week.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: words('week.summary.redealTitle') })).toBeOnTheScreen();
  });

  it('offers no re-deal once a John is ticked', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    expect(screen.getByRole('button', { name: words('week.summary.editJohns') })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: words('week.summary.redeal') })).toBeNull();
  });

  it("gives everyone else only \"I'm away…\"", async () => {
    mockViewer.id = 'sam';
    read.mockResolvedValue(untouched());
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.more') }));
    expect(screen.getByRole('button', { name: words('week.summary.awayAction') })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: words('week.summary.editJohns') })).toBeNull();
    expect(screen.queryByRole('button', { name: words('week.summary.redeal') })).toBeNull();
  });
});

describe('on a laptop', () => {
  beforeEach(() => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    const stake = buildStake({ ledger: [], closedMonths: [], memberIds: ['priya', 'sam'], stakeMinor: 2000, month: '2026-10' });
    (loadStake as jest.Mock).mockResolvedValue({ ...stake, ledger: [], closedMonths: [] });
  });

  it('heads the board with the summary, with the Table in the panel beside it, over the way to the track record', async () => {
    await open();
    const main = within(screen.getByTestId('column-main'));
    const side = within(screen.getByTestId('column-side'));
    expect(main.getByTestId('week-summary')).toBeOnTheScreen();
    expect(main.getByTestId('week-table')).toBeOnTheScreen();
    expect(await side.findByTestId('house-table')).toBeOnTheScreen();
    expect(side.getByTestId('week-record')).toBeOnTheScreen();
  });

  it('stays in one column at the narrowest laptop, where the rail leaves too little room', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ ...LAPTOP, width: 1100 });
    await open();
    expect(screen.queryByTestId('columns')).toBeNull();
    expect(screen.getByTestId('week-table')).toBeOnTheScreen();
    expect(screen.queryByTestId('house-table')).toBeNull();
  });

  it('puts the whole house in one table, a row per John, the finished ones folded', async () => {
    await open();
    expect(screen.getByTestId('week-table')).toBeOnTheScreen();
    expect(screen.queryByTestId('person-priya')).toBeNull();
    // The column names are for the eye only: no empty headings in the page's outline.
    const head = screen.getByTestId('week-table-head', { includeHiddenElements: true });
    for (const column of (['john', 'who', 'points', 'status'] as const).map((c) => words(`week.table.columns.${c}`))) {
      expect(within(head).getByText(column, { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByRole('header', { name: column })).toBeNull();
    }
    expect(screen.getAllByTestId('week-row')).toHaveLength(4);
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.done', { count: 1 }) }));
    expect(screen.getAllByTestId('week-row')).toHaveLength(5);
  });

  it('says whose each John is, and puts the action in the status cell', async () => {
    await open();
    // Each row says every column to a screen reader, which can't see them.
    expect(
      within(row('Clean the bath')).getByRole('button', { name: /^Clean the bath, Bathroom, stands in .*, Sam, 2 pts, Done, being checked$/ }),
    ).toBeOnTheScreen();
    expect(within(row('Bins out')).getByText(words('week.table.you'))).toBeOnTheScreen();
    expect(within(row('Clean the bath')).getByText('Sam')).toBeOnTheScreen();
    expect(within(row('Clean the bath')).getByTestId('status-checking')).toBeOnTheScreen();
    await fireEvent.press(within(row('Mop the floor')).getByRole('button', { name: words('week.summary.voteOn', { john: 'Mop the floor' }) }));
    expect(mockOpen).toHaveBeenLastCalledWith('a5', 'vote');
  });

  it('ticks your John from its tick box and opens the sheet from the row', async () => {
    await open();
    await fireEvent.press(within(row('Bins out')).getByRole('checkbox'));
    expect(markDone).toHaveBeenCalledWith('a1');
    await fireEvent.press(within(row('Clean the bath')).getByRole('button'));
    expect(mockOpen).toHaveBeenLastCalledWith('a4', 'dispute');
  });

  it("says who's away and that your swap is ready under the summary, as the table has no person headers", async () => {
    const members = snapshot().members.map((m) => (m.userId === 'priya' ? { ...m, swapTokens: 1 } : m));
    read.mockResolvedValue(busyWeek({ members, assignments: [...busyWeek().assignments, samsOpenJohn] }));
    (loadAway as jest.Mock).mockResolvedValue({
      today: '2026-10-21',
      periods: [{ id: 'p1', userId: 'sam', startsOn: '2026-10-21', endsOn: '2026-10-23', note: null }],
    });
    await open();
    const summary = screen.getByTestId('week-summary');
    expect(await within(summary).findByText('Sam is away 21–23 Oct.')).toBeOnTheScreen();
    expect(within(summary).getByTestId('swap-ready')).toHaveTextContent(words('week.summary.swapReady'));
  });

  it('filters the table by the legend too', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: '1 disputed' }));
    expect(screen.getAllByTestId('week-row')).toHaveLength(1);
    expect(row('Mop the floor')).toBeOnTheScreen();
  });
});
