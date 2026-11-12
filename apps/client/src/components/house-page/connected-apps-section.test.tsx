import { dayLabel, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { appAccess, connectedApps, disconnectApp, setAppAccess } from '@/api/connected-apps';
import { renderPages } from '@/testing/pages';

import { ConnectedAppsSection } from './connected-apps-section';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/connected-apps', () => ({ connectedApps: jest.fn(), disconnectApp: jest.fn(), appAccess: jest.fn(), setAppAccess: jest.fn() }));

const list = connectedApps as jest.Mock;
const access = appAccess as jest.Mock;
const setAccess = setAppAccess as jest.Mock;
const disconnect = disconnectApp as jest.Mock;
const CLAUDE = { client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' }, scopes: ['email'], granted_at: '2027-01-04T09:30:00Z' };
const since = () => dayLabel(new Date(CLAUDE.granted_at), 'Europe/London', words);
const radio = (access: 'read' | 'write') =>
  access === 'read'
    ? { name: `${words('people.appAccess.read')}, ${words('people.appAccess.readMeta')}` }
    : { name: `${words('people.appAccess.write')}, ${words('people.appAccess.writeMeta')}` };

const open = () => renderPages({ index: () => <ConnectedAppsSection zone="Europe/London" /> }, '/');

beforeEach(() => jest.clearAllMocks());

it('lists the apps you let in, what each may do and since when, and disconnects one from its sheet', async () => {
  list.mockResolvedValueOnce([CLAUDE]).mockResolvedValue([]);
  access.mockResolvedValue({ c1: 'write' });
  disconnect.mockResolvedValue(undefined);
  await open();
  const row = await screen.findByTestId('connected-app');
  expect(row).toHaveTextContent(/^Claude/);
  await waitFor(() => expect(row).toHaveTextContent(words('people.connectedApps.since', { access: words('people.appAccess.write'), date: since() }), { exact: false }));
  await fireEvent.press(row);
  const sheet = screen.getByTestId('app-sheet');
  expect(within(sheet).getByRole('radio', radio('write'))).toBeChecked();
  await fireEvent.press(within(sheet).getByRole('button', { name: words('people.connectedApps.disconnect') }));
  expect(screen.getByText(words('people.connectedApps.confirm', { app: 'Claude' }))).toBeOnTheScreen();
  await fireEvent.press(within(screen.getByTestId('disconnect-sheet')).getByRole('button', { name: words('people.connectedApps.disconnect') }));
  expect(disconnect).toHaveBeenCalledWith('c1');
  await waitFor(() => expect(screen.getByText(words('people.connectedApps.none'))).toBeOnTheScreen());
});

it('says an app you never picked for is read only, and changes it from its sheet', async () => {
  list.mockResolvedValue([CLAUDE]);
  access.mockResolvedValue({});
  setAccess.mockResolvedValue(undefined);
  await open();
  const row = await screen.findByTestId('connected-app');
  await waitFor(() => expect(row).toHaveTextContent(words('people.connectedApps.since', { access: words('people.appAccess.read'), date: since() }), { exact: false }));
  await fireEvent.press(row);
  const sheet = screen.getByTestId('app-sheet');
  expect(within(sheet).getByRole('radio', radio('read'))).toBeChecked();
  await fireEvent.press(within(sheet).getByRole('radio', radio('write')));
  expect(setAccess).toHaveBeenCalledWith('c1', 'write');
  await waitFor(() => expect(within(sheet).getByRole('radio', radio('write'))).toBeChecked());
  await waitFor(() => expect(row).toHaveTextContent(words('people.appAccess.write'), { exact: false }));
});

it('keeps what it had when saving fails, and says why', async () => {
  list.mockResolvedValue([CLAUDE]);
  access.mockResolvedValue({ c1: 'read' });
  setAccess.mockRejectedValue(new Error('You’re offline.'));
  await open();
  await fireEvent.press(await screen.findByTestId('connected-app'));
  const sheet = screen.getByTestId('app-sheet');
  await fireEvent.press(within(sheet).getByRole('radio', radio('write')));
  expect(await within(sheet).findByText('You’re offline.')).toBeOnTheScreen();
  expect(within(sheet).getByRole('radio', radio('read'))).toBeChecked();
});

it('says how an app gets here when none is connected', async () => {
  list.mockResolvedValue([]);
  await open();
  expect(await screen.findByText(words('people.connectedApps.none'))).toBeOnTheScreen();
});
