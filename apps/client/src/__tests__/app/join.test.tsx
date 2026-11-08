import { BIN_NIGHT, FOCUS_SHELL_COPY, FRONT_DOOR_COPY, JOIN_COPY, SIGN_IN_COPY, signInReason } from '@app/core';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { signInWithGoogle } from '@/api/auth';
import { houseByCode, joinHouse } from '@/api/house';
import Join from '@/app/join/[joinCode]';
import { useMembership } from '@/hooks/use-membership';

jest.mock('@/api/house', () => ({ houseByCode: jest.fn(), joinHouse: jest.fn() }));
jest.mock('@/api/email-auth', () => ({}));
jest.mock('@/api/auth', () => ({
  appleSignInAvailable: jest.fn(async () => false),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithMicrosoft: jest.fn(),
}));
jest.mock('@/hooks/use-membership', () => ({ useMembership: jest.fn() }));

const byCode = houseByCode as jest.Mock;
const join = joinHouse as jest.Mock;
const membership = useMembership as jest.Mock;
const refresh = jest.fn();
const FLAT = { id: 'h1', name: 'Flat 3', members: 3, kind: 'housemates', currency: 'GBP', stakeMinor: 2000, lateMinor: 100, missedMinor: 300 };
const ME = { user: { id: 'u1' } };

function as(session: object | null, house: { id: string; name: string } | null = null) {
  membership.mockReturnValue({ session, house, refresh });
}

async function open(code = 'AB3DEF7H', query = '') {
  await renderRouter(
    { 'join/[joinCode]': Join, today: () => <Text>Today</Text>, welcome: () => <Text>Welcome</Text> },
    { initialUrl: `/join/${code}${query}` },
  );
}

beforeEach(() => jest.clearAllMocks());

it('signs you in right there when signed out, without naming the house', async () => {
  as(null);
  await open();
  expect(screen.getByRole('header', { name: SIGN_IN_COPY.heading })).toBeOnTheScreen();
  expect(screen.getByText(signInReason('/join/AB3DEF7H'))).toBeOnTheScreen();
  expect(byCode).not.toHaveBeenCalled();
});

it('brings the web back to the same link from Google', async () => {
  as(null);
  await open();
  await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
  expect(signInWithGoogle).toHaveBeenCalledWith('/join/AB3DEF7H');
});

it('says so when Google turns the web back to the link', async () => {
  as(null);
  await open('AB3DEF7H', '?error=access_denied');
  expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.returnFailed);
  expect(screen.getByText(signInReason('/join/AB3DEF7H'))).toBeOnTheScreen();
});

it('names the house and how many live there, and joins it', async () => {
  as(ME);
  byCode.mockResolvedValue(FLAT);
  join.mockResolvedValue('h1');
  await open();
  expect(await screen.findByRole('header', { name: 'Flat 3' })).toBeOnTheScreen();
  expect(screen.getByText(JOIN_COPY.invited)).toBeOnTheScreen();
  expect(screen.getByText(JOIN_COPY.livesHere(3))).toBeOnTheScreen();
  // What it plays for, before anyone joins.
  expect(screen.getByTestId('join-stake')).toHaveTextContent(JOIN_COPY.stake('£20', '£1', '£3'));
  expect(screen.getByTestId('hazard-tape', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(byCode).toHaveBeenCalledWith('AB3DEF7H');

  const button = screen.getByRole('button', { name: FRONT_DOOR_COPY.join });
  expect(button).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
  await fireEvent.press(button);
  expect(join).toHaveBeenCalledWith('AB3DEF7H');
  expect(refresh).toHaveBeenCalled();
  expect(screen).toHavePathname('/today');
});

it("says when a house doesn't play for money", async () => {
  as(ME);
  byCode.mockResolvedValue({ ...FLAT, stakeMinor: 0, lateMinor: 0, missedMinor: 0 });
  await open();
  expect(await screen.findByTestId('join-stake')).toHaveTextContent(JOIN_COPY.noStake);
});

it('says what went wrong joining, and stays', async () => {
  as(ME);
  byCode.mockResolvedValue(FLAT);
  join.mockRejectedValue(new Error("You’re already in a house. Leave it first to join another."));
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: FRONT_DOOR_COPY.join }));
  expect(screen.getByRole('alert')).toHaveTextContent("You’re already in a house. Leave it first to join another.");
  expect(screen).toHavePathname('/join/AB3DEF7H');
});

it("says when the house can't be read, rather than blaming the link, and reads it again", async () => {
  as(ME);
  byCode.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(FLAT);
  await open();
  expect(await screen.findByRole('alert')).toHaveTextContent(FOCUS_SHELL_COPY.unreadable);
  expect(screen.queryByRole('header', { name: JOIN_COPY.badLink })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.retry }));
  expect(await screen.findByRole('header', { name: 'Flat 3' })).toBeOnTheScreen();
  expect(byCode).toHaveBeenCalledTimes(2);
});

it("says a link that matches no house doesn't work", async () => {
  as(ME);
  byCode.mockResolvedValue(null);
  await open('ZZZZZZZZ');
  expect(await screen.findByRole('header', { name: JOIN_COPY.badLink })).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: JOIN_COPY.back })).toHaveProp('href', '/welcome');
});

it("doesn't offer to join a house you're already in", async () => {
  as(ME, { id: 'h1', name: 'Flat 3' });
  byCode.mockResolvedValue(FLAT);
  await open();
  expect(await screen.findByRole('header', { name: JOIN_COPY.alreadyIn('Flat 3') })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: FRONT_DOOR_COPY.join })).not.toBeOnTheScreen();
  expect(screen.getByRole('link', { name: JOIN_COPY.goToJohns })).toHaveProp('href', '/today');
});

it("doesn't offer a second house to someone in one", async () => {
  as(ME, { id: 'h2', name: 'Number 9' });
  byCode.mockResolvedValue(FLAT);
  await open();
  expect(await screen.findByRole('header', { name: JOIN_COPY.otherHouse })).toBeOnTheScreen();
  expect(screen.getByText(JOIN_COPY.otherHouseBody)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: FRONT_DOOR_COPY.join })).not.toBeOnTheScreen();
  expect(screen.getByRole('link', { name: JOIN_COPY.yourHouse })).toHaveProp('href', '/today');
});
