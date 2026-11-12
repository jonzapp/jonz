import { dayLabel, wordsFor } from '@app/core';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { mcpAddress } from '@/api/base';

import { appAccess, connectedApps, disconnectApp, setAppAccess } from '@/api/connected-apps';
import { renderPages } from '@/testing/pages';

import { CLAUDE_CONNECTORS } from './connect-claude';
import { ConnectedAppsSection } from './connected-apps-section';

const words = wordsFor('en', 'housemates');

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
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
  await waitFor(() => expect(screen.queryByTestId('connected-app')).toBeNull());
  expect(screen.getByTestId('connect-claude')).toBeOnTheScreen();
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

it('shows how to connect Claude, with the address to copy and the way into Claude', async () => {
  list.mockResolvedValue([]);
  await open();
  const row = await screen.findByTestId('connect-claude');
  expect(row).toHaveTextContent(words('people.connectClaude.title'), { exact: false });
  expect(screen.queryByTestId('connected-app')).toBeNull();
  await fireEvent.press(row);
  const sheet = screen.getByTestId('connect-claude-sheet');
  expect(within(sheet).getByText(words('people.connectClaude.step2'))).toBeOnTheScreen();
  expect(within(sheet).getByTestId('mcp-address')).toHaveTextContent(mcpAddress());
  await fireEvent.press(within(sheet).getByRole('button', { name: words('people.connectClaude.copySpoken') }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(mcpAddress());
  await fireEvent.press(within(sheet).getByRole('button', { name: words('people.connectClaude.open') }));
  expect(Linking.openURL).toHaveBeenCalledWith(CLAUDE_CONNECTORS);
});

it('gives jonz.app’s own API address when the app has none set', async () => {
  const was = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  try {
    expect(mcpAddress()).toBe('https://api.jonz.app/mcp');
    process.env.EXPO_PUBLIC_API_URL = 'https://api.staging.jonz.app/';
    expect(mcpAddress()).toBe('https://api.staging.jonz.app/mcp');
  } finally {
    process.env.EXPO_PUBLIC_API_URL = was;
  }
});
