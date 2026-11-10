import { BIN_NIGHT, DOOR_POINTS, SIGN_IN, wordsFor } from '@app/core';
import { render, screen } from '@testing-library/react-native';

import FrontDoor from '@/app/index';
import { TAP } from '@/theme';

const words = wordsFor('en', 'housemates');

it('opens on the wordmark, the taped sign and three plain sentences', async () => {
  await render(<FrontDoor />);
  expect(screen.getByRole('image', { name: 'Jonz' })).toBeOnTheScreen();
  expect(screen.getByTestId('hazard-tape', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: words('door.front.headline') })).toBeOnTheScreen();
  for (const key of DOOR_POINTS) expect(screen.getByText(words(`door.welcome.points.${key}`))).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Privacy' })).toHaveProp('href', '/privacy');
  expect(screen.getByRole('link', { name: 'Terms' })).toHaveProp('href', '/terms');
});

it('carries the way in through sign-in, so it survives signing in', async () => {
  await render(<FrontDoor />);
  expect(screen.getByRole('link', { name: words('door.welcome.start') })).toHaveProp('href', '/signin?next=%2Fhouse%2Fnew');
  expect(screen.getByRole('link', { name: words('door.welcome.invite') })).toHaveProp('href', '/signin?next=%2Fwelcome');
  // Someone with a house already just signs in.
  expect(screen.getByRole('link', { name: words('door.front.signIn') })).toHaveProp('href', SIGN_IN);
});

it('has one amber button: starting a house', async () => {
  await render(<FrontDoor />);
  expect(screen.getByTestId('start')).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
  expect(screen.getByTestId('invite')).toHaveStyle({ backgroundColor: 'transparent' });
});

it('gives every link a whole thumb to land on', async () => {
  await render(<FrontDoor />);
  expect(screen.getByTestId('privacy')).toHaveStyle({ minHeight: TAP });
  expect(screen.getByTestId('terms')).toHaveStyle({ minHeight: TAP });
  // The small print's size, like the name beside them (Meta, 14).
  for (const label of ['Privacy', 'Terms']) expect(screen.getByText(label)).toHaveStyle({ fontSize: 14 });
  for (const label of [words('door.welcome.start'), words('door.welcome.invite'), words('door.front.signIn')]) {
    expect(screen.getByRole('link', { name: label })).toHaveStyle({ minHeight: TAP });
  }
});
