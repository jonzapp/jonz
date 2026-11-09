import { FOCUS_SHELL_COPY } from '@app/core';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { WAIT_DELAY, WAIT_MIN } from '@/theme';

import { Group } from './group';
import { OutlineRows } from './outline';
import { Waiting } from './waiting';

// A pretend clock throughout: the waits are about time, never the real one.
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

const Table = () => <Text>The Table</Text>;
const outline = (
  <Group>
    <OutlineRows count={3} />
  </Group>
);
// The outline's bars are hidden from a screen reader, which hears the label.
const hidden = { includeHiddenElements: true };

describe('a part that reads before it shows', () => {
  it('shows nothing for a fast read, so it never flashes', async () => {
    const view = await render(
      <Waiting ready={false} label="Reading the Table" outline={outline}>
        <Table />
      </Waiting>,
    );
    // Busy for a screen reader at once, but nothing drawn yet.
    expect(screen.getByTestId('waiting')).toHaveProp('aria-busy', true);
    expect(screen.getByLabelText('Reading the Table')).toBeOnTheScreen();
    expect(screen.queryByTestId('hairline', hidden)).toBeNull();
    await act(() => jest.advanceTimersByTime(WAIT_DELAY - 1));
    await view.rerender(
      <Waiting ready label="Reading the Table" outline={outline}>
        <Table />
      </Waiting>,
    );
    expect(screen.getByText('The Table')).toBeOnTheScreen();
    expect(screen.queryByTestId('waiting')).toBeNull();
  });

  it('shows the outline after the delay, and holds it long enough not to blink', async () => {
    const view = await render(
      <Waiting ready={false} outline={outline}>
        <Table />
      </Waiting>,
    );
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    // Three rows in outline, each with its hairline (the group hides the first).
    expect(screen.getAllByTestId('hairline', hidden)).toHaveLength(3);
    await act(() => jest.advanceTimersByTime(10));
    await view.rerender(
      <Waiting ready outline={outline}>
        <Table />
      </Waiting>,
    );
    // Read 10ms after the outline showed: it stays until WAIT_MIN is up.
    expect(screen.queryByText('The Table')).toBeNull();
    await act(() => jest.advanceTimersByTime(WAIT_MIN - 11));
    expect(screen.queryByText('The Table')).toBeNull();
    await act(() => jest.advanceTimersByTime(1));
    expect(screen.getByText('The Table')).toBeOnTheScreen();
  });

  it('says the house is reading, with a page in outline, when nothing else is given', async () => {
    await render(
      <Waiting ready={false}>
        <Table />
      </Waiting>,
    );
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    expect(screen.getByLabelText(FOCUS_SHELL_COPY.reading)).toBeOnTheScreen();
    expect(screen.getAllByTestId('hairline', hidden).length).toBeGreaterThan(0);
  });

  it('calls a function child only once it has read', async () => {
    const child = jest.fn(() => <Table />);
    const view = await render(<Waiting ready={false}>{child}</Waiting>);
    expect(child).not.toHaveBeenCalled();
    await view.rerender(<Waiting ready>{child}</Waiting>);
    expect(child).toHaveBeenCalled();
    expect(screen.getByText('The Table')).toBeOnTheScreen();
  });

  it('shows the sentence and Try again when the read fails', async () => {
    const retry = jest.fn();
    await render(
      <Waiting ready={false} failed onRetry={retry}>
        <Table />
      </Waiting>,
    );
    expect(screen.getByText(FOCUS_SHELL_COPY.unreadable)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(FOCUS_SHELL_COPY.retry));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
