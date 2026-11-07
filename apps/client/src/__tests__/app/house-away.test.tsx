import { AWAY_COPY, FOCUS_SHELL_COPY, PAGE_TITLE, SECTION_LABEL, SETUP_COPY } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { cancelAway, loadAway, setAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { loadJohnList } from '@/api/settings';
import AwayScreen from '@/app/(house)/house/away';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/away', () => ({ loadAway: jest.fn(), setAway: jest.fn(), cancelAway: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
// Your days and best time are on the same page (house-prefs.test.tsx).
jest.mock('@/api/my-prefs', () => ({ saveMyPrefs: jest.fn() }));
jest.mock('@/api/settings', () => ({ loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const trip = (overrides: object = {}) => ({
  id: 'p1',
  userId: 'sam',
  startsOn: '2026-10-26',
  endsOn: '2026-10-28',
  note: 'Lisbon',
  ...overrides,
});

async function open() {
  await renderPages({ 'house/away': AwayScreen }, '/house/away');
  await untilRead();
}

beforeEach(() => {
  jest.clearAllMocks();
  // A Wednesday: the house's week started on Monday the 19th.
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [] });
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  (cancelAway as jest.Mock).mockResolvedValue(undefined);
  (setAway as jest.Mock).mockResolvedValue({ before: 0, handed: 0, skipped: 0 });
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: PAGE_TITLE.away })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) })).toBeOnTheScreen();
});

it('shows the month, each day saying how many are away', async () => {
  const members = snapshot().members;
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({ members: [members[0], { ...members[1], name: 'Sam Carter' }, { ...members[1], userId: 'tom', name: 'Tom Reilly' }] }),
  );
  (loadAway as jest.Mock).mockResolvedValue({
    today: '2026-10-21',
    periods: [
      trip({ id: 'p3', userId: 'tom', startsOn: '2026-10-20', endsOn: '2026-10-26', note: null }),
      trip(),
      trip({ id: 'p2', userId: 'priya', startsOn: '2026-11-02', endsOn: '2026-11-03', note: null }),
    ],
  });
  await open();
  const panel = within(screen.getByTestId('away-panel'));
  expect(panel.getByText(SETUP_COPY.whosAway)).toBeOnTheScreen();
  expect(panel.getByText('October 2026')).toBeOnTheScreen();
  // Weeks from the house's Monday, so October opens on 28 September.
  expect(panel.getAllByTestId('away-day')).toHaveLength(35);
  expect(panel.getByRole('button', { name: 'Monday 28 September, everyone home' })).toBeOnTheScreen();
  expect(panel.getByRole('button', { name: 'Wednesday 21 October, 1 away' })).toBeOnTheScreen();
  // Today, and only today, is outlined.
  expect(panel.getAllByTestId('away-today')).toHaveLength(1);
  expect(within(panel.getByRole('button', { name: 'Wednesday 21 October, 1 away' })).getByTestId('away-today')).toBeOnTheScreen();
  expect(panel.getByRole('button', { name: 'Monday 26 October, 2 away' })).toBeOnTheScreen();
  expect(panel.getByRole('button', { name: 'Wednesday 28 October, 1 away' })).toBeOnTheScreen();
  expect(panel.getByRole('button', { name: 'Thursday 29 October, everyone home' })).toBeOnTheScreen();
  expect(panel.getByText(AWAY_COPY.tapADay)).toBeOnTheScreen();
  // What was read starts a week back, so there's no going to September.
  expect(panel.getByRole('button', { name: AWAY_COPY.earlierMonth })).toBeDisabled();
  await fireEvent.press(panel.getByRole('button', { name: AWAY_COPY.laterMonth }));
  expect(panel.getByText('November 2026')).toBeOnTheScreen();
  expect(panel.getByRole('button', { name: 'Monday 2 November, 1 away' })).toBeOnTheScreen();
  expect(panel.queryByTestId('away-today')).toBeNull();
  await fireEvent.press(panel.getByRole('button', { name: AWAY_COPY.earlierMonth }));
  expect(panel.getByText('October 2026')).toBeOnTheScreen();
});

it("opens a day's sheet: who's away, when they're back, and who's home", async () => {
  const members = snapshot().members;
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({ members: [members[0], { ...members[1], name: 'Sam Carter' }, { ...members[1], userId: 'tom', name: 'Tom Reilly' }] }),
  );
  (loadAway as jest.Mock).mockResolvedValue({
    today: '2026-10-21',
    periods: [trip(), trip({ id: 'p3', userId: 'tom', startsOn: '2026-10-20', endsOn: '2026-10-26', note: null })],
  });
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Monday 26 October, 2 away' }));
  const sheet = within(screen.getByTestId('away-day-sheet'));
  expect(sheet.getByRole('header', { name: 'Monday 26 October' })).toBeOnTheScreen();
  expect(sheet.getByText(AWAY_COPY.dayCount(2, 1))).toBeOnTheScreen();
  // The trip that began first first, by first name, with the day they're back.
  const [tom, sam] = sheet.getAllByTestId('day-away');
  expect(tom).toHaveTextContent(/Tom.*Back Tue 27 Oct$/);
  expect(sam).toHaveTextContent(/Sam.*Back Thu 29 Oct, Lisbon$/);
  expect(sheet.getByTestId('day-home')).toHaveTextContent(/You$/);
  // On a day, keeping the sheet open.
  await fireEvent.press(sheet.getByRole('button', { name: AWAY_COPY.dayAfter }));
  expect(sheet.getByRole('header', { name: 'Tuesday 27 October' })).toBeOnTheScreen();
  expect(sheet.getAllByTestId('day-away')).toHaveLength(1);
  expect(sheet.getByTestId('day-home')).toHaveTextContent(/You.*Tom$/);
  await fireEvent.press(sheet.getByRole('button', { name: AWAY_COPY.dayAfter }));
  await fireEvent.press(sheet.getByRole('button', { name: AWAY_COPY.dayAfter }));
  expect(sheet.getByRole('header', { name: 'Thursday 29 October' })).toBeOnTheScreen();
  expect(sheet.getByText(AWAY_COPY.everyoneHome)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('sheet-close'));
  await waitFor(() => expect(screen.queryByTestId('away-day-sheet')).toBeNull());
});

it('calls your own trip yours on the calendar, and says when everyone is away', async () => {
  (loadAway as jest.Mock).mockResolvedValue({
    today: '2026-10-21',
    periods: [trip({ userId: 'priya' }), trip({ id: 'p2', startsOn: '2026-10-28', endsOn: '2026-10-30', note: null })],
  });
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Monday 26 October, 1 away' }));
  const sheet = within(screen.getByTestId('away-day-sheet'));
  expect(sheet.getByTestId('day-away')).toHaveTextContent(/You.*Back Thu 29 Oct, Lisbon$/);
  expect(sheet.getByTestId('day-home')).toHaveTextContent(/Sam$/);
  await fireEvent.press(sheet.getByRole('button', { name: AWAY_COPY.dayAfter }));
  await fireEvent.press(sheet.getByRole('button', { name: AWAY_COPY.dayAfter }));
  expect(sheet.getByText(AWAY_COPY.dayCount(2, 0))).toBeOnTheScreen();
  expect(sheet.getByText(AWAY_COPY.nobodyHome)).toBeOnTheScreen();
});

it("says when nobody's away, and has no trips of yours to show", async () => {
  await open();
  expect(within(screen.getByTestId('away-panel')).getByText(AWAY_COPY.nobody)).toBeOnTheScreen();
  expect(screen.queryByTestId('my-trips')).toBeNull();
});

describe('your own trips', () => {
  it('cancels one that has not started', async () => {
    (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [trip({ userId: 'priya' })] });
    await open();
    const mine = within(screen.getByTestId('my-trips'));
    expect(mine.getByText(AWAY_COPY.yours)).toBeOnTheScreen();
    expect(mine.getByTestId('my-trip')).toHaveTextContent(/26–28 Oct.*Lisbon/);
    await fireEvent.press(mine.getByRole('button', { name: `${AWAY_COPY.cancel}, 26–28 Oct` }));
    expect(cancelAway).toHaveBeenCalledWith('p1');
  });

  it("ends one you're on with I'm back", async () => {
    (loadAway as jest.Mock).mockResolvedValue({
      today: '2026-10-21',
      periods: [trip({ userId: 'priya', startsOn: '2026-10-20', endsOn: '2026-10-24', note: 'Cork' })],
    });
    await open();
    const mine = within(screen.getByTestId('my-trip'));
    expect(screen.getByTestId('my-trip')).toHaveTextContent(new RegExp(`20–24 Oct.*${SETUP_COPY.awayNow}, Cork`));
    await fireEvent.press(mine.getByRole('button', { name: `${AWAY_COPY.back}, 20–24 Oct` }));
    expect(cancelAway).toHaveBeenCalledWith('p1');
  });

  it("says why a cancel didn't take", async () => {
    (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [trip({ userId: 'priya' })] });
    (cancelAway as jest.Mock).mockRejectedValue(new Error('That trip has already ended.'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: `${AWAY_COPY.cancel}, 26–28 Oct` }));
    expect(await within(screen.getByTestId('my-trips')).findByRole('alert')).toHaveTextContent('That trip has already ended.');
  });

  it('leaves out trips that are over', async () => {
    (loadAway as jest.Mock).mockResolvedValue({
      today: '2026-10-21',
      periods: [trip({ userId: 'priya', startsOn: '2026-10-10', endsOn: '2026-10-12' })],
    });
    await open();
    expect(screen.queryByTestId('my-trips')).toBeNull();
    expect(within(screen.getByTestId('away-panel')).getByText(AWAY_COPY.nobody)).toBeOnTheScreen();
  });
});

describe('booking', () => {
  it('opens the calendar on this week, the first you can book', async () => {
    await open();
    const calendar = within(screen.getByTestId('date-range'));
    expect(calendar.getByText('October–November 2026')).toBeOnTheScreen();
    // The week began on Monday; the days already gone can't be picked.
    expect(calendar.getByRole('button', { name: 'Monday 19 October' })).toBeDisabled();
    expect(calendar.getByRole('button', { name: 'Wednesday 21 October' })).toBeEnabled();
    expect(calendar.getByRole('button', { name: SETUP_COPY.earlier })).toBeDisabled();
    expect(calendar.queryByRole('button', { name: 'Monday 23 November' })).toBeNull();
    await fireEvent.press(calendar.getByRole('button', { name: SETUP_COPY.later }));
    // On four weeks, keeping the last in view.
    expect(calendar.getByRole('button', { name: 'Monday 16 November' })).toBeOnTheScreen();
    expect(calendar.getByRole('button', { name: 'Monday 14 December' })).toBeOnTheScreen();
    expect(calendar.queryByRole('button', { name: 'Wednesday 21 October' })).toBeNull();
    await fireEvent.press(calendar.getByRole('button', { name: SETUP_COPY.earlier }));
    expect(calendar.getByRole('button', { name: 'Wednesday 21 October' })).toBeOnTheScreen();
  });

  it('books your time away from the calendar, and says what it moved', async () => {
    (setAway as jest.Mock).mockResolvedValue({ before: 2, handed: 1, skipped: 0 });
    await open();
    const form = within(screen.getByTestId('away-form'));
    expect(form.getByText(AWAY_COPY.howItWorks)).toBeOnTheScreen();
    expect(form.getByRole('button', { name: SETUP_COPY.book })).toBeDisabled();
    expect(form.getByText(AWAY_COPY.pickFrom)).toBeOnTheScreen();
    await fireEvent.press(form.getByRole('button', { name: 'Monday 26 October' }));
    expect(form.getByText(AWAY_COPY.pickTo)).toBeOnTheScreen();
    await fireEvent.press(form.getByRole('button', { name: 'Wednesday 28 October' }));
    expect(form.getByText(AWAY_COPY.picked('26–28 Oct'))).toBeOnTheScreen();
    expect(form.getByRole('button', { name: 'Tuesday 27 October' })).toBeSelected();
    await fireEvent.changeText(form.getByTestId('away-note'), 'Lisbon');
    await fireEvent.press(form.getByRole('button', { name: SETUP_COPY.book }));
    expect(setAway).toHaveBeenCalledWith({ from: '2026-10-26', to: '2026-10-28', note: 'Lisbon' });
    expect(await screen.findByText(AWAY_COPY.moved(2, 1, 0))).toBeOnTheScreen();
    // Ready for the next one.
    await waitFor(() => expect(form.getByTestId('book-away')).toBeDisabled());
    expect(form.getByTestId('away-note')).toHaveDisplayValue('');
  });

  it('books a single day with one tap', async () => {
    await open();
    const form = within(screen.getByTestId('away-form'));
    await fireEvent.press(form.getByRole('button', { name: 'Thursday 22 October' }));
    await fireEvent.press(form.getByTestId('book-away'));
    expect(setAway).toHaveBeenCalledWith({ from: '2026-10-22', to: '2026-10-22', note: '' });
  });

  it("says why a booking didn't take", async () => {
    (setAway as jest.Mock).mockRejectedValue(new Error("You’re already away for some of those days."));
    await open();
    const form = within(screen.getByTestId('away-form'));
    await fireEvent.press(form.getByRole('button', { name: 'Thursday 22 October' }));
    await fireEvent.press(form.getByTestId('book-away'));
    expect(await form.findByRole('alert')).toHaveTextContent("You’re already away for some of those days.");
  });
});
