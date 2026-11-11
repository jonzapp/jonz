import { dayLabel, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { connectedApps, disconnectApp } from '@/api/connected-apps';
import { renderPages } from '@/testing/pages';

import { ConnectedAppsSection } from './connected-apps-section';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/connected-apps', () => ({ connectedApps: jest.fn(), disconnectApp: jest.fn() }));

const list = connectedApps as jest.Mock;
const disconnect = disconnectApp as jest.Mock;
const CLAUDE = { client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' }, scopes: ['email'], granted_at: '2027-01-04T09:30:00Z' };

const open = () => renderPages({ index: () => <ConnectedAppsSection zone="Europe/London" /> }, '/');

beforeEach(() => jest.clearAllMocks());

it('lists the apps you let in, since when, and disconnects one', async () => {
  list.mockResolvedValueOnce([CLAUDE]).mockResolvedValue([]);
  disconnect.mockResolvedValue(undefined);
  await open();
  const row = await screen.findByTestId('connected-app');
  expect(row).toHaveTextContent(/^Claude/);
  expect(row).toHaveTextContent(words('people.connectedApps.since', { date: dayLabel(new Date(CLAUDE.granted_at), 'Europe/London', words) }), { exact: false });
  await fireEvent.press(within(row).getByRole('button', { name: words('people.connectedApps.disconnect') }));
  expect(screen.getByText(words('people.connectedApps.confirm', { app: 'Claude' }))).toBeOnTheScreen();
  await fireEvent.press(within(screen.getByTestId('disconnect-sheet')).getByRole('button', { name: words('people.connectedApps.disconnect') }));
  expect(disconnect).toHaveBeenCalledWith('c1');
  await waitFor(() => expect(screen.getByText(words('people.connectedApps.none'))).toBeOnTheScreen());
});

it('says how an app gets here when none is connected', async () => {
  list.mockResolvedValue([]);
  await open();
  expect(await screen.findByText(words('people.connectedApps.none'))).toBeOnTheScreen();
});
