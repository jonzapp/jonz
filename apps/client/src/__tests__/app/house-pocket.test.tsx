import { buildStake, pocketView, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Text, useWindowDimensions } from 'react-native';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { addKid } from '@/api/kids';
import { loadPocket, payPocketMoney } from '@/api/pocket';
import { loadJohnList } from '@/api/settings';
import { loadStake } from '@/api/stake';
import { loadTable } from '@/api/table';
import HouseScreen from '@/app/(house)/house';
import PocketScreen from '@/app/(house)/house/pocket';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';
import { NOW } from '@/testing/clock';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ loadAway: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/kids', () => ({ addKid: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/table', () => ({ loadTable: jest.fn() }));
jest.mock('@/api/pocket', () => ({ loadPocket: jest.fn(), payPocketMoney: jest.fn() }));
jest.mock('@/api/settings', () => ({ resetJoinCode: jest.fn(), loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
// The Wall's latest and the lower sections have their own tests.
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

let mockMe = 'priya';
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMe } }, house: { id: 'h1', name: 'The Parks' }, refresh: jest.fn() }),
}));

/** A family: Priya the parent, Sam and Maya the kids. Sam earned £5 in September, unpaid. */
function family() {
  const base = snapshot();
  return snapshot({
    house: { ...base.house, name: 'The Parks', kind: 'family', pocketCapMinor: 1000 },
    rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
    members: [
      ...base.members,
      { userId: 'maya', name: 'Maya', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } },
    ],
  });
}

const POCKET = pocketView({
  earnings: [
    { user_id: 'sam', month: '2026-09', amount_minor: 500 },
    { user_id: 'sam', month: '2026-10', amount_minor: 270 },
    { user_id: 'maya', month: '2026-10', amount_minor: 450 },
  ],
  pays: [],
  kids: ['sam', 'maya'],
  month: '2026-10',
});

async function open(path = '/house') {
  await renderPages(
    {
      'house/index': HouseScreen,
      'house/pocket': PocketScreen,
      'house/stake': () => <Text>Stake page</Text>,
      'house/people/[userId]': () => <Text>Person page</Text>,
    },
    path,
  );
  await untilRead(words);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe = 'priya';
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 360, height: 780, scale: 2, fontScale: 1 });
  (loadHouse as jest.Mock).mockResolvedValue(family());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadTable as jest.Mock).mockResolvedValue({
    month: '2026-10',
    monthTable: [
      { userId: 'maya', points: 4, done: 2, late: 0, missed: 0, rank: 1 },
      { userId: 'priya', points: 3, done: 1, late: 0, missed: 0, rank: 2 },
      { userId: 'sam', points: 2, done: 1, late: 0, missed: 0, rank: 3 },
    ],
    balances: [],
  });
  (loadStake as jest.Mock).mockResolvedValue({
    ...buildStake({ ledger: [], closedMonths: [], memberIds: ['priya', 'sam', 'maya'], stakeMinor: 0, month: '2026-10' }),
    ledger: [],
    closedMonths: [],
  });
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-26', periods: [] });
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  (loadPocket as jest.Mock).mockResolvedValue(POCKET);
  (payPocketMoney as jest.Mock).mockResolvedValue(500);
});

describe("a family's House", () => {
  it('shows the month so far and Pay day in place of the Stake', async () => {
    await open();
    const card = within(await screen.findByTestId('pocket'));
    expect(card.getByTestId('pocket-so-far')).toHaveTextContent('£7.20 earned so far');
    expect(card.getByText(/Pay day is 1 /)).toBeOnTheScreen();
    expect(screen.getByTestId('family-line')).toHaveTextContent('1 parent, 2 kids, up to £10 a month each');
    expect(screen.queryByTestId('house-figures')).toBeNull();
  });

  it("lets a parent say they've paid a kid for a month that's over", async () => {
    await open();
    expect(await screen.findByText('Pay Sam £5 for September')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Paid Sam £5' }));
    await waitFor(() => expect(payPocketMoney).toHaveBeenCalledWith('h1', 'sam', '2026-09'));
  });

  it("shows a kid only their own, with no button", async () => {
    mockMe = 'maya';
    await open();
    await screen.findByTestId('pocket');
    expect(screen.queryByText('Pay Sam £5 for September')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paid Sam £5' })).toBeNull();
  });

  it('lists only the kids on the Table, with what each has earned this month', async () => {
    await open();
    const table = within(await screen.findByTestId('house-table'));
    await waitFor(() => expect(table.getAllByTestId('standing')).toHaveLength(2));
    const rows = table.getAllByTestId('standing');
    expect(rows.map((r) => within(r).queryByText('£2.70') ?? within(r).queryByText('£4.50'))).not.toContain(null);
    expect(table.queryByText('Priya')).toBeNull();
    expect(table.getByText(words('house.pocket.howItWorks'))).toBeOnTheScreen();
  });
});

describe('adding a child', () => {
  it("is a parent's, from the Table: a name and the year they were born", async () => {
    (addKid as jest.Mock).mockResolvedValue('kit');
    await open();
    await fireEvent.press(await screen.findByTestId('add-a-child'));
    const form = within(screen.getByTestId('add-kid-form'));
    await fireEvent.changeText(form.getByTestId('kid-name'), 'Kit Park');
    await fireEvent.changeText(form.getByTestId('kid-born'), '20');
    await fireEvent.press(form.getByTestId('add-kid'));
    expect(form.getByText(words('people.kids.problems.born'))).toBeOnTheScreen();
    expect(addKid).not.toHaveBeenCalled();
    await fireEvent.changeText(form.getByTestId('kid-born'), String(new Date(NOW).getFullYear() - 7));
    await fireEvent.press(form.getByTestId('add-kid'));
    await waitFor(() => expect(addKid).toHaveBeenCalledWith(expect.any(String), 'Kit Park', new Date(NOW).getFullYear() - 7));
  });

  it("isn't offered to a kid", async () => {
    mockMe = 'maya';
    await open();
    await screen.findByTestId('house-table');
    expect(screen.queryByTestId('add-a-child')).toBeNull();
  });

  it("gives a kid one short page: no switch, no invite, no Pass, the family's setup under the Wall", async () => {
    mockMe = 'maya';
    await open();
    await screen.findByTestId('house-table');
    expect(screen.queryByTestId('house-shows')).toBeNull();
    expect(screen.queryByTestId('invite')).toBeNull();
    expect(screen.queryByTestId('pass-section')).toBeNull();
    expect(screen.getAllByTestId('lower').map((node) => node.props.children)).toContain('House setup');
    expect(screen.queryByTestId('to-you')).toBeNull();
  });

  it('gives a parent the switch, with the invite on the Table', async () => {
    await open();
    await screen.findByTestId('house-table');
    expect(screen.getByTestId('house-shows')).toBeOnTheScreen();
    expect(screen.getByTestId('invite')).toBeOnTheScreen();
  });
});

describe('Pocket money history', () => {
  it('lists each month, newest first, with what is still to pay', async () => {
    await open('/house/pocket');
    const months = await screen.findAllByTestId('pocket-month');
    expect(months).toHaveLength(2);
    expect(within(months[1]).getByText('£5 still to pay')).toBeOnTheScreen();
  });
});
