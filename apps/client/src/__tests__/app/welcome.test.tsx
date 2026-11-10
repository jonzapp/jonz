import { BIN_NIGHT, wordsFor } from '@app/core';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { signOut } from '@/api/auth';
import { leavePass, type MovingOn } from '@/api/moving';
import Welcome from '@/app/welcome';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/moving', () => ({ leavePass: jest.fn() }));
let mockMoving: MovingOn | null = null;
const mockRefetch = jest.fn();
jest.mock('@/hooks/use-moving-on', () => ({ useMovingOn: () => ({ data: mockMoving, refetch: mockRefetch }) }));

async function open() {
  await renderRouter(
    { welcome: Welcome, 'house/new': () => <Text>New house</Text>, 'join/[joinCode]': () => <Text>Join</Text> },
    { initialUrl: '/welcome' },
  );
}

async function paste(text: string) {
  await fireEvent.changeText(screen.getByLabelText(words('door.welcome.paste')), text);
  await fireEvent.press(screen.getByRole('button', { name: words('door.welcome.open') }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMoving = null;
});

it('asks for the invite in one field, with one amber button', async () => {
  await open();
  expect(screen.getByRole('header', { name: words('door.noHouse.heading') })).toBeOnTheScreen();
  expect(screen.getByText(words('door.welcome.pasteHint'))).toBeOnTheScreen();
  const button = screen.getByRole('button', { name: words('door.welcome.open') });
  expect(button).toBeDisabled();
  expect(button).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
});

it('offers to start a house instead', async () => {
  await open();
  expect(screen.getByRole('link', { name: words('door.welcome.startInstead') })).toHaveProp('href', '/house/new');
});

it('opens the join screen for a code, however it was typed', async () => {
  await open();
  await paste('ab3d-ef7h');
  expect(screen).toHavePathname('/join/AB3DEF7H');
});

it('opens the join screen for a whole link pasted in', async () => {
  await open();
  await paste('https://jonz.app/join/AB3DEF7H');
  expect(screen).toHavePathname('/join/AB3DEF7H');
});

it("says so when it can't be an invite, until it's changed", async () => {
  await open();
  await paste('nope');
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.welcome.badInvite'));
  expect(screen).toHavePathname('/welcome');
  await fireEvent.changeText(screen.getByLabelText(words('door.welcome.paste')), 'nopeX');
  expect(screen.queryByText(words('door.welcome.badInvite'))).not.toBeOnTheScreen();
});

it('lets whoever signed in with the wrong account out', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: words('door.signIn.signOut') }));
  expect(signOut).toHaveBeenCalled();
});

describe('just after leaving a house', () => {
  beforeEach(() => {
    mockMoving = { fromHouse: 'h1', houseName: 'Flat 3', johns: 6, pass: null, houseKeepsUntil: null };
  });

  it('is the Moving on screen: starting the new place is the one amber button', async () => {
    await open();
    expect(screen.getByRole('header', { name: words('house.moving.heading') })).toBeOnTheScreen();
    expect(screen.getByText(words('house.moving.body', { house: 'Flat 3', johns: 6 }))).toBeOnTheScreen();
    const start = screen.getByRole('link', { name: words('house.moving.start') });
    expect(start).toHaveProp('href', '/house/new?from=h1');
    expect(start).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
    expect(screen.getByRole('button', { name: words('door.welcome.open') })).not.toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
  });

  it('still takes an invite, under I have an invite', async () => {
    await open();
    expect(screen.getByText(words('house.moving.invite'))).toBeOnTheScreen();
    await paste('AB3DEF7H');
    expect(screen).toHavePathname('/join/AB3DEF7H');
  });

  it('says only the choice when the old list was empty', async () => {
    mockMoving = { fromHouse: 'h1', houseName: 'Flat 3', johns: 0, pass: null, houseKeepsUntil: null };
    await open();
    expect(screen.getByText(words('house.moving.body', { house: 'Flat 3', johns: 0 }))).toBeOnTheScreen();
  });

  it('says the House Pass comes with you, and leaves it for the old house on a tap', async () => {
    mockMoving = { fromHouse: 'h1', houseName: 'Flat 3', johns: 6, pass: 'waiting', houseKeepsUntil: '2026-11-29' };
    (leavePass as jest.Mock).mockResolvedValue(undefined);
    await open();
    expect(screen.getByTestId('pass-comes')).toHaveTextContent(words('house.moving.passComesUntil', { house: 'Flat 3', until: 'Sun 29 Nov' }));
    await fireEvent.press(screen.getByRole('button', { name: words('house.moving.leavePass', { house: 'Flat 3' }) }));
    expect(leavePass).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('says what happens to a Pass left with the old house', async () => {
    mockMoving = { fromHouse: 'h1', houseName: 'Flat 3', johns: 6, pass: 'left', houseKeepsUntil: null };
    await open();
    expect(screen.getByTestId('pass-left')).toHaveTextContent(words('house.moving.passLeft', { house: 'Flat 3' }));
    expect(screen.queryByTestId('leave-pass')).toBeNull();
  });
});
