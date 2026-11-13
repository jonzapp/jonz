import { REACTION_LABEL, wallEvents, type WallRow } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { loadHouse } from '@/api/board';
import { loadWallEvents, setReaction } from '@/api/wall';
import { useHouse } from '@/hooks/use-house';
import { assignment, snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

import { WallSection } from './wall-section';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/wall', () => ({ loadWallEvents: jest.fn(), setReaction: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
const mockOpen = jest.fn();
jest.mock('@/components/john-sheet', () => ({ useJohnSheet: () => ({ open: mockOpen, close: jest.fn() }) }));

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const row = (overrides: Partial<WallRow>): WallRow => ({
  id: 'e',
  kind: 'done',
  user_id: 'sam',
  assignment_id: null,
  data: {},
  created_at: ago(1),
  assignments: null,
  reactions: [],
  ...overrides,
});

// Sam's bath three hours ago (this week's, still in its dispute window),
// which Priya gave a "Nice one"; Sam's dispute of Priya's hob this week;
// Priya's tick of an older week's hob, which Sam set on fire; Sam moving in.
const EVENTS = wallEvents(
  [
    row({
      id: 'e1',
      assignment_id: 'a4',
      data: { name: 'Clean the bath', points: 4 },
      created_at: ago(3),
      reactions: [{ user_id: 'priya', kind: 'nice' }],
    }),
    row({
      id: 'e2',
      kind: 'disputed',
      assignment_id: 'a3',
      data: { name: 'Wipe the hob', against: 'priya', reason: 'Still greasy round the back of the rings' },
      created_at: ago(4),
    }),
    row({
      id: 'e3',
      user_id: 'priya',
      assignment_id: 'old',
      data: { name: 'Wipe the hob', points: 2 },
      created_at: ago(40),
      reactions: [{ user_id: 'sam', kind: 'fire' }],
    }),
    row({ id: 'e4', kind: 'joined', created_at: ago(60) }),
  ],
  'priya',
);

/** The Wall's latest on its own, once the house is read, with the whole Wall standing in as its name. */
async function open() {
  function Host() {
    const { view } = useHouse('h1', 'priya');
    return view ? <WallSection houseId="h1" userId="priya" view={view} /> : null;
  }
  await renderPages({ 'house/index': Host, 'house/wall': () => <Text>Wall page</Text> }, '/house');
  await screen.findByTestId('wall-section');
}

/** The rows, once read: Sam's bath, his dispute, your old hob, Sam moving in. */
async function rows() {
  await waitFor(() => expect(screen.getAllByTestId('wall-event')).toHaveLength(4));
  return screen.getAllByTestId('wall-event');
}

/** A row's own press target (its trailing control sits beside it). */
const target = (r: Parameters<typeof within>[0]) => within(r).getAllByRole('button')[0];

beforeEach(() => {
  jest.clearAllMocks();
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({
      assignments: base.assignments.map((a) => (a.id === 'a4' ? assignment({ ...a, done_at: ago(3) }) : a)),
    }),
  );
  (loadWallEvents as jest.Mock).mockResolvedValue({ events: EVENTS, photos: {}, older: null });
  (setReaction as jest.Mock).mockResolvedValue(undefined);
});

it('reads only the latest four, under its label and See all', async () => {
  await open();
  const section = within(screen.getByTestId('wall-section'));
  expect(section.getByRole('header', { name: words('wall.page.title') })).toBeOnTheScreen();
  await rows();
  // House never shows a photo, so none is signed.
  expect(loadWallEvents).toHaveBeenCalledWith('h1', 'priya', 4);
});

it('tells each in one sentence with first names, and a meta line with when', async () => {
  await open();
  const [bath, dispute, hob, joined] = await rows();
  expect(bath).toHaveTextContent(/Sam ticked Clean the bath.*Checking.*3h/);
  expect(dispute).toHaveTextContent(/Sam disputed your tick on Wipe the hob.*“Still greasy round the back of the rings”.*4h/);
  expect(hob).toHaveTextContent(/You ticked Wipe the hob/);
  expect(joined).toHaveTextContent(/Sam moved in.*New housemate/);
  expect(target(bath)).toHaveAccessibleName(`Sam ticked Clean the bath, Checking, 3h, ${words('wall.feed.tally', { label: REACTION_LABEL.nice, count: 1 })}`);
  // A sentence gets two lines before it's cut short.
  expect(within(dispute).getByText('Sam disputed your tick on Wipe the hob')).toHaveProp('numberOfLines', 2);
});

it('counts what the house gave each event on its meta line, with nothing on the row to press but the row', async () => {
  await open();
  const [bath, dispute, hob] = await rows();
  expect(within(bath).getByTestId('count-nice', { includeHiddenElements: true })).toHaveTextContent('1');
  expect(within(hob).getByTestId('count-fire', { includeHiddenElements: true })).toHaveTextContent('1');
  expect(within(dispute).queryByTestId('count-nice', { includeHiddenElements: true })).toBeNull();
  for (const r of [bath, dispute, hob]) expect(within(r).getAllByRole('button')).toHaveLength(1);
});

it("opens this week's John in the John sheet", async () => {
  await open();
  const [bath, dispute] = await rows();
  await fireEvent.press(target(bath));
  // With the post it came from, whose reactions the sheet shows.
  expect(mockOpen).toHaveBeenLastCalledWith('a4', undefined, 'e1');
  // A dispute of your own John: nothing for you to vote on, and it takes no reactions.
  await fireEvent.press(within(dispute).getByRole('button'));
  expect(mockOpen).toHaveBeenLastCalledWith('a3', undefined, undefined);
  expect(screen.queryByTestId('wall-sheet')).toBeNull();
});

it('opens a dispute that waits on your vote at the vote', async () => {
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({
      assignments: base.assignments.map((a) => (a.id === 'a4' ? assignment({ ...a, done_at: ago(3) }) : a)),
      disputes: [
        { id: 'd1', assignment_id: 'a4', raised_by: 'priya', reason: 'Ring round it', closes_at: ago(-20), dispute_votes: [] },
      ],
    }),
  );
  await open();
  const [bath] = await rows();
  await waitFor(() => expect(bath).toHaveTextContent(/Disputed/));
  await fireEvent.press(target(bath));
  expect(mockOpen).toHaveBeenLastCalledWith('a4', 'vote', 'e1');
});

it('opens anything else in full, none of it cut short, with all four reactions where it takes them', async () => {
  await open();
  const [, , hob, joined] = await rows();
  await fireEvent.press(within(joined).getByRole('button'));
  let sheet = within(screen.getByTestId('wall-sheet'));
  expect(sheet.getByRole('header', { name: 'Sam moved in' })).toBeOnTheScreen();
  expect(sheet.getByText(/^New housemate\s\w/)).toBeOnTheScreen();
  // Moving in takes no reactions.
  expect(sheet.queryByTestId('react-nice')).toBeNull();
  await fireEvent.press(screen.getByTestId('sheet-close'));
  await waitFor(() => expect(screen.queryByTestId('wall-sheet')).toBeNull());

  await fireEvent.press(target(hob));
  sheet = within(screen.getByTestId('wall-sheet'));
  expect(sheet.getByRole('header', { name: 'You ticked Wipe the hob' })).toBeOnTheScreen();
  expect(sheet.getByRole('button', { name: words('wall.feed.reactionCount', { label: REACTION_LABEL.fire, count: 1 }) })).not.toBeSelected();
  expect(mockOpen).not.toHaveBeenCalled();
});

it('shows the event with all four reactions, by name, when a row is held down', async () => {
  await open();
  const [bath] = await rows();
  await fireEvent(target(bath), 'longPress');
  expect(mockOpen).not.toHaveBeenCalled();
  const sheet = within(screen.getByTestId('wall-sheet'));
  expect(sheet.getByRole('header', { name: 'Sam ticked Clean the bath' })).toBeOnTheScreen();
  for (const kind of ['fire', 'sparkle', 'eyes'] as const) {
    expect(sheet.getByRole('button', { name: REACTION_LABEL[kind] })).not.toBeSelected();
  }
  expect(sheet.getByRole('button', { name: words('wall.feed.reactionCount', { label: REACTION_LABEL.nice, count: 1 }) })).toBeSelected();
  await fireEvent.press(sheet.getByTestId('react-fire'));
  expect(setReaction).toHaveBeenCalledWith('e1', 'priya', 'fire', true);
});

it('puts a reaction back and, once its sheet is put away, says why under the row it was made on, until another sheet opens', async () => {
  (setReaction as jest.Mock).mockRejectedValue(new Error("You can't react to that."));
  await open();
  const [bath, , , joined] = await rows();
  await fireEvent(target(bath), 'longPress');
  await fireEvent.press(within(screen.getByTestId('wall-sheet')).getByTestId('react-nice'));
  await within(screen.getByTestId('wall-sheet')).findByRole('alert');
  await fireEvent.press(screen.getByTestId('sheet-close'));
  await waitFor(() => expect(screen.queryByTestId('wall-sheet')).toBeNull());
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent("You can't react to that.");
  // Straight after the bath's row, before the dispute's.
  const order = within(screen.getByTestId('wall-section')).getAllByText(/Sam ticked Clean the bath|You can't react|Sam disputed/);
  // A sentence's names and Johns are runs of their own: read the words whole.
  type Node = { children: (string | Node)[] };
  const words = (node: Node): string => node.children.map((c) => (typeof c === 'string' ? c : words(c))).join('');
  expect(order.map((t) => words(t as unknown as Node))).toEqual(['Sam ticked Clean the bath', "You can't react to that.", 'Sam disputed your tick on Wipe the hob']);
  await fireEvent.press(within(joined).getByRole('button'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('says why in the sheet, when the reaction was made there', async () => {
  (setReaction as jest.Mock).mockRejectedValue(new Error("You can't react to that."));
  await open();
  const [bath] = await rows();
  await fireEvent(target(bath), 'longPress');
  const sheet = within(screen.getByTestId('wall-sheet'));
  await fireEvent.press(sheet.getByTestId('react-eyes'));
  expect(await sheet.findByRole('alert')).toHaveTextContent("You can't react to that.");
  // Said once, in the sheet, not under the row too.
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});

it('says what lands here before anything has', async () => {
  (loadWallEvents as jest.Mock).mockResolvedValue({ events: [], photos: {}, older: null });
  await open();
  expect(await screen.findByText(words('wall.page.empty'))).toBeOnTheScreen();
});

it("says when it can't read the Wall, and tries again", async () => {
  (loadWallEvents as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await open();
  expect(await screen.findByRole('alert')).toHaveTextContent(words('wall.feed.unreadable'));
  await fireEvent.press(screen.getByRole('button', { name: /try again/i }));
  await waitFor(() => expect(screen.getAllByTestId('wall-event')).toHaveLength(4));
});

it('leads to the whole Wall', async () => {
  await open();
  await fireEvent.press(screen.getByRole('link', { name: words('wall.feed.seeAllOf', { wall: words('wall.page.title') }) }));
  expect(screen).toHavePathname('/house/wall');
  expect(screen.getByText('Wall page')).toBeOnTheScreen();
});
