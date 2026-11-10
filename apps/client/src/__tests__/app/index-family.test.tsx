import { wordsFor } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';

import FrontDoor from '@/app/index';
import { rememberKind } from '@/door-kind';

const words = wordsFor('en', 'housemates');

// The front door once families are open (FAMILY_OPEN): its Housemates / Family switch.
jest.mock('@app/core', () => ({ ...jest.requireActual('@app/core'), FAMILY_OPEN: true }));
jest.mock('@/door-kind', () => ({ rememberedKind: jest.fn(() => null), rememberKind: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('switches the words and the start between housemates and a family, and remembers it', async () => {
  await render(<FrontDoor />);
  expect(screen.getByRole('radio', { name: words('house.family.kinds.housemates') })).toBeChecked();
  expect(screen.getByRole('header', { name: words('door.front.headline') })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('radio', { name: words('house.family.kinds.family') }));
  expect(screen.getByRole('header', { name: words('house.family.door.headline') })).toBeOnTheScreen();
  for (const key of ['list', 'share', 'stake'] as const) expect(screen.getByText(words(`house.family.door.points.${key}`))).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: words('house.family.door.start') })).toHaveProp('href', '/signin?next=%2Fhouse%2Fnew%3Fkind%3Dfamily');
  expect(screen.getByRole('link', { name: words('door.welcome.invite') })).toHaveProp('href', '/signin?next=%2Fwelcome');
  expect(rememberKind).toHaveBeenCalledWith('family');
});
