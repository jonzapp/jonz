import { buildStake, type HistoryRow, wordsFor, lateMissedLine } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { removeMember, setRole } from '@/api/settings';
import { loadStake, type StakeRead } from '@/api/stake';
import { loadTable } from '@/api/table';
import PersonScreen from '@/app/(house)/house/people/[userId]';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ loadAway: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({ setRole: jest.fn(), removeMember: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/table', () => ({ loadTable: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const mockMembership = { userId: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMembership.userId } }, house: { id: 'h1', name: 'Flat 3' } }),
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

/** The Stake as the page reads it: Sam £3 down this month, and £4 owed to you from September. */
function stakeRead(): StakeRead {
  const ledger = [
    entry(3, 'sam', 'forfeit', -300, '2026-10'),
    entry(2, 'sam', 'forfeit', -400, '2026-09'),
    entry(1, 'priya', 'share', 400, '2026-09'),
  ];
  const closedMonths = ['2026-09'];
  return { ...buildStake({ ledger, closedMonths, memberIds: ['priya', 'sam'], stakeMinor: 2000, month: '2026-10' }), ledger, closedMonths };
}

async function open(person: string, as: 'priya' | 'sam' = 'priya') {
  mockMembership.userId = as;
  await renderPages({ 'house/people/[userId]': PersonScreen }, `/house/people/${person}`);
  await untilRead(words);
  await waitFor(() => expect(screen.queryByLabelText(words('house.page.readingStake'))).toBeNull());
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadTable as jest.Mock).mockResolvedValue({
    month: '2026-10',
    monthTable: [
      { userId: 'sam', points: 12, done: 4, late: 1, missed: 1, rank: 1 },
      { userId: 'priya', points: 9, done: 3, late: 0, missed: 0, rank: 2 },
    ],
    balances: [
      { userId: 'sam', balance: -3, weeksToEven: 2 },
      { userId: 'priya', balance: 0, weeksToEven: 0 },
    ],
  });
  (loadStake as jest.Mock).mockResolvedValue(stakeRead());
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-26', periods: [] });
  for (const move of [setRole, removeMember]) (move as jest.Mock).mockResolvedValue(undefined);
});

it('names the housemate in the title bar, with the way back to House', async () => {
  await open('sam');
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: 'Sam' })).toBeOnTheScreen();
  expect(bar.getByText(words('people.person.role', { role: 'member' }))).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.house') }) })).toBeOnTheScreen();
});

it('shows their week and month, and where they stand against their share', async () => {
  await open('sam');
  const record = within(screen.getByTestId('person-record'));
  expect(record.getByText(words('people.person.thisWeek'))).toBeOnTheScreen();
  expect(record.getByText(lateMissedLine(1, 1, words))).toBeOnTheScreen();
  const share = within(screen.getByTestId('person-share'));
  expect(share.getByText(words('people.person.behind', { points: '3', you: false }))).toBeOnTheScreen();
  expect(share.getByText(words('people.person.catchingUp', { weeks: 2 }))).toBeOnTheScreen();
});

it('says being level with your share in words alone, with no bare figure after them', async () => {
  await open('priya');
  expect(screen.getByTestId('person-share')).toHaveTextContent(new RegExp(`${words('people.person.level', { you: true })}${words('people.person.sinceJoining')}$`));
});

it('counts someone dealt nothing lately as level, rather than reading for ever', async () => {
  (loadTable as jest.Mock).mockResolvedValue({ month: '2026-10', monthTable: [], balances: [] });
  await open('sam');
  const share = within(screen.getByTestId('person-share'));
  expect(share.getByText(words('people.person.level', { you: false }))).toBeOnTheScreen();
  expect(share.queryByLabelText(words('house.page.readingTable'))).toBeNull();
});

it('shows the month’s money, and apart from it what they owe from a closed month', async () => {
  await open('sam');
  const money = within(screen.getByTestId('person-money'));
  expect(money.getByText(words('people.person.forfeited'))).toBeOnTheScreen();
  expect(money.getByText(words('people.person.net'))).toBeOnTheScreen();
  // September's debt isn't October's: it has its own section.
  expect(money.queryByTestId('person-owing')).toBeNull();
  const settling = within(screen.getByTestId('person-settling'));
  expect(settling.getByRole('header', { name: words('people.person.settling') })).toBeOnTheScreen();
  expect(settling.getByTestId('person-owing')).toHaveTextContent(
    new RegExp(
      `${words('house.page.owesYouFor', { name: 'Sam', amount: '£4', months: 'September' })}${words('house.page.paidHowYouLike')}`,
    ),
  );
});

it('has no settling up when nothing is owed', async () => {
  const ledger = [entry(1, 'sam', 'forfeit', -300, '2026-10')];
  (loadStake as jest.Mock).mockResolvedValue({
    ...buildStake({ ledger, closedMonths: [], memberIds: ['priya', 'sam'], stakeMinor: 2000, month: '2026-10' }),
    ledger,
    closedMonths: [],
  });
  await open('sam');
  expect(screen.getByTestId('person-money')).toBeOnTheScreen();
  expect(screen.queryByTestId('person-settling')).toBeNull();
});

it('shows their streak and tokens, and their time away', async () => {
  (loadAway as jest.Mock).mockResolvedValue({
    today: '2026-10-26',
    periods: [{ id: 'p1', userId: 'sam', startsOn: '2026-10-28', endsOn: '2026-10-31', note: 'Cork' }],
  });
  await open('sam');
  expect(within(screen.getByTestId('person-perks')).getByText(words('people.person.noStreak'))).toBeOnTheScreen();
  expect(screen.getByTestId('person-away')).toHaveTextContent(/28–31 Oct/);
});

it('says so in a sentence when they have no time away booked, as an empty group does anywhere', async () => {
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-26', periods: [] });
  await open('sam');
  const away = within(screen.getByTestId('person-away'));
  expect(away.getByText(words('people.person.noAway'))).toBeOnTheScreen();
  expect(away.queryByRole('button')).toBeNull();
});

it('lets an admin make them an admin, and says why a change was refused', async () => {
  await open('sam');
  await fireEvent.press(screen.getByTestId('toggle-admin'));
  expect(setRole).toHaveBeenCalledWith('h1', 'sam', 'admin');
  (setRole as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
  await fireEvent.press(screen.getByTestId('toggle-admin'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only the house admins can do that.');
});

it('asks before removing them from the house', async () => {
  await open('sam');
  await fireEvent.press(screen.getByTestId('remove-person'));
  expect(removeMember).not.toHaveBeenCalled();
  expect(screen.getByText(words('people.person.removeBody', { name: 'Sam' }))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: words('people.person.removeConfirm', { name: 'Sam' }) }));
  expect(removeMember).toHaveBeenCalledWith('h1', 'sam');
});

it('offers nothing to change on your own page, or to anyone who is not an admin', async () => {
  await open('priya');
  expect(screen.getByRole('header', { name: words('people.person.yourRecord') })).toBeOnTheScreen();
  expect(screen.queryByTestId('person-admin')).toBeNull();
  await screen.unmount();
  await open('priya', 'sam');
  expect(screen.queryByTestId('person-admin')).toBeNull();
});

it("says so for someone who isn't in the house any more", async () => {
  await open('ben');
  expect(screen.getByText(words('common.shell.gone'))).toBeOnTheScreen();
  expect(screen.queryByTestId('person-record')).toBeNull();
});

it("says when the Stake can't be read, and tries again", async () => {
  (loadStake as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await open('sam');
  expect(await screen.findByRole('alert')).toHaveTextContent(words('house.page.stakeUnreadable'));
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
  expect(await screen.findByText(words('people.person.net'))).toBeOnTheScreen();
});
