import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Separator } from '@/components/separator';
import { Switch } from '@/components/switch';
import { TAP } from '@/theme';

it('is a switch a screen reader names, on or off', async () => {
  await render(<Switch value onChange={() => {}} label="Johns due soon" testID="s" />);
  const s = screen.getByRole('switch', { name: 'Johns due soon' });
  expect(s).toBeChecked();
  expect(StyleSheet.flatten(s.props.style)).toMatchObject({ minHeight: TAP, minWidth: TAP });
});

it('turns the other way when tapped', async () => {
  const onChange = jest.fn();
  await render(<Switch value={false} onChange={onChange} label="Deal" testID="s" />);
  expect(screen.getByTestId('s')).not.toBeChecked();
  await fireEvent.press(screen.getByTestId('s'));
  expect(onChange).toHaveBeenCalledWith(true);
});

it('does nothing while switched off', async () => {
  const onChange = jest.fn();
  await render(<Switch value onChange={onChange} label="Deal" disabled testID="s" />);
  await fireEvent.press(screen.getByTestId('s'));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByTestId('s')).toBeDisabled();
});

it('draws a separator a hair thick, across or down, silent to a screen reader', async () => {
  await render(
    <>
      <Separator testID="across" />
      <Separator vertical testID="down" />
      <Separator grow testID="grow" />
    </>,
  );
  const across = StyleSheet.flatten(screen.getByTestId('across', { includeHiddenElements: true }).props.style);
  const down = StyleSheet.flatten(screen.getByTestId('down', { includeHiddenElements: true }).props.style);
  const grow = StyleSheet.flatten(screen.getByTestId('grow', { includeHiddenElements: true }).props.style);
  expect(across).toMatchObject({ height: StyleSheet.hairlineWidth, alignSelf: 'stretch' });
  expect(down).toMatchObject({ width: StyleSheet.hairlineWidth, alignSelf: 'stretch' });
  expect(grow).toMatchObject({ flex: 1 });
  expect(screen.queryByTestId('across')).toBeNull();
});
