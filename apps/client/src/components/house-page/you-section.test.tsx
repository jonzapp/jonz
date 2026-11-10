import { PASSWORD_MIN, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { signOut } from '@/api/auth';
import { loadHouse } from '@/api/board';
import { renameMe } from '@/api/profile';
import { reminderSupport, remindersOn } from '@/api/push';
import { authStorage } from '@/api/storage';
import { useHouse } from '@/hooks/use-house';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

import { YouSection } from './you-section';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/email-auth', () => ({ emailSignIn: jest.fn(async () => null), setPassword: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/profile', () => ({ renameMe: jest.fn() }));
jest.mock('@/api/push', () => ({
  reminderSupport: jest.fn(),
  remindersOn: jest.fn(),
  turnRemindersOn: jest.fn(),
  turnRemindersOff: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

/** You on its own, once the house is read. */
async function open() {
  function Host() {
    const { view } = useHouse('h1', 'priya');
    return view ? <YouSection houseId="h1" userId="priya" view={view} /> : null;
  }
  await renderPages({ 'house/index': Host }, '/house');
  await screen.findByTestId('you-section');
}

beforeEach(() => {
  jest.clearAllMocks();
  authStorage!.clear();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (reminderSupport as jest.Mock).mockReturnValue('none');
  (remindersOn as jest.Mock).mockResolvedValue(false);
  for (const move of [renameMe, signOut]) (move as jest.Mock).mockResolvedValue(undefined);
});

it('says your moving-out day, or that none is planned, and pushes its page', async () => {
  await open();
  expect(screen.getByTestId('to-moving')).toHaveTextContent(new RegExp(`${words('house.moving.row')}.*${words('house.moving.notPlanned')}`));
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({ members: base.members.map((m) => (m.userId === 'priya' ? { ...m, movingOutOn: '2026-11-11' } : m)) }),
  );
  await open();
  expect(screen.getByTestId('to-moving')).toHaveTextContent(/Wed 11 Nov/);
});

it('says your preferences in a line, and pushes their page', async () => {
  await open();
  expect(screen.getByTestId('to-prefs')).toHaveTextContent(new RegExp(`${words('week.steady.prefs')}.*${words('week.steady.prefsNone')}`));
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({ members: base.members.map((m) => (m.userId === 'priya' ? { ...m, prefs: { days: [3, 6], bestTime: 'evening', rather: {} } } : m)) }),
  );
  await open();
  expect(screen.getByTestId('to-prefs')).toHaveTextContent(/Wed, Sat, evenings/);
});

it('shows your name, and changes it in a sheet', async () => {
  await open();
  expect(screen.getByRole('header', { name: words('house.month.you') })).toBeOnTheScreen();
  expect(screen.getByTestId('to-name')).toHaveTextContent(/Name.*Priya/);
  await fireEvent.press(within(screen.getByTestId('to-name')).getByRole('button'));
  const sheet = within(screen.getByTestId('name-sheet'));
  expect(sheet.getByRole('header', { name: words('house.lower.rename') })).toBeOnTheScreen();
  // Nothing to save until the name is different.
  expect(sheet.getByTestId('save-name')).toBeDisabled();
  await fireEvent.changeText(sheet.getByLabelText(words('people.me.name')), 'Pri');
  await fireEvent.press(sheet.getByTestId('save-name'));
  expect(renameMe).toHaveBeenCalledWith('priya', 'Pri');
  await waitFor(() => expect(screen.queryByTestId('name-sheet')).toBeNull());
  // Saved, the house is read again for the new name.
  await waitFor(() => expect(loadHouse).toHaveBeenCalledTimes(2));
});

it('saves once from the keyboard, and not at all while the name is unchanged', async () => {
  let answer: () => void = () => undefined;
  (renameMe as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (answer = resolve)));
  await open();
  await fireEvent.press(within(screen.getByTestId('to-name')).getByRole('button'));
  const field = within(screen.getByTestId('name-sheet')).getByLabelText(words('people.me.name'));
  await fireEvent(field, 'submitEditing');
  expect(renameMe).not.toHaveBeenCalled();
  await fireEvent.changeText(field, 'Pri');
  await fireEvent(field, 'submitEditing');
  await fireEvent(field, 'submitEditing');
  expect(renameMe).toHaveBeenCalledTimes(1);
  answer();
  await waitFor(() => expect(screen.queryByTestId('name-sheet')).toBeNull());
});

it("says why the name didn't save, in the sheet, and keeps it open", async () => {
  (renameMe as jest.Mock).mockRejectedValue(new Error('Your name needs a letter or two.'));
  await open();
  await fireEvent.press(within(screen.getByTestId('to-name')).getByRole('button'));
  const sheet = within(screen.getByTestId('name-sheet'));
  await fireEvent.changeText(sheet.getByLabelText(words('people.me.name')), '  ');
  await fireEvent.press(sheet.getByTestId('save-name'));
  expect(await sheet.findByRole('alert')).toHaveTextContent('Your name needs a letter or two.');
  expect(screen.getByTestId('name-sheet')).toBeOnTheScreen();
});

it('starts the sheet from your name each time it opens', async () => {
  await open();
  await fireEvent.press(within(screen.getByTestId('to-name')).getByRole('button'));
  await fireEvent.changeText(screen.getByLabelText(words('people.me.name')), 'Half typed');
  await fireEvent.press(screen.getByTestId('sheet-close'));
  await fireEvent.press(within(screen.getByTestId('to-name')).getByRole('button'));
  expect(screen.getByLabelText(words('people.me.name'))).toHaveDisplayValue('Priya');
});

it('leaves out reminders where this device has none to offer', async () => {
  await open();
  expect(screen.queryByTestId('to-reminders')).toBeNull();
});

it("says whether this device's reminders are on, and holds their switch in a sheet", async () => {
  (reminderSupport as jest.Mock).mockReturnValue('ready');
  (remindersOn as jest.Mock).mockResolvedValue(true);
  await open();
  await waitFor(() => expect(screen.getByTestId('to-reminders')).toHaveTextContent(/Reminders.*On/));
  await fireEvent.press(within(screen.getByTestId('to-reminders')).getByRole('button'));
  const sheet = within(screen.getByTestId('reminders-sheet'));
  // Its title says Reminders, as every sheet's does, and the control doesn't say it again.
  expect(sheet.getByRole('header', { name: words('house.lower.reminders') })).toBeOnTheScreen();
  expect(sheet.getAllByText(new RegExp(`^${words('house.lower.reminders')}$`, 'i'))).toHaveLength(1);
  expect(sheet.getByTestId('reminders')).toBeOnTheScreen();
});

it("is as tall before it knows whether reminders are on as after, so nothing below moves", async () => {
  (reminderSupport as jest.Mock).mockReturnValue('ready');
  (remindersOn as jest.Mock).mockReturnValue(new Promise(() => undefined));
  await open();
  expect(screen.getByTestId('to-reminders')).toHaveStyle({ minHeight: 64 });
  expect(screen.getByTestId('to-reminders')).not.toHaveTextContent(/On|Off/);
});

it('chooses the look in the row itself', async () => {
  await open();
  const look = within(screen.getByTestId('look'));
  expect(look.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await fireEvent.press(look.getByRole('radio', { name: 'Day' }));
  expect(look.getByRole('radio', { name: 'Day' })).toBeChecked();
  expect(look.getByRole('radio', { name: 'Auto' })).not.toBeChecked();
});

it('signs you out', async () => {
  await open();
  await fireEvent.press(within(screen.getByTestId('sign-out')).getByRole('button', { name: words('house.lower.signOut') }));
  expect(signOut).toHaveBeenCalledTimes(1);
});

it('adds a password in a sheet, for an account with an email address', async () => {
  const { emailSignIn, setPassword } = jest.requireMock<{ emailSignIn: jest.Mock; setPassword: jest.Mock }>('@/api/email-auth');
  emailSignIn.mockResolvedValue({ email: 'priya@example.com', hasPassword: false });
  setPassword.mockResolvedValue(undefined);
  await open();
  const row = await screen.findByTestId('to-password');
  expect(row).toHaveTextContent(new RegExp(`${words('door.password.label')}.*${words('door.password.add')}`));
  await fireEvent.press(within(row).getByRole('button'));
  const sheet = within(screen.getByTestId('password-sheet'));
  expect(sheet.getByText(words('door.password.addBody', { email: 'priya@example.com' }))).toBeOnTheScreen();
  await fireEvent.changeText(sheet.getByTestId('new-password'), 'short');
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(setPassword).not.toHaveBeenCalled();
  expect(sheet.getByRole('alert')).toHaveTextContent(words("door.email.shortPassword", { min: PASSWORD_MIN }));
  await fireEvent.changeText(sheet.getByTestId('new-password'), 'long enough');
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(setPassword).toHaveBeenCalledWith('long enough', undefined);
  expect(sheet.getByText(words('door.password.saved'))).toBeOnTheScreen();
});

it('asks for the authenticator code when the account has one, then saves the password', async () => {
  const { emailSignIn, setPassword } = jest.requireMock<{ emailSignIn: jest.Mock; setPassword: jest.Mock }>('@/api/email-auth');
  emailSignIn.mockResolvedValue({ email: 'glyn@example.com', hasPassword: false });
  setPassword
    .mockRejectedValueOnce({ code: 'insufficient_aal', status: 401 })
    .mockRejectedValueOnce({ code: 'authenticator_wrong' })
    .mockResolvedValueOnce(undefined);
  await open();
  const row = await screen.findByTestId('to-password');
  await fireEvent.press(within(row).getByRole('button'));
  const sheet = within(screen.getByTestId('password-sheet'));
  expect(sheet.queryByTestId('password-authenticator')).toBeNull();
  await fireEvent.changeText(sheet.getByTestId('new-password'), 'long enough');
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(sheet.getByText(words('door.password.authenticatorBody'))).toBeOnTheScreen();
  expect(sheet.queryByText(words('door.password.saved'))).toBeNull();
  // Save with no code yet: it asks for all six digits first.
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(setPassword).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(sheet.getByTestId('password-authenticator'), '111111');
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(setPassword).toHaveBeenLastCalledWith('long enough', '111111');
  expect(sheet.getByRole('alert')).toHaveTextContent(words('door.password.wrongAuthenticator'));
  await fireEvent.changeText(sheet.getByTestId('password-authenticator'), '222222');
  await fireEvent.press(sheet.getByRole('button', { name: words('door.password.save') }));
  expect(setPassword).toHaveBeenLastCalledWith('long enough', '222222');
  expect(sheet.getByText(words('door.password.saved'))).toBeOnTheScreen();
});

it('leaves out the password row for an account with no email address', async () => {
  jest.requireMock<{ emailSignIn: jest.Mock }>('@/api/email-auth').emailSignIn.mockResolvedValue(null);
  await open();
  await waitFor(() => expect(screen.getByTestId('sign-out')).toBeOnTheScreen());
  expect(screen.queryByTestId('to-password')).toBeNull();
});
