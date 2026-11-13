import { BIN_NIGHT, buildStake, type HistoryRow, monthOf, monthWord, stakeRules, perWeekLine, lateMissedLine, wordsFor } from '@app/core';
import { router, Slot } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking, Platform, Share, Text, useWindowDimensions } from 'react-native';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { loadJohnList, resetJoinCode } from '@/api/settings';
import { confirmPayment, loadStake, type StakeRead } from '@/api/stake';
import * as Clipboard from 'expo-clipboard';
import { loadTable } from '@/api/table';
import HouseScreen from '@/app/(house)/house';
import { HouseWorkspace } from '@/components/house/workspace';
import { assignment, snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ loadAway: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/kids', () => ({ addKid: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/table', () => ({ loadTable: jest.fn() }));
jest.mock('@/api/settings', () => ({ resetJoinCode: jest.fn(), loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

// The Wall's latest and the lower sections have their own tests: here they
// only have to be mounted, in their order, beside and under the Table.
const standIn = (name: string) => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  function StandIn() {
    return <RNText testID="lower">{name}</RNText>;
  }
  return StandIn;
};
jest.mock('@/components/house-page/wall-section', () => ({ WallSection: standIn('the Wall') }));
jest.mock('@/components/house-page/setup-section', () => ({ SetupSection: standIn('House setup') }));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' }, refresh: jest.fn() }),
}));

const entry = (id: number, userId: string, kind: string, amountMinor: number, month: string): HistoryRow => ({
  id,
  user_id: userId,
  kind,
  amount_minor: amountMinor,
  month,
  counterparty_user_id: null,
  created_at: '2026-10-10T12:00:00Z',
  john: null,
});

/** The Stake as House reads it: what buildStake makes of the ledger, and the ledger itself. */
function stakeRead(ledger: HistoryRow[], closedMonths: string[] = []): StakeRead {
  const built = buildStake({ ledger, closedMonths, memberIds: ['priya', 'sam'], stakeMinor: 2000, month: '2026-10' });
  return { ...built, ledger, closedMonths };
}

/** September closed with Sam £4 down, so Sam owes you £4; this month Sam is £3 down too. */
const OWED_TO_YOU = stakeRead(
  [
    entry(3, 'sam', 'forfeit', -300, '2026-10'),
    entry(2, 'sam', 'forfeit', -400, '2026-09'),
    entry(1, 'priya', 'share', 400, '2026-09'),
  ],
  ['2026-09'],
);

/** Shows the Table's week or month, from the menu in its header. */
async function showSpan(name: string) {
  await fireEvent.press(screen.getByTestId('table-span'));
  await fireEvent.press(screen.getByRole('radio', { name }));
}

/** House, with the pages it pushes standing in as their names. */
async function open({ workspace = false } = {}) {
  await renderPages(
    {
      // House's workspace, as its stack's layout puts it round each page.
      ...(workspace
        ? {
            'house/_layout': () => (
              <HouseWorkspace>
                <Slot />
              </HouseWorkspace>
            ),
          }
        : {}),
      'house/index': HouseScreen,
      'house/stake': () => <Text>Stake page</Text>,
      'house/wall': () => <Text>Wall page</Text>,
      'house/people/[userId]': () => <Text>Person page</Text>,
      'house/you': () => <Text>You page</Text>,
    },
    '/house',
  );
  await untilRead(words);
  // The Stake, the Table, the John list and time away are read after the house itself.
  // Your month's figure fills in once the Stake is read, or the Stake says it couldn't be.
  await waitFor(() =>
    expect(
      screen.queryByText(words('house.page.stakeUnreadable')) ?? within(screen.getByTestId('figure-money')).getAllByText(/£/)[0],
    ).toBeOnTheScreen(),
  );
  await waitFor(() => expect(screen.getByTestId('figure-johns')).toHaveTextContent(/\d/));
  await waitFor(() => expect(screen.queryByLabelText(words('house.page.readingTable'))).toBeNull());
}

beforeEach(() => {
  jest.clearAllMocks();
  // The narrowest phone unless a test says otherwise.
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 360, height: 780, scale: 2, fontScale: 1 });
  const members = snapshot().members.map((m) => (m.userId === 'sam' ? { ...m, streak: 5, swapTokens: 1 } : m));
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({
      members,
      assignments: [
        assignment({ id: 'a1', done_at: new Date(Date.now() - 3_600_000).toISOString(), points: 3 }),
        assignment({ id: 'a2', user_id: 'sam', points: 5 }),
      ],
    }),
  );
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadTable as jest.Mock).mockResolvedValue({
    month: '2026-10',
    monthTable: [
      { userId: 'sam', points: 12, done: 4, late: 1, missed: 0, rank: 1 },
      { userId: 'priya', points: 9, done: 3, late: 0, missed: 0, rank: 2 },
    ],
    balances: [
      { userId: 'priya', balance: -3, weeksToEven: 2 },
      { userId: 'sam', balance: 3, weeksToEven: 0 },
    ],
  });
  (loadStake as jest.Mock).mockResolvedValue(OWED_TO_YOU);
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-26', periods: [] });
  (loadJohnList as jest.Mock).mockResolvedValue({
    johns: [
      { points: 3, everyWeeks: 1 },
      { points: 2, everyWeeks: 2 },
    ],
    groups: [],
  });
  (confirmPayment as jest.Mock).mockResolvedValue(undefined);
});

// Undoes the web's Platform.OS and Share's stand-in.
afterEach(() => jest.restoreAllMocks());

it('names the house in the title bar, and leads the page with its figures', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: 'Flat 3' })).toBeOnTheScreen();
  // Each figure over what it counts, each opening its page.
  expect(screen.getByTestId('figure-stake')).toHaveTextContent(`£20${words('house.page.stakeEach')}`);
  expect(screen.getByTestId('figure-people')).toHaveTextContent('2housemates');
  expect(screen.getByTestId('figure-johns')).toHaveTextContent(`2${words('house.page.johnsListed', { n: 2 })}${perWeekLine(4, words)}`);
  expect(within(screen.getByTestId('house-figures')).getAllByRole('link')).toHaveLength(4);
  // House is a tab's top: there's no way back from it.
  expect(bar.queryByRole('button', { name: words('common.shell.back') })).toBeNull();
});

/** On a phone, the switch's other half: the setup and the Pass. */
async function showSetup() {
  await fireEvent.press(within(screen.getByTestId('house-shows')).getByRole('radio', { name: words('house.shows.setup') }));
}

it('is two halves under a switch on a phone: the Overview, then the setup and the Pass', async () => {
  await open();
  const shows = within(screen.getByTestId('house-shows'));
  expect(shows.getByRole('radio', { name: words('house.shows.overview') })).toBeChecked();
  expect(screen.getAllByTestId('lower').map((node) => node.props.children)).toEqual(['the Wall']);
  expect(screen.queryByTestId('pass-section')).toBeNull();
  expect(screen.queryByTestId('to-you')).toBeNull();
  await showSetup();
  // The figures, the Table and the Wall give way to it.
  expect(screen.getAllByTestId('lower').map((node) => node.props.children)).toEqual(['House setup']);
  expect(screen.queryByTestId('house-figures')).toBeNull();
  expect(screen.queryByTestId('house-table')).toBeNull();
  expect(screen.getByTestId('pass-section')).toBeOnTheScreen();
  // You is a tab of its own, not part of House.
  expect(screen.queryByTestId('to-you')).toBeNull();
});

it('shows where the house stands on the House Pass, with the way to its page', async () => {
  await open();
  // This house has the Pass, so it keeps the money and the Table.
  expect(screen.getByTestId('house-figures')).toBeOnTheScreen();
  await showSetup();
  const row = screen.getByTestId('to-pass');
  expect(within(row).getByText(words('house.pass.unlock'))).toBeOnTheScreen();
  // A Founding house has paid for good: no price, just where it stands.
  expect(within(row).getByText(words('house.pass.founding'))).toBeOnTheScreen();
  // Free and House Pass side by side: what's free, then what the Pass adds.
  expect(screen.getByText(words('house.pass.card.label'))).toBeOnTheScreen();
  expect(screen.getByTestId('pass-group-fair')).toHaveTextContent(new RegExp(words('house.pass.card.fair')));
  expect(screen.getByTestId('pass-group-money')).toHaveTextContent(new RegExp(words('house.pass.card.money')));
  expect(screen.queryByTestId('stake-locked')).toBeNull();
});

describe('your month and settling up', () => {
  it('leads with your month so far, the figure green while you are up', async () => {
    await open();
    const money = screen.getByTestId('figure-money');
    expect(money).toHaveTextContent(
      `£3${words('house.page.upIn', { month: 'October' })}${words('house.page.nothingForfeited')}, ${words('house.page.sharedOut', { day: '1 Nov' })}`,
    );
    expect(within(money).getByText('£3')).toHaveStyle({ color: BIN_NIGHT.light.good });
  });

  it('says what you are down in plain ink, with what it cost you', async () => {
    (loadStake as jest.Mock).mockResolvedValue(stakeRead([entry(1, 'priya', 'forfeit', -300, '2026-10')]));
    await open();
    const money = screen.getByTestId('figure-money');
    expect(money).toHaveTextContent(
      `£3${words('house.page.downIn', { month: 'October' })}${words('house.page.forfeited', { amount: '£3' })}, ${words('house.page.sharedOut', { day: '1 Nov' })}`,
    );
    // Green is for what you're up only: money lost is said in words, not in colour.
    expect(within(money).getByText('£3')).not.toHaveStyle({ color: BIN_NIGHT.light.good });
  });

  it('says when nothing has been forfeited at all, with nothing to settle', async () => {
    (loadStake as jest.Mock).mockResolvedValue(stakeRead([]));
    await open();
    expect(screen.getByTestId('figure-money')).toHaveTextContent(
      `£0${words('house.page.forfeitedIn', { month: 'October' })}${words('house.page.sharedOutAlone', { day: '1 Nov' })}`,
    );
    expect(screen.queryByTestId('settle-up')).toBeNull();
  });

  it('opens Stake history from your month', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('figure-money'));
    expect(screen).toHavePathname('/house/stake');
  });

  it('marks what is owed to you received, from the month it is from', async () => {
    await open();
    const transfer = screen.getByTestId('transfer');
    expect(transfer).toHaveTextContent(
      new RegExp(`${words('house.page.owesYouFor', { name: 'Sam', amount: '£4', months: 'September' })}${words('house.page.paidHowYouLike')}`),
    );
    // It shows the amount beside the row, and names who paid to a screen reader.
    expect(within(transfer).getByText(words('house.page.markReceived', { amount: '£4' }))).toBeOnTheScreen();
    await fireEvent.press(within(transfer).getByRole('button', { name: words('house.page.markReceivedFrom', { name: 'Sam', amount: '£4' }) }));
    expect(confirmPayment).toHaveBeenCalledWith('h1', 'sam', 400);
  });

  it('in a Splitwise house, copies the amount across and marks it added there', async () => {
    const base = await (loadHouse as jest.Mock)();
    (loadHouse as jest.Mock).mockResolvedValue({ ...base, house: { ...base.house, settleIn: 'splitwise' } });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await open();
    const transfer = screen.getByTestId('transfer');
    expect(transfer).toHaveTextContent(new RegExp(words('house.page.splitwiseHow', { name: 'Sam' })));
    expect(within(transfer).getByText(words('house.page.splitwiseDescriptionFor', { months: 'September' }))).toBeOnTheScreen();
    // The bare amount, which is what Splitwise's amount box takes.
    await fireEvent.press(within(transfer).getByRole('button', { name: words('house.page.copyAmountFrom', { name: 'Sam', amount: '£4' }) }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('4');
    await fireEvent.press(screen.getByRole('button', { name: words('house.page.openSplitwise') }));
    expect(openURL).toHaveBeenCalledWith('https://secure.splitwise.com/');
    expect(within(transfer).queryByText(words('house.page.markReceived', { amount: '£4' }))).toBeNull();
    await fireEvent.press(within(transfer).getByRole('button', { name: words('house.page.addedToSplitwiseFrom', { name: 'Sam', amount: '£4' }) }));
    expect(confirmPayment).toHaveBeenCalledWith('h1', 'sam', 400, 'splitwise');
    openURL.mockRestore();
  });

  it('says why marking it received was refused', async () => {
    (confirmPayment as jest.Mock).mockRejectedValue(new Error('Only the one who was paid can mark it received.'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('house.page.markReceivedFrom', { name: 'Sam', amount: '£4' }) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the one who was paid can mark it received.');
  });

  it('what you owe waits on them, with nothing to press', async () => {
    (loadStake as jest.Mock).mockResolvedValue(
      stakeRead([entry(2, 'priya', 'forfeit', -400, '2026-09'), entry(1, 'sam', 'share', 400, '2026-09')], ['2026-09']),
    );
    await open();
    const transfer = screen.getByTestId('transfer');
    expect(transfer).toHaveTextContent(
      new RegExp(`${words('house.page.youOweFor', { name: 'Sam', amount: '£4', months: 'September' })}${words('house.page.waitingFor', { name: 'Sam' })}`),
    );
    expect(within(transfer).queryByRole('button')).toBeNull();
  });

  it('offers no button for what someone who has left owes, and makes the next one amber', async () => {
    (loadStake as jest.Mock).mockResolvedValue(
      stakeRead(
        [
          entry(3, 'ben', 'forfeit', -200, '2026-09'),
          entry(2, 'sam', 'forfeit', -400, '2026-09'),
          entry(1, 'priya', 'share', 600, '2026-09'),
        ],
        ['2026-09'],
      ),
    );
    await open();
    const transfers = screen.getAllByTestId('transfer');
    const gone = transfers.find((t) => within(t).queryByText(words('house.page.gone')))!;
    expect(gone).toHaveTextContent(new RegExp(words('house.page.owesYou', { name: words('common.shell.formerHousemate'), amount: '£2' })));
    expect(within(gone).queryByRole('button')).toBeNull();
    // The one amber button is Sam's, the only one the database would take.
    expect(screen.getAllByRole('button', { name: /^Mark/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: words('house.page.markReceivedFrom', { name: 'Sam', amount: '£4' }) })).toHaveStyle({
      backgroundColor: BIN_NIGHT.light.hivis,
    });
  });

  it('leads to Stake history from settling up', async () => {
    await open();
    await fireEvent.press(within(screen.getByTestId('to-stake')).getByRole('link'));
    expect(screen).toHavePathname('/house/stake');
    expect(screen.getByText('Stake page')).toBeOnTheScreen();
  });

  it("says when it can't read the Stake, and tries again", async () => {
    (loadStake as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent(words('house.page.stakeUnreadable'));
    await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
    await waitFor(() => expect(screen.getByTestId('figure-money')).toHaveTextContent(new RegExp(words('house.page.upIn', { month: 'October' }))));
  });
});

describe('the Table', () => {
  it('ranks the week, you first with what you hold and the month money', async () => {
    await open();
    const standings = screen.getAllByTestId('standing');
    expect(standings).toHaveLength(2);
    expect(standings[0]).toHaveTextContent(new RegExp(`${words('house.page.you')}3 pts, ${words('house.page.streak', { weeks: 3 })}\\+£3`));
    // Sam's late John in the month comes before his streak, and leaves no room for it.
    expect(standings[1]).toHaveTextContent(new RegExp(`Sam0 pts,${lateMissedLine(1, 0, words)} in Oct−£3`));
    expect(within(standings[1]).getByText(lateMissedLine(1, 0, words))).toHaveStyle({ color: BIN_NIGHT.light.hazard });
  });

  it('sets your own late and missed and money lost in ink on your tinted row', async () => {
    (loadStake as jest.Mock).mockResolvedValue(stakeRead([entry(1, 'priya', 'forfeit', -100, '2026-10')]));
    (loadTable as jest.Mock).mockResolvedValue({
      month: '2026-10',
      monthTable: [
        { userId: 'priya', points: 9, done: 3, late: 1, missed: 0, rank: 1 },
        { userId: 'sam', points: 2, done: 1, late: 0, missed: 0, rank: 2 },
      ],
      balances: [],
    });
    await open();
    const you = screen.getAllByTestId('standing')[0];
    expect(you).toHaveStyle({ backgroundColor: BIN_NIGHT.light.secondary });
    // Hazard words need the card colour behind them: on the tint they're ink, beside their mark.
    expect(within(you).getByText(lateMissedLine(1, 0, words))).not.toHaveStyle({ color: BIN_NIGHT.light.hazard });
    expect(within(you).getByText('−£1')).toHaveStyle({ color: BIN_NIGHT.light.foreground });
    expect(within(you).getByLabelText(words('house.page.losing', { amount: '−£1' }))).toBeOnTheScreen();
  });

  it('says more about each housemate where the row is wider', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
    await open();
    expect(screen.getAllByTestId('standing')[1]).toHaveTextContent(
      new RegExp(`Sam0 pts,${lateMissedLine(1, 0, words)} in Oct, ${words('house.page.streak', { weeks: 5 })}−£3`),
    );
  });

  it('shows the month from the menu in its header, and back', async () => {
    await open();
    expect(screen.getByTestId('table-span')).toHaveTextContent(words('house.page.week'));
    await showSpan('October');
    expect(screen.getByTestId('table-span')).toHaveTextContent('October');
    const month = screen.getAllByTestId('standing');
    expect(month[0]).toHaveTextContent(new RegExp(`Sam12 pts,${lateMissedLine(1, 0, words)} in Oct−£3`));
    expect(month[1]).toHaveTextContent(new RegExp(`${words('house.page.you')}9 pts`));
    await showSpan(words('house.page.week'));
    expect(screen.getAllByTestId('standing')[0]).toHaveTextContent(/3 pts/);
  });

  it("opens a housemate's page", async () => {
    await open();
    await fireEvent.press(within(screen.getAllByTestId('standing')[1]).getByRole('link'));
    expect(screen).toHavePathname('/house/people/sam');
    expect(screen.getByText('Person page')).toBeOnTheScreen();
  });

  it("says when it can't read the month's Table", async () => {
    (loadTable as jest.Mock).mockRejectedValue(new Error('offline'));
    await open();
    // With no Table read, the menu offers this month on the house's clock, whenever the test runs.
    await showSpan(monthWord(monthOf(new Date(), 'Europe/London'), words));
    expect(screen.getByRole('alert')).toHaveTextContent(words('house.page.tableUnreadable'));
  });

  it('shares the join code and the link to it', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    expect(screen.getByTestId('invite-code')).toHaveTextContent('AB3DEF7H');
    expect(screen.getByTestId('invite-url')).toHaveTextContent(/\/join\/AB3DEF7H$/);
    await fireEvent.press(screen.getByTestId('share-invite'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: words('door.invite.shareTitle', { house: 'Flat 3' }) }));
  });

  it('leaves copying to the share sheet on a phone, which has no clipboard of its own here', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    expect(screen.getByTestId('share-invite')).toBeOnTheScreen();
    expect(screen.queryByTestId('copy-link')).toBeNull();
  });

  it('copies the link on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    await fireEvent.press(screen.getByTestId('copy-link'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/join/AB3DEF7H'));
    expect(await screen.findByText(words('door.invite.copied'))).toBeOnTheScreen();
  });

  it('copies the link from Share invite in a browser with no share sheet', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const share = jest.spyOn(Share, 'share');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText }, share: undefined });
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    await fireEvent.press(screen.getByTestId('share-invite'));
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/join/AB3DEF7H'));
    expect(await screen.findByText(words('door.invite.copied'))).toBeOnTheScreen();
  });

  it('gives an admin a new code, and reads the house again to show it', async () => {
    (resetJoinCode as jest.Mock).mockResolvedValue(undefined);
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    expect(screen.getByText(words('door.invite.newCodeNote'))).toBeOnTheScreen();
    const reads = (loadHouse as jest.Mock).mock.calls.length;
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...snapshot().house, joinCode: 'ZX9KPQ2M' } }));
    await fireEvent.press(screen.getByTestId('new-code'));
    expect(resetJoinCode).toHaveBeenCalledWith('h1');
    await waitFor(() => expect(screen.getByTestId('invite-code')).toHaveTextContent('ZX9KPQ2M'));
    expect((loadHouse as jest.Mock).mock.calls.length).toBeGreaterThan(reads);
  });

  it("doesn't offer a housemate a new code", async () => {
    const members = snapshot().members.map((m) => ({ ...m, role: m.userId === 'priya' ? ('member' as const) : ('admin' as const) }));
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ members }));
    await open();
    await fireEvent.press(screen.getByTestId('invite'));
    expect(screen.getByTestId('share-invite')).toBeOnTheScreen();
    expect(screen.queryByTestId('new-code')).toBeNull();
  });

  it('says how points and the stake work, in the house’s own numbers', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('how-it-works'));
    for (const rule of stakeRules(snapshot().rules, 100, words)) expect(screen.getByText(rule.body)).toBeOnTheScreen();
  });
});

it('reads the house again each time House comes into view', async () => {
  await renderPages(
    {
      '(tabs)/_layout': () => (
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="house" />
          <Tabs.Screen name="week" />
        </Tabs>
      ),
      '(tabs)/house': HouseScreen,
      '(tabs)/week': () => <Text>Week screen</Text>,
    },
    '/house',
  );
  await untilRead(words);
  await waitFor(() => expect(screen.getByTestId('figure-stake')).toHaveTextContent(new RegExp('^£20')));
  // Someone else changes the stake while you're on another tab.
  (loadHouse as jest.Mock).mockResolvedValue(snapshot({ rules: { ...snapshot().rules, stakeMinor: 2500 } }));
  await act(() => router.navigate('/week'));
  await act(() => router.navigate('/house'));
  await waitFor(() => expect(screen.getByTestId('figure-stake')).toHaveTextContent(new RegExp('^£25')));
});

it("says when it can't read the house, and tries again", async () => {
  (loadHouse as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await renderPages({ 'house/index': HouseScreen }, '/house');
  expect(await screen.findByRole('alert')).toHaveTextContent(words('common.shell.unreadable'));
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
  expect(await screen.findByRole('header', { name: 'Flat 3' })).toBeOnTheScreen();
});

describe('on a laptop', () => {
  beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 }));

  it('puts the figures across the top, then the Table beside the Wall', async () => {
    await open();
    expect(screen.getByTestId('house-figures')).toBeOnTheScreen();
    expect(within(screen.getByTestId('house-pair-start')).getByTestId('house-table')).toBeOnTheScreen();
    expect(within(screen.getByTestId('house-pair-end')).getAllByTestId('lower').map((node) => node.props.children)).toEqual([
      'the Wall',
    ]);
  });

  it('leaves the setup and the Pass to the list of House’s pages beside it', async () => {
    await open({ workspace: true });
    expect(screen.getByTestId('house-nav')).toBeOnTheScreen();
    expect(screen.getAllByTestId('lower').map((node) => node.props.children)).toEqual(['the Wall']);
    // Free and House Pass stays on the page, under the Table and the Wall.
    expect(screen.getByTestId('pass-section')).toBeOnTheScreen();
    expect(screen.queryByTestId('to-you')).toBeNull();
    // The list is the way to them, so there's no switch.
    expect(screen.queryByTestId('house-shows')).toBeNull();
    // You is the rail's last place, not one of House's pages.
    expect(screen.queryByTestId('nav-you')).toBeNull();
  });

});
