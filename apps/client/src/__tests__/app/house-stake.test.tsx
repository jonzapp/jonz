import { buildStake, FOCUS_SHELL_COPY, type HistoryRow, SECTION_LABEL, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { loadStake, type StakeRead } from '@/api/stake';
import StakeScreen from '@/app/(house)/house/stake';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(), confirmPayment: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

function entry(
  id: number,
  userId: string,
  kind: string,
  amountMinor: number,
  month: string,
  rest: Partial<HistoryRow> = {},
): HistoryRow {
  return {
    id,
    user_id: userId,
    kind,
    amount_minor: amountMinor,
    month,
    counterparty_user_id: null,
    created_at: '2026-10-01T09:00:00Z',
    john: null,
    ...rest,
  };
}

/** The Stake as the page reads it: whatever buildStake makes of the ledger, and the ledger itself. */
function stakeRead(ledger: HistoryRow[], closedMonths: string[] = []): StakeRead {
  const built = buildStake({ ledger, closedMonths, memberIds: ['priya', 'sam'], stakeMinor: 2000, month: '2026-10' });
  return { ...built, ledger, closedMonths };
}

/** September closed and was shared out; this month Sam has been late and missed one. */
const LEDGER = [
  entry(5, 'sam', 'forfeit', -100, '2026-10', {
    created_at: '2026-10-21T08:00:00Z',
    john: { name: 'Bins out', outcome: 'late', due_at: '2026-10-20T19:00:00Z' },
  }),
  entry(4, 'priya', 'forfeit', -300, '2026-10', {
    created_at: '2026-10-19T08:00:00Z',
    john: { name: 'Wipe the hob', outcome: 'missed', due_at: '2026-10-18T19:00:00Z' },
  }),
  entry(3, 'sam', 'payment', 400, '2026-10', { counterparty_user_id: 'priya', created_at: '2026-10-12T10:00:00Z' }),
  entry(2, 'priya', 'payment', -400, '2026-10', { counterparty_user_id: 'sam', created_at: '2026-10-12T10:00:00Z' }),
  entry(1, 'priya', 'share', 400, '2026-09'),
];

async function open() {
  await renderPages({ 'house/stake': StakeScreen, 'house/index': () => null }, '/house/stake');
  await untilRead();
  await waitFor(() => expect(screen.queryByLabelText(words('house.page.readingStake'))).toBeNull());
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadStake as jest.Mock).mockResolvedValue(stakeRead(LEDGER, ['2026-09']));
});

it('names the page and the stake, with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('house.stake.title') })).toBeOnTheScreen();
  expect(bar.getByText(words('house.stake.sub', { stake: '£20' }))).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) })).toBeOnTheScreen();
});

it('starts on yours: your entries by month, each said in words', async () => {
  await open();
  expect(screen.getAllByTestId('ledger-month').map((month) => within(month).getByRole('header').props.children)).toEqual([
    'October 2026',
    'September 2026',
  ]);
  const [missed, payment, share] = screen.getAllByTestId('ledger-entry');
  expect(missed).toHaveTextContent(new RegExp(`Wipe the hob${words('house.stake.missed')}, Sun 18 Oct−£3`));
  // A payment's amount unsigned: the ledger's sign would read being paid as a loss.
  expect(payment).toHaveTextContent(
    new RegExp(`${words('house.stake.paid', { from: 'Sam', to: words('house.stake.yourself') })}${words('house.stake.received', { day: 'Mon 12 Oct' })}£4$`),
  );
  expect(share).toHaveTextContent(new RegExp(`${words('house.stake.share')}Thu 1 Oct\\+£4`));
});

it("shows the whole house's, each entry naming whose it is and a payment once", async () => {
  await open();
  await fireEvent.press(screen.getByRole('radio', { name: words('house.stake.whole') }));
  const entries = screen.getAllByTestId('ledger-entry');
  expect(entries[0]).toHaveTextContent(new RegExp(`Bins outSam, ${words('house.stake.late').toLowerCase()}, Tue 20 Oct−£1`));
  expect(entries[1]).toHaveTextContent(/Wipe the hobYou, missed, Sun 18 Oct−£3/);
  // A payment you're in, from your side.
  expect(entries[2]).toHaveTextContent(new RegExp(`${words('house.stake.paid', { from: 'Sam', to: words('house.stake.yourself') })}${words('house.stake.received', { day: 'Mon 12 Oct' })}£4$`));
  // The payment's other side isn't a second entry.
  expect(entries).toHaveLength(4);
});

it("keeps the amount of a payment between two others to them", async () => {
  (loadStake as jest.Mock).mockResolvedValue(
    stakeRead([
      entry(2, 'sam', 'payment', 250, '2026-10', { counterparty_user_id: 'ben', created_at: '2026-10-12T10:00:00Z' }),
      entry(1, 'ben', 'payment', -250, '2026-10', { counterparty_user_id: 'sam', created_at: '2026-10-12T10:00:00Z' }),
    ]),
  );
  await open();
  await fireEvent.press(screen.getByRole('radio', { name: words('house.stake.whole') }));
  const payment = screen.getByTestId('ledger-entry');
  expect(payment).toHaveTextContent(new RegExp(`^${words('house.stake.paid', { from: 'Sam', to: words('house.page.formerHousemate') })}`));
  expect(payment).not.toHaveTextContent(/£/);
});

it('says when nothing of yours is in the ledger, and the whole house still is', async () => {
  (loadStake as jest.Mock).mockResolvedValue(stakeRead([LEDGER[0]]));
  await open();
  expect(screen.getByText(words('house.stake.emptyMine'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: words('house.stake.whole') }));
  expect(screen.getByTestId('ledger-entry')).toHaveTextContent(/Bins out/);
});

it('says when the ledger is empty, with nothing to switch', async () => {
  (loadStake as jest.Mock).mockResolvedValue(stakeRead([]));
  await open();
  expect(screen.getByText(words('house.stake.empty'))).toBeOnTheScreen();
  expect(screen.getByText(words('house.stake.emptyBody'))).toBeOnTheScreen();
  expect(screen.queryByTestId('stake-span')).toBeNull();
});

it("says when it can't read the Stake, and tries again", async () => {
  (loadStake as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await renderPages({ 'house/stake': StakeScreen }, '/house/stake');
  expect(await screen.findByRole('alert')).toHaveTextContent(words('house.page.stakeUnreadable'));
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.retry }));
  expect(await screen.findAllByTestId('ledger-entry')).not.toHaveLength(0);
});
