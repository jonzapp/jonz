import { pocketView, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { boardTick } from '@/api/johns';
import { loadPocket } from '@/api/pocket';
import BoardScreen from '@/app/(house)/house/board';
import { assignment, snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/johns', () => ({ boardTick: jest.fn() }));
jest.mock('@/api/pocket', () => ({ loadPocket: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
const mockOpen = jest.fn();
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: mockOpen, close: jest.fn() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

let mockMe = 'priya';
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMe } }, house: { id: 'h1', name: 'The Parks' }, refresh: jest.fn() }),
}));

const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/** A family: Priya the parent, Sam and Maya the kids. Overdue and just-done Johns are "today" whenever the tests run. */
function family(kind: 'family' | 'housemates' = 'family') {
  const base = snapshot();
  return snapshot({
    house: { ...base.house, name: 'The Parks', kind, pocketCapMinor: 1000 },
    rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
    members: [
      ...base.members,
      { userId: 'maya', name: 'Maya Park', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } },
    ],
    assignments: [
      assignment({ id: 'p1', user_id: 'priya', name: 'Cook tea', due_at: at(-1) }),
      assignment({ id: 's1', user_id: 'sam', name: 'Feed the fish', due_at: at(-1), pay_minor: 20 }),
      assignment({ id: 's2', user_id: 'sam', name: 'Bins out', due_at: at(-2), done_at: at(0), awaits_ok: true }),
      assignment({ id: 'm1', user_id: 'maya', name: 'Lay the table', due_at: at(-1), needs_photo: true }),
    ],
  });
}

async function open() {
  await renderPages({ 'house/board': BoardScreen }, '/house/board');
  await untilRead();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe = 'priya';
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768, scale: 2, fontScale: 1 });
  (loadHouse as jest.Mock).mockResolvedValue(family());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadPocket as jest.Mock).mockResolvedValue(
    pocketView({ earnings: [{ user_id: 'sam', month: '2026-10', amount_minor: 270 }], pays: [], kids: ['sam', 'maya'], month: '2026-10' }),
  );
  (boardTick as jest.Mock).mockResolvedValue(undefined);
});

describe('the board', () => {
  it("gives each kid a column of today's Johns, and none for a parent", async () => {
    await open();
    const columns = await screen.findAllByTestId('board-kid');
    expect(columns).toHaveLength(2);
    const [sam, maya] = columns.map((c) => within(c));
    expect(sam.getByText('Sam')).toBeOnTheScreen();
    expect(sam.getByText('Feed the fish')).toBeOnTheScreen();
    expect(sam.getByText(words('today.board.waits'))).toBeOnTheScreen();
    expect(maya.getByText(words('today.board.photo'))).toBeOnTheScreen();
    expect(screen.queryByText('Cook tea')).toBeNull();
  });

  it("ticks a kid's John from the box, and opens its sheet from the row", async () => {
    await open();
    await fireEvent.press(await screen.findByRole('checkbox', { name: words('today.board.tick', { kid: 'Sam', john: 'Feed the fish' }) }));
    await waitFor(() => expect(boardTick).toHaveBeenCalledWith('s1'));
    await fireEvent.press(screen.getByText('Lay the table'));
    expect(mockOpen).toHaveBeenCalledWith('m1');
  });

  it("is a parent's, in a family", async () => {
    mockMe = 'sam';
    await open();
    expect(await screen.findByText(words('today.board.parentsOnly'))).toBeOnTheScreen();
    expect(screen.queryByTestId('board-kid')).toBeNull();
  });
});
