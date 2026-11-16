import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { Slider } from '@/components/slider';

// Jest's stand-in for measureBox puts the track at x 16, 358 wide (jest.setup.js).
const TRACK = { x: 16, width: 358 };

function slider(value: number, onChange = jest.fn()) {
  return <Slider label="Effort" value={value} min={1} max={20} marks={[1, 5, 20]} shown={`${value} pts`} onChange={onChange} testID="effort" />;
}

describe('Slider', () => {
  it('is heard as a slider named for what it sets, at its value in words, and shows it over the track', async () => {
    await render(slider(5));
    const knob = screen.getByRole('slider');
    expect(knob).toHaveAccessibleName('Effort');
    expect(knob).toHaveAccessibilityValue({ min: 1, max: 20, now: 5, text: '5 pts' });
    expect(screen.getByText('5 pts')).toBeOnTheScreen();
    // The ink part runs to the value's place: 5 is 4 steps of 19 along.
    expect(StyleSheet.flatten(screen.getByTestId('effort-fill').props.style).width).toBe(`${(4 / 19) * 100}%`);
  });

  it('moves a step at a time when a screen reader swipes it, and stops at its ends', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(slider(5, onChange));
    await fireEvent(screen.getByRole('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(6);
    await fireEvent(screen.getByRole('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(4);
    onChange.mockClear();
    await rerender(slider(20, onChange));
    await fireEvent(screen.getByRole('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('goes to where the track is pressed, in whole numbers, and follows a drag', async () => {
    const onChange = jest.fn();
    await render(slider(5, onChange));
    const track = screen.getByRole('slider');
    await fireEvent(track, 'responderGrant', { nativeEvent: { pageX: TRACK.x + TRACK.width } });
    expect(onChange).toHaveBeenLastCalledWith(20);
    await fireEvent(track, 'responderMove', { nativeEvent: { pageX: TRACK.x + TRACK.width / 2 } });
    expect(onChange).toHaveBeenLastCalledWith(11);
    // Beyond either end it holds at the end.
    await fireEvent(track, 'responderMove', { nativeEvent: { pageX: 0 } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('takes the keys on the web: arrows a step, Page Up and Down five, Home and End to the ends', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const onChange = jest.fn();
    await render(slider(5, onChange));
    const press = (key: string) => fireEvent(screen.getByRole('slider'), 'keyDown', { key, preventDefault: jest.fn() });
    await press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith(6);
    await press('ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith(4);
    await press('PageUp');
    expect(onChange).toHaveBeenLastCalledWith(10);
    await press('Home');
    expect(onChange).toHaveBeenLastCalledWith(1);
    await press('End');
    expect(onChange).toHaveBeenLastCalledWith(20);
    onChange.mockClear();
    await press('a');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks its numbers under the track, out of what a screen reader reads', async () => {
    await render(slider(5));
    for (const mark of ['1', '5', '20']) expect(screen.getByText(mark, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('20')).toBeNull();
  });
});
