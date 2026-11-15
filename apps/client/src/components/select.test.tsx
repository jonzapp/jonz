import { BIN_NIGHT, wordsFor } from '@app/core';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { CopyLine } from '@/components/copy-line';
import { Field } from '@/components/field';
import { measureBox } from '@/components/measure-box';
import { SearchBox } from '@/components/search-box';
import { Select, type SelectOption } from '@/components/select';
import { SPACE, TAP } from '@/theme';

const words = wordsFor('en', 'housemates');
const light = BIN_NIGHT.light;

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const DAYS: SelectOption<number>[] = [
  { value: 1, label: 'Monday' },
  { value: 3, label: 'Wednesday', meta: 'Bins go out the night before' },
  { value: 7, label: 'Sunday' },
];

function Days({ onChange = jest.fn(), small = false }: { onChange?: (day: number) => void; small?: boolean }) {
  const [day, setDay] = useState(1);
  return (
    <Select
      label="Weeks start"
      options={DAYS}
      value={day}
      onChange={(next) => {
        setDay(next);
        onChange(next);
      }}
      small={small}
      hint="Johns are dealt on this day"
      testID="days"
    />
  );
}

describe('Select', () => {
  it("is a box named for what it picks, showing what's chosen, at least a thumb tall", async () => {
    await render(<Days />);
    const box = screen.getByRole('button', { name: 'Weeks start, Monday' });
    expect(box).toBeCollapsed();
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ minHeight: TAP, borderWidth: 1, borderColor: light.mutedForeground });
    expect(screen.getByText('Weeks start')).toBeOnTheScreen();
    expect(screen.getByText('Johns are dealt on this day')).toBeOnTheScreen();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('floats its list under the box, the chosen one ticked, and puts it away once one is picked', async () => {
    const onChange = jest.fn();
    await render(<Days onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('days'));
    expect(screen.getByTestId('days')).toBeExpanded();
    expect(screen.getByTestId('days-choices')).toHaveAccessibleName('Weeks start');
    expect(screen.getByRole('radio', { name: 'Monday' })).toBeChecked();
    // A choice's line on what it does is part of its name.
    expect(screen.getByRole('radio', { name: 'Wednesday, Bins go out the night before' })).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('days-7'));
    expect(onChange).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Weeks start, Sunday' })).toBeCollapsed();
  });

  it("floats its list over the box when the box sits near the window's foot", async () => {
    const { height } = Dimensions.get('window');
    jest.mocked(measureBox).mockImplementationOnce((_box, then) => then({ x: 16, y: height - 60, width: 358, height: 48 }));
    await render(<Days />);
    await fireEvent.press(screen.getByTestId('days'));
    expect(StyleSheet.flatten(screen.getByTestId('days-menu').props.style)).toMatchObject({ bottom: 60 + SPACE.xs, left: 16, width: 358 });
  });

  it('changes nothing when the chosen one is picked again', async () => {
    const onChange = jest.fn();
    await render(<Days onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('days'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Monday' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('when small, is the same box with no name over it, its name still heard', async () => {
    await render(<Days small />);
    expect(screen.queryByText('Weeks start')).toBeNull();
    expect(screen.queryByText('Johns are dealt on this day')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Weeks start, Monday' }));
    expect(screen.getByRole('radio', { name: 'Sunday' })).toBeOnTheScreen();
  });
});

describe('the input group', () => {
  it("gives a password's box Show at its end, which shows what's typed until it's pressed again", async () => {
    await render(<Field label="Password" value="hunter22" secureTextEntry testID="pw" />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: words('common.password.show') }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    await fireEvent.press(screen.getByRole('button', { name: words('common.password.hide') }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('gives any other box nothing at its end', async () => {
    await render(<Field label="House name" value="" testID="name" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the search box and an address to copy in the same edged box', async () => {
    await render(
      <>
        <SearchBox value="" onChange={() => {}} placeholder="Search zones" testID="zones" />
        <CopyLine value="support@jonz.app" testID="address" />
      </>,
    );
    for (const id of ['zones', 'address']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toMatchObject({ minHeight: TAP, borderWidth: 1, borderColor: light.mutedForeground });
    }
    await fireEvent.press(screen.getByTestId('address-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('support@jonz.app');
    expect(await screen.findByText(words('common.copy.done'))).toBeOnTheScreen();
  });
});
