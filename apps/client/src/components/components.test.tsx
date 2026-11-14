import { BIN_NIGHT } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CameraIcon } from 'lucide-react-native';

import { TAP } from '@/theme';

import { Button } from './button';
import { HazardTape } from './hazard-tape';
import { LidBar } from './lid';
import { Heading } from './text';
import { Wordmark } from './wordmark';

// Lid dots and hazard tape are decoration, hidden from screen readers, so
// queries have to ask for hidden elements to find them.
const HIDDEN = { includeHiddenElements: true };

describe('Bin Night components', () => {
  it('presses a button, and not a disabled one', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Hand out this week’s Johns" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: "Hand out this week’s Johns" }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<Button label="Hand out this week’s Johns" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('can be just an icon, still named and still a thumb wide', async () => {
    const onPress = jest.fn();
    await render(<Button label="Mark done with a photo" icon={CameraIcon} iconOnly onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Mark done with a photo' });
    expect(screen.queryByText('Mark done with a photo')).toBeNull();
    expect(button).toHaveStyle({ minWidth: TAP, minHeight: TAP });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dresses a link as a button, keeping its look', async () => {
    await render(<Button href="/signin" label="Start your house" />);
    const link = screen.getByRole('link', { name: 'Start your house' });
    expect(link).toHaveProp('href', '/signin');
    expect(link).toHaveStyle({ minHeight: TAP, backgroundColor: BIN_NIGHT.light.hivis });
  });

  it('labels the wordmark for screen readers', async () => {
    await render(<Wordmark />);
    expect(screen.getByLabelText('Jonz')).toBeOnTheScreen();
  });

  it('announces headings as headings', async () => {
    await render(<Heading>The Table</Heading>);
    expect(screen.getByRole('header', { name: 'The Table' })).toBeOnTheScreen();
  });

  it('colours a lid bar by its kind, and an unknown kind as other', async () => {
    const { rerender } = await render(<LidBar lid="bathroom" />);
    expect(screen.getByTestId('lid-bar', HIDDEN)).toHaveStyle({ backgroundColor: BIN_NIGHT.light.bin.bathroom });
    await rerender(<LidBar lid="garden" />);
    expect(screen.getByTestId('lid-bar', HIDDEN)).toHaveStyle({ backgroundColor: BIN_NIGHT.light.bin.other });
  });

  it('draws hazard tape', async () => {
    await render(<HazardTape height={6} />);
    expect(screen.getByTestId('hazard-tape', HIDDEN)).toHaveStyle({ height: 6 });
  });
});
