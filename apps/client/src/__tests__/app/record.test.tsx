import { wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { loadRecord, type RecordRows } from '@/api/record';
import { loadTable } from '@/api/table';
import RecordPersonScreen from '@/app/(house)/week/record/[userId]';
import RecordScreen from '@/app/(house)/week/record/index';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/record', () => ({ loadRecord: jest.fn() }));
jest.mock('@/api/table', () => ({ loadTable: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const week = (id: string, startsIn: number) => ({
  id,
  starts_on: at(startsIn).slice(0, 10),
  starts_at: at(startsIn),
  ends_at: at(startsIn + 168),
});

/** Two weeks: last week Priya on time and Sam missed one Priya covered; this week Sam late. */
function rows(): RecordRows {
  const john = (id: string, weekId: string, userId: string, extra: object) => ({
    id,
    week_id: weekId,
    user_id: userId,
    name: `John ${id}`,
    points: 2,
    due_at: at(weekId === 'w0' ? -150 : -20),
    done_at: null,
    outcome: 'done',
    excused: false,
    covered_by: null,
    ...extra,
  });
  return {
    weeks: [week('w1', -48), week('w0', -216)],
    shares: ['w0', 'w1'].flatMap((w) => [
      { week_id: w, user_id: 'priya', share: 2 },
      { week_id: w, user_id: 'sam', share: 2 },
    ]),
    johns: [
      john('a', 'w0', 'priya', {}),
      john('b', 'w0', 'sam', { outcome: 'covered', covered_by: 'priya' }),
      john('c', 'w1', 'sam', { outcome: 'late' }),
    ],
    away: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue(PHONE);
  (loadHouse as jest.Mock).mockResolvedValue(snapshot({ assignments: [] }));
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadRecord as jest.Mock).mockResolvedValue(rows());
  (loadTable as jest.Mock).mockResolvedValue({
    month: '2026-10',
    monthTable: [],
    balances: [
      { userId: 'sam', balance: -2, weeksToEven: 2 },
      { userId: 'priya', balance: 2, weeksToEven: 0 },
    ],
  });
});

const PAGES = { 'week/record/index': RecordScreen, 'week/record/[userId]': RecordPersonScreen };

it('shows everyone a square a week, best on time first, with the way back to Week', async () => {
  await renderPages(PAGES, '/week/record?span=all');
  await untilRead(words);
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('week.record.title') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.week') }) })).toBeOnTheScreen();

  const records = await screen.findAllByTestId('record-row');
  expect(records.map((r) => r.props.accessibilityLabel)).toEqual([
    `${words('week.record.you', { name: 'Priya' })}, 100% on time, 1 on time, covered 1`,
    'Sam, 0% on time, 0 on time, 1 late, 1 missed',
  ]);
  expect(within(records[0]).getAllByTestId(/^square-/, { includeHiddenElements: true }).map((s) => s.props.testID)).toEqual([
    'square-covered',
    'square-none',
  ]);
  expect(within(records[1]).getAllByTestId(/^square-/, { includeHiddenElements: true }).map((s) => s.props.testID)).toEqual([
    'square-missed',
    'square-late',
  ]);
  const key = within(screen.getByTestId('record-key'));
  expect(key.getByText(words('week.record.marks.missed'))).toBeOnTheScreen();
  expect(key.queryByText(words('week.record.marks.away'))).toBeNull();
});

it('switches the span', async () => {
  await renderPages(PAGES, '/week/record?span=all');
  await untilRead(words);
  await fireEvent.press(within(screen.getByTestId('record-span')).getByRole('radio', { name: words('week.record.spans.week') }));
  await waitFor(() => expect(screen.getByText(words('week.record.introWeek'))).toBeOnTheScreen());
  const sam = (await screen.findAllByTestId('record-row'))[0];
  expect(sam.props.accessibilityLabel).toMatch(/^Sam/);
});

it("opens a person's breakdown, which adds up and opens onto its Johns", async () => {
  await renderPages(PAGES, '/week/record?span=all');
  await untilRead(words);
  await fireEvent.press((await screen.findAllByTestId('record-row'))[1]);
  const breakdown = within(await screen.findByTestId('record-breakdown'));
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: 'Sam' })).toBeOnTheScreen();
  expect(breakdown.getByTestId('record-line-share')).toHaveTextContent(/Their share.*−4/);
  expect(breakdown.getByTestId('record-line-late')).toHaveTextContent(/Done late.*\+2/);
  expect(breakdown.getByTestId('record-line-missed')).toHaveTextContent(/Missed.*A miss counts for nobody.*0/);
  expect(breakdown.getByTestId('record-total')).toHaveTextContent(/−2$/);

  expect(breakdown.queryByTestId('record-john')).toBeNull();
  await fireEvent.press(breakdown.getByTestId('record-line-missed'));
  expect(breakdown.getByTestId('record-john')).toHaveTextContent(new RegExp(words('week.record.coveredIt', { name: words('week.record.you', { name: 'Priya' }) }).replace(/[()]/g, '\\$&')));

  expect(await screen.findByTestId('record-next')).toHaveTextContent(/2 points behind their share/);
});

it('on a laptop, opens your breakdown beside the grid, then whoever you click, on the same page', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await renderPages(PAGES, '/week/record?span=all');
  await untilRead(words);
  const beside = within(await screen.findByTestId('record-pair-end'));
  expect(await beside.findByTestId('record-breakdown')).toHaveTextContent(/Priya \(you\)/);
  expect(beside.getByTestId('record-total')).toHaveTextContent(new RegExp(`^${words('week.record.totalYou')}`));
  const [priya, sam] = within(screen.getByTestId('record-pair-start')).getAllByTestId('record-row');
  expect(priya.props['aria-current']).toBe(true);

  await fireEvent.press(sam);
  await waitFor(() => expect(beside.getByTestId('record-total')).toHaveTextContent(/−2$/));
  expect(beside.getByTestId('record-breakdown')).toHaveTextContent(/Sam/);
  expect(screen.getByTestId('record-screen')).toBeOnTheScreen();
  expect(screen.queryByTestId('record-person-screen')).toBeNull();
  const rows = screen.getAllByTestId('record-row');
  expect(rows[1].props['aria-current']).toBe(true);
  expect(rows[0].props['aria-current']).toBeUndefined();
});

it("on a laptop, a link to someone's page opens them beside the grid", async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await renderPages(PAGES, '/week/record/sam?span=all');
  await untilRead(words);
  expect(await screen.findByTestId('record-screen')).toBeOnTheScreen();
  expect(await within(screen.getByTestId('record-pair-end')).findByTestId('record-total')).toHaveTextContent(/−2$/);
  expect(screen.queryByTestId('record-person-screen')).toBeNull();
});
