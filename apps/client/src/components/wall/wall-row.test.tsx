import { REACTION_LABEL, STATUS_MARK, type WallFeedRow } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { WallEventRow } from './wall-row';

import { useTheme } from '@/theme';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

afterEach(() => jest.restoreAllMocks());

const none = { count: 0, mine: false };
const feedRow = (overrides: Partial<WallFeedRow> = {}): WallFeedRow => ({
  id: 'e1',
  kind: 'done',
  at: new Date('2026-10-26T12:00:00Z'),
  actor: { userId: 'megan', name: 'Megan Doyle', me: false },
  icon: 'check',
  family: 'done',
  title: 'Megan ticked Food waste caddy out',
  parts: [{ text: 'Megan', bold: true }, { text: ' ticked ' }, { text: 'Food waste caddy out', bold: true }],
  open: null,
  detail: words('wall.feed.checking'),
  mark: null,
  when: '6h',
  reactable: true,
  nice: true,
  top: null,
  reactions: { nice: { count: 2, mine: false }, fire: none, sparkle: none, eyes: none },
  board: { assignmentId: 'a1', vote: false },
  full: 'Checking\nToday, 12:00',
  label: 'Megan ticked Food waste caddy out, Checking, 6h',
  john: 'Food waste caddy out',
  photoPath: null,
  repeat: 'tick:megan',
  who: 'Megan',
  you: false,
  ...overrides,
});

it('holds nothing to press but itself: tapping opens it, holding shows its reactions', async () => {
  const onPress = jest.fn();
  const onReactions = jest.fn();
  await render(<WallEventRow row={feedRow()} onPress={onPress} onReactions={onReactions} />);
  // One button, the row, which says what the house gave it.
  const row = screen.getByRole('button');
  expect(row).toHaveAccessibleName(`Megan ticked Food waste caddy out, Checking, 6h, ${words('wall.feed.tally', { label: REACTION_LABEL.nice, count: 2 })}`);
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
  await fireEvent(row, 'longPress');
  expect(onReactions).toHaveBeenCalledTimes(1);
});

it('counts what the house gave on the meta line, and nothing before anyone reacts', async () => {
  await render(<WallEventRow row={feedRow()} onPress={jest.fn()} onReactions={jest.fn()} />);
  expect(screen.getByTestId('count-nice', { includeHiddenElements: true })).toHaveTextContent('2');
  expect(screen.queryByTestId('count-fire', { includeHiddenElements: true })).toBeNull();
  await screen.rerender(
    <WallEventRow row={feedRow({ reactions: { nice: none, fire: none, sparkle: none, eyes: none } })} onPress={jest.fn()} onReactions={jest.fn()} />,
  );
  expect(screen.queryByTestId('count-nice', { includeHiddenElements: true })).toBeNull();
});

it('marks a John that went wrong in hazard, and leaves the rest quiet', async () => {
  let hazard = '';
  function Probe() {
    hazard = useTheme().colors.hazard;
    return null;
  }
  await render(
    <>
      <Probe />
      <WallEventRow
        row={feedRow({ kind: 'missed', detail: words('wall.feed.missedWord'), mark: STATUS_MARK.missed.icon, nice: false })}
        onPress={jest.fn()}
        onReactions={jest.fn()}
      />
    </>,
  );
  expect(screen.getByText(words('wall.feed.missedWord'))).toHaveStyle({ color: hazard });
  await screen.rerender(<WallEventRow row={feedRow()} onPress={jest.fn()} onReactions={jest.fn()} />);
  expect(screen.getByText(words('wall.feed.checking'))).not.toHaveStyle({ color: hazard });
});

it('shows the time on every row, and the kind of news as a plate on the face that leads it', async () => {
  await render(<WallEventRow row={feedRow()} onPress={jest.fn()} onReactions={jest.fn()} />);
  expect(screen.getByText('6h')).toBeTruthy();
  expect(screen.getByTestId('wall-badge-done', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('Food waste caddy out')).toBeTruthy();
});

it('gives a flag still open its time left under its words, and the house news its own plate', async () => {
  await render(
    <WallEventRow
      row={feedRow({
        kind: 'flagged',
        icon: 'flag',
        family: 'flag',
        actor: null,
        title: 'Bins was flagged again after a miss',
        parts: [{ text: 'Bins', bold: true }, { text: ' was flagged again after a miss' }],
        detail: 'Tom’s on call, due by 02:40',
        open: { left: '11h left', late: false },
        reactable: false,
        nice: false,
      })}
     
      onPress={jest.fn()}
      onReactions={jest.fn()}
    />,
  );
  expect(screen.getByTestId('flag-left')).toHaveTextContent('11h left');
  expect(screen.getByTestId('wall-plate-flag', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
