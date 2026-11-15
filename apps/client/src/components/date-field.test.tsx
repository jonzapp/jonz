import { dayName, localDay, wordsFor } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { DateField } from '@/components/date-field';
import { SPACE } from '@/theme';

const words = wordsFor('en', 'housemates');
const TODAY = '2026-11-16';

// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };
// The away view is aria-hidden: a pointer's, not a screen reader's.
const HIDDEN = { includeHiddenElements: true };

function EndsOn({ onChange = () => {} }: { onChange?: (day: string) => void }) {
  const [day, setDay] = useState('2026-12-31');
  return (
    <DateField
      label="Ends on"
      value={day}
      onChange={(next) => {
        setDay(next);
        onChange(next);
      }}
      today={TODAY}
      testID="ends-on"
    />
  );
}

describe('DateField', () => {
  it('shows the day in words with its year, and opens a calendar on its month in a sheet on a phone', async () => {
    await render(<EndsOn />);
    const box = screen.getByTestId('ends-on');
    expect(box).toHaveTextContent(localDay('2026-12-31', 'weekdayDayMonthYear', words));
    expect(box).toHaveProp('aria-haspopup', 'dialog');
    expect(screen.queryByTestId('ends-on-calendar')).toBeNull();
    await fireEvent.press(box);
    expect(screen.getByRole('header', { name: 'Ends on' })).toBeOnTheScreen();
    // It opens on December, the day picked, not on this month.
    expect(screen.getByRole('button', { name: dayName('2026-12-31', words) })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: dayName('2026-11-20', words) })).toBeNull();
  });

  it('puts the calendar away once a day is picked, and shows the new day', async () => {
    const picked = jest.fn();
    await render(<EndsOn onChange={picked} />);
    await fireEvent.press(screen.getByTestId('ends-on'));
    await fireEvent.press(screen.getByRole('button', { name: dayName('2026-12-24', words) }));
    expect(picked).toHaveBeenCalledWith('2026-12-24');
    expect(screen.queryByTestId('ends-on-calendar')).toBeNull();
    expect(screen.getByTestId('ends-on')).toHaveTextContent(localDay('2026-12-24', 'weekdayDayMonthYear', words));
  });

  it('floats the calendar under the box on a laptop, and a tap anywhere else puts it away', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await render(<EndsOn />);
    await fireEvent.press(screen.getByTestId('ends-on'));
    // The box (jest.setup's) is 358 wide at x 16, 200 down and 48 tall: the calendar hangs under it, 360 wide.
    expect(StyleSheet.flatten(screen.getByTestId('ends-on-menu').props.style)).toMatchObject({ top: 248 + SPACE.xs, left: 16, width: 360 });
    expect(screen.getByTestId('ends-on-calendar')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('ends-on-away', HIDDEN), 'responderRelease');
    expect(screen.queryByTestId('ends-on-calendar')).toBeNull();
  });

  it('never offers a day gone by', async () => {
    await render(
      <DateField label="Ends on" value={TODAY} onChange={() => {}} today={TODAY} testID="ends-on" />,
    );
    await fireEvent.press(screen.getByTestId('ends-on'));
    expect(screen.getByRole('button', { name: dayName('2026-11-15', words) })).toBeDisabled();
    expect(screen.getByRole('button', { name: dayName(TODAY, words) })).toBeEnabled();
  });
});
