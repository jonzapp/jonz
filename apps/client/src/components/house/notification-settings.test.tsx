import { DEFAULT_PREFS, wordsFor } from '@app/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { loadPrefs, savePrefs } from '@/api/notification-prefs';

import { NotificationSettings } from './notification-settings';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/notification-prefs', () => ({
  loadPrefs: jest.fn(),
  savePrefs: jest.fn(),
}));

const load = loadPrefs as jest.Mock;
const save = savePrefs as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  load.mockResolvedValue(DEFAULT_PREFS);
  save.mockResolvedValue(undefined);
});

it('lists every kind, on until you say otherwise, and no quiet hours', async () => {
  await render(<NotificationSettings userId="ava" />);
  for (const kind of ['reminders', 'checks', 'flags', 'deal'] as const) {
    expect(await screen.findByText(words(`house.notify.kind.${kind}`))).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: words(`house.notify.kind.${kind}`) })).toBeChecked();
  }
  expect(within(screen.getByTestId('quiet-hours')).getByRole('radio', { name: 'Off' })).toBeChecked();
});

it('saves a kind switched off, and says so', async () => {
  await render(<NotificationSettings userId="ava" />);
  await fireEvent.press(await screen.findByTestId('push-checks'));
  expect(save).toHaveBeenCalledWith('ava', { ...DEFAULT_PREFS, checks: false });
  expect(screen.getByTestId('push-checks')).not.toBeChecked();
  expect(await screen.findByText(words('house.notify.saved'))).toBeOnTheScreen();
});

it('saves quiet hours', async () => {
  await render(<NotificationSettings userId="ava" />);
  await fireEvent.press(within(await screen.findByTestId('quiet-hours')).getByRole('radio', { name: '22:00–07:00' }));
  expect(save).toHaveBeenCalledWith('ava', { ...DEFAULT_PREFS, quietFrom: 22, quietUntil: 7 });
});

it('puts a switch back when the save fails, and says so', async () => {
  save.mockRejectedValueOnce(new Error('offline'));
  await render(<NotificationSettings userId="ava" />);
  await fireEvent.press(await screen.findByTestId('push-deal'));
  expect(await screen.findByRole('alert')).toHaveTextContent(words('house.notify.failed'));
  expect(screen.getByTestId('push-deal')).toBeChecked();
});
