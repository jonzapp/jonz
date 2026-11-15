import { BIN_NIGHT, wordsFor } from '@app/core';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { InfoIcon, XIcon } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Popover } from '@/components/popover';
import { TIP_DELAY } from '@/components/tooltip';
import { SPACE } from '@/theme';

const words = wordsFor('en', 'housemates');
const light = BIN_NIGHT.light;

// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));
// The tooltip is aria-hidden: the button already says its name.
const HIDDEN = { includeHiddenElements: true };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

function Shares() {
  return (
    <Popover
      title="Fair shares"
      description="What each of you has done since you joined."
      opener={(open, isOpen) => (
        <Pressable accessibilityRole="button" accessibilityLabel="Sam is 2 pts behind" aria-expanded={isOpen} onPress={open} testID="opener">
          <InfoIcon aria-hidden />
        </Pressable>
      )}
      testID="shares"
    >
      <Text>You +2</Text>
    </Popover>
  );
}

describe('Popover', () => {
  it('opens as a sheet on a phone, headed by its title and description', async () => {
    await render(<Shares />);
    expect(screen.queryByText('You +2')).toBeNull();
    await fireEvent.press(screen.getByTestId('opener'));
    expect(screen.getByRole('header', { name: 'Fair shares' })).toBeOnTheScreen();
    expect(screen.getByText('What each of you has done since you joined.')).toBeOnTheScreen();
    expect(screen.getByText('You +2')).toBeOnTheScreen();
    expect(screen.queryByTestId('shares-menu')).toBeNull();
  });

  it('floats as a card beside what opened it on a laptop, its right edge on the opener’s, and goes at a tap anywhere else', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await render(<Shares />);
    await fireEvent.press(screen.getByTestId('opener'));
    // The opener (jest.setup's box) is 358 wide at x 16, 248 down: the card hangs under it.
    expect(StyleSheet.flatten(screen.getByTestId('shares-menu').props.style)).toMatchObject({ top: 248 + SPACE.xs, right: 1440 - 16 - 358, width: 380 });
    const card = screen.getByTestId('shares');
    expect(card).toHaveStyle({ backgroundColor: light.popover });
    expect(screen.getByRole('header', { name: 'Fair shares' })).toBeOnTheScreen();
    expect(screen.getByText('You +2')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('shares-away', HIDDEN), 'responderRelease');
    expect(screen.queryByText('You +2')).toBeNull();
  });
});

describe('Tooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'web');
  });
  afterEach(() => jest.useRealTimers());

  it("shows an icon's name under it once the mouse rests there, and puts it away when it leaves", async () => {
    await render(<IconButton icon={XIcon} label={words('common.shell.close')} onPress={() => {}} testID="close" />);
    await fireEvent(screen.getByTestId('close'), 'hoverIn');
    expect(screen.queryByTestId('tooltip', HIDDEN)).toBeNull();
    await act(async () => jest.advanceTimersByTime(TIP_DELAY));
    const tip = screen.getByTestId('tooltip', HIDDEN);
    expect(tip).toHaveTextContent(words('common.shell.close'));
    expect(tip).toHaveStyle({ backgroundColor: light.foreground, left: 0 });
    // A screen reader already hears the button's own name.
    expect(tip).toHaveProp('aria-hidden', true);
    await fireEvent(screen.getByTestId('close'), 'hoverOut');
    expect(screen.queryByTestId('tooltip', HIDDEN)).toBeNull();
  });

  it('shows straight away when the keyboard lands on it, not for a click', async () => {
    await render(<IconButton icon={XIcon} label={words('common.shell.close')} onPress={() => {}} testID="close" />);
    await fireEvent(screen.getByTestId('close'), 'focus', { nativeEvent: { target: { matches: () => false } } });
    expect(screen.queryByTestId('tooltip', HIDDEN)).toBeNull();
    await fireEvent(screen.getByTestId('close'), 'focus', { nativeEvent: { target: { matches: (q: string) => q === ':focus-visible' } } });
    expect(screen.getByTestId('tooltip', HIDDEN)).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('close'), 'blur');
    expect(screen.queryByTestId('tooltip', HIDDEN)).toBeNull();
  });

  it('is only for an icon on its own: a button with words has none', async () => {
    await render(<Button label="Save" onPress={() => {}} testID="save" />);
    await fireEvent(screen.getByTestId('save'), 'hoverIn');
    await act(async () => jest.advanceTimersByTime(TIP_DELAY));
    expect(screen.queryByTestId('tooltip', HIDDEN)).toBeNull();
  });
});
