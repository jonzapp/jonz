import { BIN_NIGHT, wordsFor } from '@app/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { LogOutIcon } from 'lucide-react-native';
import { Text } from 'react-native';

import { ConfirmSheet } from './confirm-sheet';

const words = wordsFor('en', 'housemates');

const light = BIN_NIGHT.light;

function confirm(props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  return (
    <ConfirmSheet
      visible
      title="Leave Flat 3?"
      body="Your Johns this week go back to the house."
      confirmLabel="Leave the house"
      icon={LogOutIcon}
      onConfirm={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );
}

it('asks under a heading, says what it costs, then the move and Cancel', async () => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  await render(confirm({ onConfirm, onClose }));
  expect(screen.getByRole('header', { name: 'Leave Flat 3?' })).toBeOnTheScreen();
  expect(screen.getByText('Your Johns this week go back to the house.')).toBeOnTheScreen();
  // A hazard outline, words in ink: never filled, never amber.
  expect(screen.getByTestId('confirm')).toHaveStyle({ borderColor: light.hazard, backgroundColor: 'transparent' });
  expect(screen.getByText('Leave the house')).toHaveStyle({ color: light.foreground });
  await fireEvent.press(screen.getByRole('button', { name: 'Leave the house' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await fireEvent.press(within(screen.getByTestId('cancel')).getByText(words('common.shell.cancel')));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("makes the move the sheet's one amber button when it isn't striking anything out", async () => {
  await render(confirm({ tone: 'primary', confirmLabel: 'Re-deal this week' }));
  expect(screen.getByTestId('confirm')).toHaveStyle({ backgroundColor: light.hivis });
});

it('holds both buttons while the move is on its way, and says why it was refused', async () => {
  const onConfirm = jest.fn();
  await render(confirm({ busy: true, problem: "Settle up before you leave.", onConfirm }));
  expect(screen.getByRole('alert')).toHaveTextContent('Settle up before you leave.');
  expect(screen.getByTestId('confirm')).toBeDisabled();
  expect(screen.getByTestId('cancel')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('confirm'));
  expect(onConfirm).not.toHaveBeenCalled();
});

it('puts what the sentence needs beside it under the body, above the move', async () => {
  await render(confirm({ children: <Text>Try again</Text> }));
  const words = screen.getAllByText(/./).map((text) => text.props.children);
  const body = words.indexOf('Your Johns this week go back to the house.');
  expect(words.indexOf('Try again')).toBe(body + 1);
  expect(words.indexOf('Leave the house')).toBeGreaterThan(body + 1);
});

it('shows nothing while shut', async () => {
  await render(confirm({ visible: false }));
  expect(screen.queryByText('Leave Flat 3?')).toBeNull();
});
