import { NEW_JOHN, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { saveMyPrefs } from '@/api/my-prefs';
import { loadJohnList } from '@/api/settings';
import AwayScreen from '@/app/(house)/house/away';
import PrefsScreen from '@/app/(house)/house/prefs';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

// Your days and best time are on Days and time away, beside the house's time away.
jest.mock('@/api/away', () => ({ loadAway: jest.fn(), setAway: jest.fn(), cancelAway: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/my-prefs', () => ({ saveMyPrefs: jest.fn() }));
jest.mock('@/api/settings', () => ({ loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const PRIYA = { days: [3, 4, 6] as (3 | 4 | 6)[], bestTime: 'morning' as const, rather: { mop: 1 as const } };

async function open(path = '/house/away') {
  await renderPages({ 'house/away': AwayScreen, 'house/prefs': PrefsScreen }, path);
  await untilRead(words);
}

beforeEach(() => {
  jest.clearAllMocks();
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({ members: base.members.map((m) => (m.userId === 'priya' ? { ...m, prefs: PRIYA } : m)) }),
  );
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-21', periods: [] });
  (saveMyPrefs as jest.Mock).mockResolvedValue(undefined);
  (loadJohnList as jest.Mock).mockResolvedValue({
    johns: [
      { ...NEW_JOHN, id: 'mop', name: 'Mopping' },
      { ...NEW_JOHN, id: 'bins', name: 'Garbage' },
    ],
    groups: [],
  });
});

it('is on Days and time away, where an old link to Preferences lands', async () => {
  await open('/house/prefs');
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: words('common.title.away') })).toBeOnTheScreen();
  expect(screen.getByTestId('prefs-time')).toBeOnTheScreen();
  // The house's time away is on the same page.
  expect(screen.getByTestId('away-panel')).toBeOnTheScreen();
});

it('shows the days that suit you, your best time and your Johns as saved', async () => {
  await open();
  expect(screen.getByRole('checkbox', { name: 'Wednesday' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Monday' })).not.toBeChecked();
  expect(within(screen.getByTestId('prefs-time')).getByRole('radio', { name: words('week.steady.time.morning') })).toBeChecked();
  const johns = screen.getAllByTestId('prefs-john');
  expect(johns[0]).toHaveTextContent(/Mopping.*Rather do/);
  expect(johns[1]).toHaveTextContent(/Garbage.*No preference/);
  expect(screen.getByText(words('week.steady.prefsNote'))).toBeOnTheScreen();
});

it('saves each change as it is made', async () => {
  await open();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Monday' }));
  expect(saveMyPrefs).toHaveBeenLastCalledWith('h1', { ...PRIYA, days: [1, 3, 4, 6] });
  expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();

  await fireEvent.press(screen.getByRole('radio', { name: words('week.steady.anyTime') }));
  expect(saveMyPrefs).toHaveBeenLastCalledWith('h1', { ...PRIYA, days: [1, 3, 4, 6], bestTime: null });

  await fireEvent.press(within(screen.getAllByTestId('prefs-john')[1]).getByRole('button'));
  await fireEvent.press(screen.getByRole('radio', { name: words('week.steady.rather.minus1') }));
  expect(saveMyPrefs).toHaveBeenLastCalledWith('h1', { days: [1, 3, 4, 6], bestTime: null, rather: { mop: 1, bins: -1 } });
});

it("says so when a save didn't go through", async () => {
  (saveMyPrefs as jest.Mock).mockRejectedValue(new Error('Those didn’t save.'));
  await open();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Friday' }));
  await waitFor(() => expect(screen.getByText('Those didn’t save.')).toBeOnTheScreen());
});
