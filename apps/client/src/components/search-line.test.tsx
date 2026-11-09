import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DIM, WAIT_DELAY } from '@/theme';

import { Dimmed, SearchLine } from './search-line';

beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

function List({ searching }: { searching: boolean }) {
  return (
    <>
      <SearchLine searching={searching} label="Searching the audit log" />
      <Dimmed searching={searching} testID="dimmed">
        <Text testID="rows">Old rows</Text>
      </Dimmed>
    </>
  );
}

describe('a list finding results for a new search', () => {
  it('keeps the old rows and lights the line only after the delay', async () => {
    await render(<List searching />);
    expect(screen.getByTestId('search-line')).not.toBeBusy();
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    expect(screen.getByTestId('search-line')).toBeBusy();
    expect(screen.getByLabelText('Searching the audit log')).toBeOnTheScreen();
    expect(screen.getByTestId('dimmed')).toHaveStyle({ opacity: DIM });
  });

  it('never flickers for a fast search', async () => {
    const view = await render(<List searching />);
    await act(() => jest.advanceTimersByTime(WAIT_DELAY - 1));
    await view.rerender(<List searching={false} />);
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    expect(screen.getByTestId('search-line')).not.toBeBusy();
  });
});
