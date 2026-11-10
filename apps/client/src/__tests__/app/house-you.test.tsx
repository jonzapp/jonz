import { wordsFor } from '@app/core';
import { screen, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import YouScreen from '@/app/(house)/house/you';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/profile', () => ({ renameMe: jest.fn() }));
jest.mock('@/api/settings', () => ({ removeMember: jest.fn(), handOver: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(async () => null) }));
jest.mock('@/api/email-auth', () => ({ emailSignIn: jest.fn(async () => null), setPassword: jest.fn() }));
jest.mock('@/api/push', () => ({
  reminderSupport: jest.fn(() => 'none'),
  remindersOn: jest.fn(async () => false),
  turnRemindersOn: jest.fn(),
  turnRemindersOff: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' }, refresh: jest.fn() }),
}));

async function open() {
  await renderPages({ 'house/you': YouScreen }, '/house/you');
  await untilRead(words);
}

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
});

it('sits under a title bar with the way back to House, your name at the top', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('common.title.you') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.house') }) })).toBeOnTheScreen();
  const me = snapshot().members.find((m) => m.userId === 'priya')!;
  // Your picture (here your initials), then your name over the house and your part in it.
  expect(screen.getByTestId('you-head')).toHaveTextContent(`PR${me.name}${words('house.leave.youIn', { house: 'Flat 3', role: me.role })}`);
});

it('holds your settings, help and leaving, in one column on a phone', async () => {
  await open();
  expect(screen.queryByTestId('you-pair')).toBeNull();
  expect(within(screen.getByTestId('you-section')).getByText(words('house.month.you'))).toBeOnTheScreen();
  expect(screen.getByTestId('sign-out')).toBeOnTheScreen();
  expect(within(screen.getByTestId('you-rest')).getByText(words('people.delete.leave'))).toBeOnTheScreen();
  expect(screen.getByTestId('to-delete-account')).toBeOnTheScreen();
  expect(screen.getByTestId('leave')).toBeOnTheScreen();
  // Each part once: your settings aren't in the second half, nor leaving in the first.
  expect(within(screen.getByTestId('you-section')).queryByTestId('to-delete-account')).toBeNull();
  expect(within(screen.getByTestId('you-rest')).queryByTestId('sign-out')).toBeNull();
});

it('puts your settings beside help and leaving on a laptop', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
  await open();
  expect(within(screen.getByTestId('you-pair-start')).getByTestId('sign-out')).toBeOnTheScreen();
  const end = within(screen.getByTestId('you-pair-end'));
  expect(end.getByTestId('to-delete-account')).toBeOnTheScreen();
  expect(end.getByTestId('leave')).toBeOnTheScreen();
});
