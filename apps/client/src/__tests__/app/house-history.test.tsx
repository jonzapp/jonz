import { HISTORY_COPY, historyItems, LIST_COPY, WALL_COPY, type ActionRow } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { loadHistory, undoAction } from '@/api/history';
import { catchUp } from '@/api/house';
import { loadWall } from '@/api/wall';
import HistoryScreen from '@/app/(house)/house/history';
import WallScreen from '@/app/(house)/house/wall';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/history', () => ({ HISTORY_PAGE: 60, loadHistory: jest.fn(), undoAction: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
// History is on the Wall: beside it on a laptop, behind a switch on a phone (as here).
jest.mock('@/api/wall', () => ({ loadWall: jest.fn(), setReaction: jest.fn() }));
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: jest.fn(), close: jest.fn() }) }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

// Thursday 29 October 2026, 9pm in London.
const NOW = new Date('2026-10-29T21:00:00Z');

const row = (overrides: Partial<ActionRow>): ActionRow => ({
  id: 'x',
  kind: 'tick',
  done_by: 'priya',
  subject_user_id: 'priya',
  assignment_id: 'a1',
  ref: null,
  data: { name: 'Bins out' },
  created_at: '2026-10-29T20:04:00Z',
  undone_at: null,
  undone_by: null,
  reach: 'own',
  ...overrides,
});

// Today: Priya's tick (hers to undo), Sam's flag (Priya's as an admin), and
// Sam's tick, already settled past reach. Yesterday: Priya made Sam an admin
// and then took it back.
const ROWS = [
  row({ id: 'h1' }),
  row({ id: 'h2', kind: 'flag', done_by: 'sam', subject_user_id: 'priya', data: { name: 'Recycling' }, created_at: '2026-10-29T19:30:00Z', reach: 'admin' }),
  row({ id: 'h3', done_by: 'sam', subject_user_id: 'sam', data: { name: 'Clean the bath' }, created_at: '2026-10-29T09:12:00Z', reach: null }),
  row({
    id: 'h4',
    kind: 'role',
    subject_user_id: 'sam',
    data: { from: 'member', to: 'admin' },
    created_at: '2026-10-28T18:00:00Z',
    undone_at: '2026-10-28T18:01:00Z',
    undone_by: 'priya',
    reach: null,
  }),
];

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadHistory as jest.Mock).mockResolvedValue(historyItems(ROWS));
  (undoAction as jest.Mock).mockResolvedValue(undefined);
  (loadWall as jest.Mock).mockResolvedValue({ events: [], photos: {}, older: null });
});

afterEach(() => jest.useRealTimers());

/** The Wall, switched to History by an old link to it. */
async function open() {
  await show();
  await screen.findAllByTestId('history-day');
}

async function show() {
  await renderPages({ 'house/wall': WallScreen, 'house/history': HistoryScreen }, '/house/history');
}

it('is on the Wall, switched to History by an old link, and switches back', async () => {
  await open();
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: WALL_COPY.title })).toBeOnTheScreen();
  const switcher = within(screen.getByTestId('wall-shows'));
  expect(switcher.getByRole('radio', { name: HISTORY_COPY.title })).toBeChecked();
  await fireEvent.press(switcher.getByRole('radio', { name: WALL_COPY.title }));
  expect(screen.queryByTestId('history-day')).toBeNull();
  expect(await screen.findByTestId('wall-empty')).toBeOnTheScreen();
});

it('tells every move a day at a time, with Undo only where it still reaches', async () => {
  await open();
  expect(loadHistory).toHaveBeenCalledWith('h1', undefined);
  const [today, yesterday] = screen.getAllByTestId('history-day');
  expect(within(today).getByRole('header', { name: HISTORY_COPY.today })).toBeOnTheScreen();
  expect(within(yesterday).getByRole('header', { name: HISTORY_COPY.yesterday })).toBeOnTheScreen();

  const [mine, flag, settled] = within(today).getAllByTestId('history-row');
  expect(mine).toHaveTextContent(/You ticked Bins out.*20:04/);
  expect(within(mine).getByRole('button', { name: 'Undo: You ticked Bins out' })).toBeOnTheScreen();
  expect(flag).toHaveTextContent(/Sam flagged Recycling.*19:30/);
  expect(within(flag).getByTestId('history-undo')).toBeOnTheScreen();
  expect(settled).toHaveTextContent(/Sam ticked Clean the bath.*09:12, Can’t be undone now/);
  expect(within(settled).queryByTestId('history-undo')).toBeNull();

  const [role] = within(yesterday).getAllByTestId('history-row');
  expect(role).toHaveTextContent(/You made Sam an admin.*18:00, Undone/);
});

it('undoes one and reads History again', async () => {
  await open();
  const [, flag] = screen.getAllByTestId('history-row');
  (loadHistory as jest.Mock).mockClear();
  await fireEvent.press(within(flag).getByTestId('history-undo'));
  expect(undoAction).toHaveBeenCalledWith('h2');
  await waitFor(() => expect(loadHistory).toHaveBeenCalled());
});

it('says a refusal under the row it came from', async () => {
  (undoAction as jest.Mock).mockRejectedValue(new Error('That can’t be undone any more.'));
  await open();
  const [mine] = screen.getAllByTestId('history-row');
  await fireEvent.press(within(mine).getByTestId('history-undo'));
  expect(await screen.findByText('That can’t be undone any more.')).toBeOnTheScreen();
});

it('shows only yours under Mine', async () => {
  await open();
  await fireEvent.press(screen.getByRole('radio', { name: HISTORY_COPY.mine }));
  const rows = screen.getAllByTestId('history-row');
  expect(rows).toHaveLength(2);
  for (const r of rows) expect(r).toHaveTextContent(/You (ticked|made)/);
});

it('says what lands here when nothing has yet', async () => {
  (loadHistory as jest.Mock).mockResolvedValue([]);
  await show();
  expect(await screen.findByTestId('history-empty')).toHaveTextContent(new RegExp(HISTORY_COPY.title));
  // Nothing to say "That's everything" under.
  expect(screen.queryByTestId('history-foot')).toBeNull();
});

it('says when it has everything, under the oldest move', async () => {
  await open();
  expect(screen.getByTestId('history-foot')).toHaveTextContent(LIST_COPY.everything);
});

it('reads older moves as you scroll near the end, from the last one shown', async () => {
  // A full page today, then one move from the day the house started.
  const page = Array.from({ length: 60 }, (_, i) => row({ id: `p${i}`, created_at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString() }));
  const last = new Date(page[59].created_at);
  (loadHistory as jest.Mock).mockImplementation(async (_house: string, before?: Date) =>
    historyItems(before ? [row({ id: 'old', data: { name: 'Dishes' }, created_at: '2026-09-03T10:00:00Z', reach: null })] : page),
  );
  await open();
  expect(screen.getByTestId('history-foot')).toHaveTextContent(/Showing back to Thu 29 Oct/);
  await fireEvent.scroll(screen.getByTestId('page-scroll'), {
    nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 1200 }, layoutMeasurement: { height: 800 } },
  });
  await waitFor(() => expect(loadHistory).toHaveBeenLastCalledWith('h1', last));
  expect(await screen.findByText(/Dishes/)).toBeOnTheScreen();
  expect(screen.getByTestId('history-foot')).toHaveTextContent(LIST_COPY.everything);
});
