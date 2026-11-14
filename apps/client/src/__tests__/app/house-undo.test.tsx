import { historyItems, wallEvents, wordsFor, type ActionRow, type WallRow } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { loadHistory, undoAction } from '@/api/history';
import { catchUp } from '@/api/house';
import { loadWall } from '@/api/wall';
import HistoryScreen from '@/app/(house)/house/history';
import WallScreen from '@/app/(house)/house/wall';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/history', () => ({ loadHistory: jest.fn(), undoAction: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/wall', () => ({ loadWall: jest.fn(), setReaction: jest.fn() }));
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: jest.fn(), close: jest.fn() }) }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

// Thursday 29 October 2026, 9pm in London.
const NOW = new Date('2026-10-29T21:00:00Z');

const post = (overrides: Partial<WallRow>): WallRow => ({
  id: 'e',
  kind: 'done',
  user_id: 'priya',
  assignment_id: null,
  data: {},
  created_at: '2026-10-29T20:04:00Z',
  assignments: null,
  reactions: [],
  ...overrides,
});

const move = (overrides: Partial<ActionRow>): ActionRow => ({
  id: 'x',
  kind: 'tick',
  done_by: 'priya',
  subject_user_id: 'priya',
  assignment_id: null,
  ref: null,
  data: {},
  created_at: '2026-10-29T20:04:00Z',
  undone_at: null,
  undone_by: null,
  reach: 'own',
  ...overrides,
});

// Older than this week's board, so each opens its own sheet: Priya's late tick
// (hers to undo), Sam's time away (Priya's as an admin), and Sam's tick,
// settled past reach.
const POSTS = wallEvents(
  [
    post({ id: 'e1', kind: 'late', assignment_id: 'old1', data: { name: 'Bins out', points: 2 } }),
    post({ id: 'e2', kind: 'away', user_id: 'sam', data: { away: 'w1', starts_on: '2026-11-02', ends_on: '2026-11-04' }, created_at: '2026-10-29T19:30:00Z' }),
    post({ id: 'e3', kind: 'late', user_id: 'sam', assignment_id: 'old3', data: { name: 'Clean the bath', points: 4 }, created_at: '2026-10-29T09:12:00Z' }),
  ],
  'priya',
);
const MOVES = historyItems([
  move({ id: 'm1', assignment_id: 'old1', data: { name: 'Bins out', late: true, event: 'e1' } }),
  move({ id: 'm2', kind: 'away', done_by: 'sam', subject_user_id: 'sam', ref: 'w1', data: { starts_on: '2026-11-02', ends_on: '2026-11-04' }, reach: 'admin' }),
  move({ id: 'm3', done_by: 'sam', subject_user_id: 'sam', assignment_id: 'old3', data: { name: 'Clean the bath', late: true, event: 'e3' }, reach: null }),
]);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadWall as jest.Mock).mockResolvedValue({ events: POSTS, photos: {}, older: null });
  (loadHistory as jest.Mock).mockResolvedValue(MOVES);
  (undoAction as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => jest.useRealTimers());

async function open() {
  await renderPages({ 'house/wall': WallScreen, 'house/history': HistoryScreen }, '/house/wall');
  await screen.findAllByTestId('wall-day');
  await waitFor(() => expect(loadHistory).toHaveBeenCalledWith('h1'));
}

async function sheetOf(sentence: RegExp) {
  await fireEvent.press(screen.getByRole('button', { name: sentence }));
  return within(await screen.findByTestId('wall-sheet'));
}

it('sends an old link to History to the Wall, with no History on it', async () => {
  await renderPages({ 'house/wall': WallScreen, 'house/history': HistoryScreen }, '/house/history');
  await screen.findAllByTestId('wall-day');
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: words('wall.page.title') })).toBeOnTheScreen();
  expect(screen.queryByTestId('wall-shows')).toBeNull();
  expect(screen.queryByTestId('history-row')).toBeNull();
});

it('offers Undo in the sheet of a post whose move can still be undone, and only there', async () => {
  await open();
  expect(screen.queryByTestId('undo-move')).toBeNull();
  const mine = await sheetOf(/^You ticked Bins out/);
  expect(await mine.findByRole('button', { name: 'Undo: You ticked Bins out, late' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.close') }));

  const away = await sheetOf(/^Sam.*away/i);
  expect(await away.findByTestId('undo-move')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.close') }));

  const settled = await sheetOf(/^Sam ticked Clean the bath/);
  expect(settled.queryByTestId('undo-move')).toBeNull();
});

it('undoes it, and reads what can be undone again', async () => {
  await open();
  const sheet = await sheetOf(/^You ticked Bins out/);
  (loadHistory as jest.Mock).mockClear();
  await fireEvent.press(await sheet.findByTestId('undo-move'));
  expect(undoAction).toHaveBeenCalledWith('m1');
  await waitFor(() => expect(loadHistory).toHaveBeenCalled());
});

it('says a refusal in the sheet', async () => {
  (undoAction as jest.Mock).mockRejectedValue(new Error('That can’t be undone any more.'));
  await open();
  const sheet = await sheetOf(/^You ticked Bins out/);
  await fireEvent.press(await sheet.findByTestId('undo-move'));
  expect(await sheet.findByText('That can’t be undone any more.')).toBeOnTheScreen();
});
