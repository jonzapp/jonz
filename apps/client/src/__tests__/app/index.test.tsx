import { BIN_NIGHT, FRONT_DOOR, FRONT_DOOR_COPY, SIGN_IN } from '@app/core';
import { render, screen } from '@testing-library/react-native';

import FrontDoor from '@/app/index';
import { TAP } from '@/theme';

it('opens on the wordmark, the taped sign and three plain sentences', async () => {
  await render(<FrontDoor />);
  expect(screen.getByRole('image', { name: 'Jonz' })).toBeOnTheScreen();
  expect(screen.getByTestId('hazard-tape', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: FRONT_DOOR.headline })).toBeOnTheScreen();
  for (const point of FRONT_DOOR_COPY.points) expect(screen.getByText(point.body)).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Privacy' })).toHaveProp('href', '/privacy');
  expect(screen.getByRole('link', { name: 'Terms' })).toHaveProp('href', '/terms');
});

it('carries the way in through sign-in, so it survives signing in', async () => {
  await render(<FrontDoor />);
  expect(screen.getByRole('link', { name: FRONT_DOOR_COPY.start })).toHaveProp('href', '/signin?next=%2Fhouse%2Fnew');
  expect(screen.getByRole('link', { name: FRONT_DOOR_COPY.invite })).toHaveProp('href', '/signin?next=%2Fwelcome');
  // Someone with a house already just signs in.
  expect(screen.getByRole('link', { name: FRONT_DOOR.signIn })).toHaveProp('href', SIGN_IN);
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
  for (const label of [FRONT_DOOR_COPY.start, FRONT_DOOR_COPY.invite, FRONT_DOOR.signIn]) {
    expect(screen.getByRole('link', { name: label })).toHaveStyle({ minHeight: TAP });
  }
});
