import { fireEvent, render, screen } from '@testing-library/react-native';

import { reminderSupport, remindersOn, turnRemindersOff, turnRemindersOn } from '@/api/push';

import { Reminders } from './reminders';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/notification-prefs', () => ({
  loadPrefs: jest.fn(async () => (jest.requireActual('@app/core') as typeof import('@app/core')).DEFAULT_PREFS),
  savePrefs: jest.fn(),
}));

jest.mock('@/api/push', () => ({
  reminderSupport: jest.fn(),
  remindersOn: jest.fn(),
  turnRemindersOn: jest.fn(),
  turnRemindersOff: jest.fn(),
}));

const support = reminderSupport as jest.Mock;
const isOn = remindersOn as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  support.mockReturnValue('ready');
  isOn.mockResolvedValue(false);
  (turnRemindersOn as jest.Mock).mockResolvedValue('on');
  (turnRemindersOff as jest.Mock).mockResolvedValue(undefined);
});

it('shows nothing where there is nothing to offer yet (a phone, or no key)', async () => {
  support.mockReturnValue('none');
  await render(<Reminders userId="ava" />);
  expect(screen.queryByTestId('reminders')).toBeNull();
});

it('heads itself, unless something round it already says Reminders', async () => {
  const { rerender } = await render(<Reminders userId="ava" />);
  expect(screen.getByText(words('people.me.reminders'))).toBeOnTheScreen();
  await rerender(<Reminders userId="ava" labelled={false} />);
  expect(screen.queryByText(words('people.me.reminders'))).toBeNull();
  expect(await screen.findByRole('button', { name: words('house.reminders.on') })).toBeOnTheScreen();
});

it('says what an iPhone needs first, in a browser without notifications', async () => {
  support.mockReturnValue('unsupported');
  await render(<Reminders userId="ava" />);
  expect(screen.getByText(words('house.reminders.unsupported'))).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: words('house.reminders.on') })).toBeNull();
});

it('turns reminders on, and says so', async () => {
  await render(<Reminders userId="ava" />);
  await fireEvent.press(await screen.findByRole('button', { name: words('house.reminders.on') }));
  expect(turnRemindersOn).toHaveBeenCalledWith('ava');
  expect(await screen.findByText(words('house.reminders.turnedOn'))).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: words('house.reminders.off') })).toBeOnTheScreen();
});

it('says when the browser blocked them, or it failed', async () => {
  (turnRemindersOn as jest.Mock).mockResolvedValueOnce('blocked').mockRejectedValueOnce(new Error('no push service'));
  await render(<Reminders userId="ava" />);
  await fireEvent.press(await screen.findByRole('button', { name: words('house.reminders.on') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(words('house.reminders.blocked'));
  await fireEvent.press(screen.getByRole('button', { name: words('house.reminders.on') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(words('house.reminders.failed'));
});

it('turns them off on a device that has them', async () => {
  isOn.mockResolvedValue(true);
  await render(<Reminders userId="ava" />);
  await fireEvent.press(await screen.findByRole('button', { name: words('house.reminders.off') }));
  expect(turnRemindersOff).toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: words('house.reminders.on') })).toBeOnTheScreen();
});

it('offers what to send once reminders are on, and not before', async () => {
  await render(<Reminders userId="ava" />);
  await screen.findByRole('button', { name: words('house.reminders.on') });
  expect(screen.queryByTestId('notification-settings')).toBeNull();
  isOn.mockResolvedValue(true);
  await render(<Reminders userId="ava" />);
  expect(await screen.findByTestId('notification-settings')).toBeOnTheScreen();
});
