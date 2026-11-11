import { REACTION_LABEL, wallEvents, type WallRow } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { loadHistory } from '@/api/history';
import { catchUp } from '@/api/house';
import { loadWall, setReaction } from '@/api/wall';
import WallScreen from '@/app/(house)/house/wall';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/wall', () => ({ loadWall: jest.fn(), setReaction: jest.fn() }));
// History, beside the Wall on a laptop and behind a switch on a phone (house-history.test.tsx).
jest.mock('@/api/history', () => ({ HISTORY_PAGE: 60, loadHistory: jest.fn(), undoAction: jest.fn() }));
// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
const mockOpen = jest.fn();
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: mockOpen, close: jest.fn() }) }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

// Monday 26 October 2026, 3pm in London (GMT: the clocks went back on Sunday).
const NOW = new Date('2026-10-26T15:00:00Z');

const row = (overrides: Partial<WallRow>): WallRow => ({
  id: 'e',
  kind: 'done',
  user_id: 'sam',
  assignment_id: null,
  data: {},
  created_at: NOW.toISOString(),
  assignments: null,
  reactions: [],
  ...overrides,
});

// Priya, Sam and Alex. Today: Sam's bath with its photo, which Priya gave a
// "Nice one"; Priya paying Sam; Alex paying Sam. Yesterday: two of Priya's
// ticks in a row, and Alex moving in. Then, a page older, September closing.
const PAGE_ONE = wallEvents(
  [
    row({
      id: 'e1',
      assignment_id: 'a4',
      data: { name: 'Clean the bath', points: 4 },
      created_at: '2026-10-26T14:10:00Z',
      assignments: { photo_path: 'h1/a4/p.jpg' },
      reactions: [{ user_id: 'priya', kind: 'nice' }],
    }),
    row({ id: 'e2', kind: 'paid', user_id: 'priya', data: { to: 'sam', amount: 450 }, created_at: '2026-10-26T11:00:00Z' }),
    row({ id: 'e3', kind: 'paid', user_id: 'alex', data: { to: 'sam', amount: 300 }, created_at: '2026-10-26T10:00:00Z' }),
    row({ id: 'e4', user_id: 'priya', data: { name: 'Bins out', points: 2 }, created_at: '2026-10-25T20:00:00Z' }),
    row({ id: 'e5', user_id: 'priya', data: { name: 'Wipe the hob', points: 2 }, created_at: '2026-10-25T19:30:00Z' }),
    row({ id: 'e6', kind: 'joined', user_id: 'alex', created_at: '2026-10-25T09:00:00Z' }),
  ],
  'priya',
);
const PAGE_TWO = wallEvents(
  [row({ id: 'e7', kind: 'month_closed', user_id: null, data: { month: '2026-09' }, created_at: '2026-10-01T08:00:00Z' })],
  'priya',
);
const OLDER = { createdAt: '2026-10-25T09:00:00Z', id: 'e6' };

async function open() {
  await renderPages({ 'house/wall': WallScreen }, '/house/wall');
  await screen.findAllByTestId('wall-day');
}

/** The rows of one day's section, by its label. */
function day(label: string) {
  const section = screen.getAllByTestId('wall-day').find((d) => within(d).queryByRole('header', { name: label }));
  if (!section) throw new Error(`No day called ${label}`);
  return within(section);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  jest.clearAllMocks();
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({
      members: [...base.members, { userId: 'alex', name: 'Alex Moss', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } }],
    }),
  );
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadWall as jest.Mock).mockImplementation((_h, _u, _limit, before) =>
    Promise.resolve(
      before
        ? { events: PAGE_TWO, photos: {}, older: null }
        : { events: PAGE_ONE, photos: { 'h1/a4/p.jpg': 'https://signed/p' }, older: OLDER },
    ),
  );
  (setReaction as jest.Mock).mockResolvedValue(undefined);
  (loadHistory as jest.Mock).mockResolvedValue([]);
});

afterEach(() => jest.useRealTimers());

it('tells what the house did a day at a time, latest first, by the clock', async () => {
  await open();
  expect(loadWall).toHaveBeenCalledWith('h1', 'priya', 40, undefined);
  const [today, yesterday] = screen.getAllByTestId('wall-day');
  expect(within(today).getByRole('header', { name: words('wall.feed.today') })).toBeOnTheScreen();
  expect(within(yesterday).getByRole('header', { name: words('wall.feed.yesterday') })).toBeOnTheScreen();
  const [bath] = day(words('wall.feed.today')).getAllByTestId('wall-event');
  expect(bath).toHaveTextContent(/Sam ticked Clean the bath.*14:10/);
  expect(day(words('wall.feed.yesterday')).getAllByTestId('wall-event').at(-1)).toHaveTextContent(
    /Alex moved in.*New housemate.*09:00/,
  );
});

it('shows a photo receipt under its tick', async () => {
  await open();
  const photo = screen.getByTestId('wall-photo-image', { includeHiddenElements: true });
  expect(photo).toHaveProp('source', { uri: 'https://signed/p' });
  expect(screen.getByLabelText(words('wall.page.photoOf', { john: 'Clean the bath' }))).toBeOnTheScreen();
});

it('shows a payment’s amount only to the two people in it', async () => {
  await open();
  const [, mine, theirs] = day(words('wall.feed.today')).getAllByTestId('wall-event');
  expect(mine).toHaveTextContent(/You paid Sam £4\.50/);
  expect(theirs).toHaveTextContent(/Alex paid Sam/);
  expect(theirs).not.toHaveTextContent(/£/);
});

it("folds a day's on-time ticks into one row at its foot, and opens it", async () => {
  await open();
  const yesterday = day(words('wall.feed.yesterday'));
  const fold = yesterday.getByTestId('wall-fold');
  expect(fold).toHaveTextContent(`${words('wall.feed.onTimeMany', { n: 2 })}You`);
  const [first] = yesterday.getAllByTestId('wall-event');
  expect(yesterday.getAllByTestId('wall-event')).toHaveLength(1);
  expect(first).toHaveTextContent(/Alex moved in/);
  await fireEvent.press(fold);
  expect(fold).toBeExpanded();
  const [joined, bins, hob] = day(words('wall.feed.yesterday')).getAllByTestId('wall-event');
  expect(joined).toHaveTextContent(/Alex moved in/);
  expect(bins).toHaveTextContent(/You ticked Bins out.*20:00/);
  expect(hob).toHaveTextContent(/You ticked Wipe the hob.*19:30/);
});

it("gives a housemate's tick its Nice one, and shows all four reactions on a long press", async () => {
  // The database hasn't answered yet: the sheet already shows it.
  (setReaction as jest.Mock).mockReturnValue(new Promise<void>(() => undefined));
  await open();
  const [bath] = day(words('wall.feed.today')).getAllByTestId('wall-event');
  expect(within(bath).getByTestId('nice-one')).toBeSelected();
  await fireEvent(within(bath).getByRole('button', { name: /^Sam ticked Clean the bath/ }), 'longPress');
  const sheet = within(screen.getByTestId('wall-sheet'));
  expect(sheet.getByRole('header', { name: 'Sam ticked Clean the bath' })).toBeOnTheScreen();
  for (const kind of ['fire', 'sparkle', 'eyes'] as const) {
    expect(sheet.getByRole('button', { name: REACTION_LABEL[kind] })).toBeOnTheScreen();
  }
  await fireEvent.press(sheet.getByTestId('react-sparkle'));
  expect(setReaction).toHaveBeenCalledWith('e1', 'priya', 'sparkle', true);
  await waitFor(() =>
    expect(sheet.getByRole('button', { name: words('wall.feed.reactionCount', { label: REACTION_LABEL.sparkle, count: 1 }) })).toBeSelected(),
  );
});

it("opens this week's John in the John sheet, and anything else in full", async () => {
  await open();
  const [bath, , theirs] = day(words('wall.feed.today')).getAllByTestId('wall-event');
  await fireEvent.press(within(bath).getByRole('button', { name: /^Sam ticked Clean the bath/ }));
  expect(mockOpen).toHaveBeenCalledWith('a4', undefined);
  expect(screen.queryByTestId('wall-sheet')).toBeNull();
  await fireEvent.press(within(theirs).getByRole('button'));
  const sheet = within(screen.getByTestId('wall-sheet'));
  expect(sheet.getByRole('header', { name: 'Alex paid Sam' })).toBeOnTheScreen();
  expect(sheet.getByText(`${words('wall.feed.settled')} Today, 10:00`)).toBeOnTheScreen();
});

it('puts a reaction back and says why under the row it was made on', async () => {
  (setReaction as jest.Mock).mockRejectedValue(new Error("You can’t do that."));
  await open();
  const [bath] = day(words('wall.feed.today')).getAllByTestId('wall-event');
  await fireEvent.press(within(bath).getByTestId('nice-one'));
  expect(setReaction).toHaveBeenCalledWith('e1', 'priya', 'nice', false);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent("You can’t do that.");
  // In today's group, not at the top of the page.
  expect(day(words('wall.feed.today')).getByRole('alert')).toBe(alert);
  await waitFor(() => expect(within(bath).getByTestId('nice-one')).toBeSelected());
});

it('reads older days as you scroll near the end, from where the last one ended', async () => {
  await open();
  const foot = screen.getByTestId('wall-foot');
  expect(foot).toHaveTextContent(/Showing back to \w{3} \d+ \w{3}/);
  expect(screen.queryByText(words('common.list.everything'))).toBeNull();
  await fireEvent.scroll(screen.getByTestId('page-scroll'), {
    nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 1200 }, layoutMeasurement: { height: 800 } },
  });
  await waitFor(() => expect(loadWall).toHaveBeenLastCalledWith('h1', 'priya', 40, OLDER));
  expect(await screen.findByText(/September is closed/)).toBeOnTheScreen();
  expect(day('Thu 1 Oct').getAllByTestId('wall-event')).toHaveLength(1);
  // Nothing older than that.
  expect(screen.getByTestId('wall-foot')).toHaveTextContent(words('common.list.everything'));
  expect(screen.queryByTestId('wall-foot-more')).toBeNull();
});

it('reads older days from Show more too, for a keyboard or a short page', async () => {
  await open();
  await fireEvent.press(screen.getByTestId('wall-foot-more'));
  expect(loadWall).toHaveBeenLastCalledWith('h1', 'priya', 40, OLDER);
  expect(await screen.findByText(words('common.list.everything'))).toBeOnTheScreen();
});

it('says what lands here before anything has', async () => {
  (loadWall as jest.Mock).mockResolvedValue({ events: [], photos: {}, older: null });
  await renderPages({ 'house/wall': WallScreen }, '/house/wall');
  const empty = within(await screen.findByTestId('wall-empty'));
  expect(empty.getByRole('header', { name: words('wall.feed.emptyTitle') })).toBeOnTheScreen();
  expect(empty.getByText(words('wall.page.empty'))).toBeOnTheScreen();
});

it("says when it can't read the house it needs for the Wall's rows, and tries again", async () => {
  (loadHouse as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await renderPages({ 'house/wall': WallScreen }, '/house/wall');
  expect(await screen.findByRole('alert')).toHaveTextContent(words('wall.feed.unreadable'));
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
  expect(await screen.findAllByTestId('wall-day')).toHaveLength(2);
});

it("says when it can't read the Wall, and tries again", async () => {
  (loadWall as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await renderPages({ 'house/wall': WallScreen }, '/house/wall');
  expect(await screen.findByRole('alert')).toHaveTextContent(words('wall.feed.unreadable'));
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.retry') }));
  expect(await screen.findAllByTestId('wall-day')).toHaveLength(2);
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('wall.page.title') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.house') }) })).toBeOnTheScreen();
});

it('shows History beside the Wall on a laptop, under its name, and a switch between them on a phone', async () => {
  await open();
  expect(within(screen.getByTestId('wall-shows')).getByRole('radio', { name: words('wall.page.title') })).toBeChecked();
  expect(screen.queryByTestId('history-section')).toBeNull();

  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
  await open();
  expect(screen.queryByTestId('wall-shows')).toBeNull();
  expect(within(screen.getByTestId('wall-pair-start')).getAllByTestId('wall-day').length).toBeGreaterThan(0);
  const history = within(screen.getByTestId('wall-pair-end'));
  expect(history.getAllByRole('header', { name: words('wall.history.title') })[0]).toBeOnTheScreen();
  // Everyone's moves or only yours, in History's header.
  expect(history.getByTestId('history-whose')).toHaveTextContent(words('wall.history.everyone'));
  expect(await history.findByTestId('history-empty')).toBeOnTheScreen();
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 });
});
