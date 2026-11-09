import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { LogOutIcon, XIcon } from 'lucide-react-native';

import { WAIT_DELAY, WAIT_MIN } from '@/theme';

import { Button } from './button';
import { ButtonRow } from './button-row';

// A pretend clock: the busy look waits WAIT_DELAY and holds WAIT_MIN.
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

function Pair({ busy, onLeave = () => {}, onCancel = () => {} }: { busy: boolean; onLeave?: () => void; onCancel?: () => void }) {
  return (
    <ButtonRow>
      <Button label="Leave Bin Street" busyLabel="Leaving" icon={LogOutIcon} variant="hazard" busy={busy} onPress={onLeave} testID="leave" />
      <Button label="Cancel" icon={XIcon} variant="outline" onPress={onCancel} testID="cancel" />
    </ButtonRow>
  );
}

const opacity = (testID: string) => (screen.getByTestId(testID).props.style as { opacity: number }).opacity;

describe('a button waiting on the server', () => {
  it("can't be tapped twice, and looks busy only after the delay", async () => {
    const leave = jest.fn();
    await render(<Pair busy onLeave={leave} />);
    await fireEvent.press(screen.getByTestId('leave'));
    expect(leave).not.toHaveBeenCalled();
    expect(screen.getByTestId('leave')).toBeBusy();
    // A fast answer never flashes: the words and icon stay for WAIT_DELAY.
    expect(screen.getByText('Leave Bin Street')).toBeOnTheScreen();
    expect(screen.queryByTestId('button-busy', { includeHiddenElements: true })).toBeNull();
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    expect(screen.getByTestId('button-busy', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Leaving')).toBeOnTheScreen();
  });

  it('keeps its colour while the other buttons in its row go pale', async () => {
    const cancel = jest.fn();
    await render(<Pair busy onCancel={cancel} />);
    // From the tap, nothing else in the row can be pressed, though it isn't pale yet.
    expect(opacity('cancel')).toBe(1);
    await fireEvent.press(screen.getByTestId('cancel'));
    expect(cancel).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(WAIT_DELAY));
    expect(opacity('leave')).toBe(1);
    expect(opacity('cancel')).toBe(0.5);
    await fireEvent.press(screen.getByTestId('cancel'));
    expect(cancel).not.toHaveBeenCalled();
  });

  it('holds the busy look long enough not to blink, then everything comes back', async () => {
    const view = await render(<Pair busy />);
    await act(() => jest.advanceTimersByTime(WAIT_DELAY + 10));
    await view.rerender(<Pair busy={false} />);
    expect(screen.getByText('Leaving')).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTime(WAIT_MIN - 10));
    expect(screen.getByText('Leave Bin Street')).toBeOnTheScreen();
    expect(opacity('cancel')).toBe(1);
    expect(screen.getByTestId('cancel')).toBeEnabled();
  });
});
