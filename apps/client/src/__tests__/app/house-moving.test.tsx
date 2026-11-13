import { addDaysTo, dateRange, dayName, wordsFor } from '@app/core';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { setMovingOut } from '@/api/moving';
import MovingScreen from '@/app/(house)/you/moving';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/moving', () => ({ setMovingOut: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

// A pretend clock, never the real one: Wednesday 21 October 2026, noon in London.
const today = '2026-10-21';
const tomorrow = addDaysTo(today, 1);
const nextDay = addDaysTo(today, 2);

function movingOn(on: string | null) {
  const base = snapshot();
  return snapshot({ members: base.members.map((m) => (m.userId === 'priya' ? { ...m, movingOutOn: on } : m)) });
}

async function open() {
  await renderPages({ 'you/moving': MovingScreen }, '/you/moving');
  await untilRead(words);
}

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-10-21T11:00:00Z'), advanceTimers: true });
});

afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(movingOn(null));
  (catchUp as jest.Mock).mockResolvedValue(false);
  (setMovingOut as jest.Mock).mockResolvedValue(undefined);
});

it('sits under a title bar with the way back to You', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('common.title.moving') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.you') }) })).toBeOnTheScreen();
  expect(screen.getByText(words('house.moving.intro'))).toBeOnTheScreen();
  expect(screen.getByText(words('house.moving.afterward'))).toBeOnTheScreen();
});

it('saves the one day you tap, whichever you tapped last', async () => {
  await open();
  expect(screen.getByTestId('moving-save')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: dayName(tomorrow, words) }));
  await fireEvent.press(screen.getByRole('button', { name: dayName(nextDay, words) }));
  const save = screen.getByRole('button', { name: words('house.moving.save', { day: dateRange(nextDay, nextDay, words) }) });
  await fireEvent.press(save);
  expect(setMovingOut).toHaveBeenCalledWith(nextDay);
});

it('says the date once set, and lets you stay after all', async () => {
  (loadHouse as jest.Mock).mockResolvedValue(movingOn(tomorrow));
  await open();
  expect(screen.getByTestId('moving-saved')).toHaveTextContent(words('house.moving.saved', { day: dateRange(tomorrow, tomorrow, words) }));
  // The same day again is nothing to save.
  expect(screen.getByTestId('moving-save')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: words('house.moving.staying') }));
  expect(setMovingOut).toHaveBeenCalledWith(null);
});

it("says so when the database refuses", async () => {
  (setMovingOut as jest.Mock).mockRejectedValue(new Error('Your moving-out day can be today at the earliest.'));
  await open();
  await fireEvent.press(screen.getByRole('button', { name: dayName(tomorrow, words) }));
  await fireEvent.press(screen.getByTestId('moving-save'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your moving-out day can be today at the earliest.');
});
