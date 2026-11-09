import { CONNECTED_APPS_COPY, dayLabel } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { connectedApps, disconnectApp } from '@/api/connected-apps';
import { renderPages } from '@/testing/pages';

import { ConnectedAppsSection } from './connected-apps-section';

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
  expect(row).toHaveTextContent(CONNECTED_APPS_COPY.since(dayLabel(new Date(CLAUDE.granted_at), 'Europe/London')), { exact: false });
  await fireEvent.press(within(row).getByRole('button', { name: CONNECTED_APPS_COPY.disconnect }));
  expect(screen.getByText(CONNECTED_APPS_COPY.confirm('Claude'))).toBeOnTheScreen();
  await fireEvent.press(within(screen.getByTestId('disconnect-sheet')).getByRole('button', { name: CONNECTED_APPS_COPY.disconnect }));
  expect(disconnect).toHaveBeenCalledWith('c1');
  await waitFor(() => expect(screen.getByText(CONNECTED_APPS_COPY.none)).toBeOnTheScreen());
});

it('says how an app gets here when none is connected', async () => {
  list.mockResolvedValue([]);
  await open();
  expect(await screen.findByText(CONNECTED_APPS_COPY.none)).toBeOnTheScreen();
});
