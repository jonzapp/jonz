import { REACTION_LABEL, STATUS_MARK, type WallFeedRow } from '@app/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { NiceToggle, ReactButton, ReactionTally, WallEventRow } from './wall-row';

import { useTheme } from '@/theme';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

afterEach(() => jest.restoreAllMocks());

it('says how many gave a Nice one, and is pressed in a browser once it is yours', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const onPress = jest.fn();
  await render(<NiceToggle count={2} mine onPress={onPress} />);
  const toggle = screen.getByRole('button', { name: words('wall.feed.tally', { label: REACTION_LABEL.nice, count: 2 }) });
  expect(toggle).toHaveProp('aria-pressed', true);
  expect(toggle).not.toHaveProp('aria-selected');
  await fireEvent.press(toggle);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('is selected on a phone, which has no pressed, and says just its name before anyone gives it', async () => {
  await render(<NiceToggle count={0} mine={false} onPress={jest.fn()} />);
  const toggle = screen.getByRole('button', { name: REACTION_LABEL.nice });
  expect(toggle).not.toBeSelected();
  // Only the room for a count, unseen and unheard, so the thumbs down a group line up.
  expect(within(toggle).queryByText(/\d/)).toBeNull();
  expect(within(toggle).getByText('0', { includeHiddenElements: true })).toBeTruthy();
});

it('shows all four when held down, as the row does', async () => {
  const onLongPress = jest.fn();
  await render(<NiceToggle count={1} mine={false} onPress={jest.fn()} onLongPress={onLongPress} />);
  await fireEvent(screen.getByTestId('nice-one'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

it('says what the house gave most, and opens all four reactions', async () => {
  const onPress = jest.fn();
  await render(<ReactionTally kind="fire" count={3} onPress={onPress} />);
  const tally = screen.getByRole('button', { name: words('wall.feed.tally', { label: REACTION_LABEL.fire, count: 3 }) });
  expect(tally).toHaveTextContent('3');
  await fireEvent.press(tally);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('offers a way to react where there are none yet', async () => {
  const onPress = jest.fn();
  await render(<ReactButton onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: words('wall.feed.react') }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

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
  ...overrides,
});

it("gives a housemate's tick a key's way to all four reactions beside its Nice one", async () => {
  const onReactions = jest.fn();
  const onReact = jest.fn();
  await render(<WallEventRow row={feedRow()} onReact={onReact} onPress={jest.fn()} onReactions={onReactions} />);
  await fireEvent.press(screen.getByRole('button', { name: words('wall.feed.react') }));
  expect(onReactions).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: words('wall.feed.tally', { label: REACTION_LABEL.nice, count: 2 }) }));
  expect(onReact).toHaveBeenCalledWith('nice', true);
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
        onReact={jest.fn()}
        onPress={jest.fn()}
        onReactions={jest.fn()}
      />
    </>,
  );
  expect(screen.getByText(words('wall.feed.missedWord'))).toHaveStyle({ color: hazard });
  await screen.rerender(<WallEventRow row={feedRow()} onReact={jest.fn()} onPress={jest.fn()} onReactions={jest.fn()} />);
  expect(screen.getByText(words('wall.feed.checking'))).not.toHaveStyle({ color: hazard });
});

it('shows the time on every row, and the kind of news as a plate on the face that leads it', async () => {
  await render(<WallEventRow row={feedRow()} onReact={jest.fn()} onPress={jest.fn()} onReactions={jest.fn()} />);
  expect(screen.getByText('6h')).toBeTruthy();
  expect(screen.getByTestId('wall-badge-done', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('Food waste caddy out')).toBeTruthy();
});

it('gives a flag still open its time left in place of a reaction, and the house news its own plate', async () => {
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
      onReact={jest.fn()}
      onPress={jest.fn()}
      onReactions={jest.fn()}
    />,
  );
  expect(screen.getByTestId('flag-left')).toHaveTextContent('11h left');
  expect(screen.getByTestId('wall-plate-flag', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: words('wall.feed.react') })).toBeNull();
});
