import { BIN_NIGHT, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { loadHouse } from '@/api/board';
import { handOver, removeMember } from '@/api/settings';
import { loadStake } from '@/api/stake';
import { useHouse } from '@/hooks/use-house';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

import { LeaveSection } from './leave-section';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({ removeMember: jest.fn(), handOver: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const mockMembership = { refresh: jest.fn() };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ refresh: mockMembership.refresh }),
}));

/** Leaving on its own, once the house is read, with Privacy standing in as its name. */
async function open() {
  function Host() {
    const { view } = useHouse('h1', 'priya');
    return view ? <LeaveSection houseId="h1" userId="priya" view={view} /> : null;
  }
  await renderPages({ 'house/index': Host, privacy: () => <Text>Privacy page</Text>, terms: () => <Text>Terms page</Text> }, '/house');
  await screen.findByTestId('leave-section');
}

async function ask() {
  await fireEvent.press(within(screen.getByTestId('leave')).getByRole('button'));
  return within(screen.getByTestId('leave-sheet'));
}

/** The Stake as House reads it, with what matters here: your share so far, and the settle-ups. */
const stake = (received: number, transfers: { from: string; to: string; amount: number }[]) => ({
  month: '2026-10',
  projection: [
    { userId: 'priya', forfeitedRaw: 0, forfeited: 0, received, net: received },
    { userId: 'sam', forfeitedRaw: received, forfeited: received, received: 0, net: -received },
  ],
  transfers,
});

/** Sam is an admin too, so Priya isn't the only one and can go. */
const twoAdmins = () => snapshot({ members: snapshot().members.map((m) => ({ ...m, role: 'admin' as const })) });

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(twoAdmins());
  (loadStake as jest.Mock).mockResolvedValue(stake(333, [{ from: 'sam', to: 'priya', amount: 450 }]));
  (removeMember as jest.Mock).mockResolvedValue(undefined);
  mockMembership.refresh.mockResolvedValue(undefined);
});

it('names the house to leave, in hazard words', async () => {
  await open();
  const row = within(screen.getByTestId('leave'));
  expect(row.getByRole('button', { name: words('house.lower.leave', { house: 'Flat 3' }) })).toBeOnTheScreen();
  expect(row.getByText(words('house.lower.leave', { house: 'Flat 3' }))).toHaveStyle({ color: BIN_NIGHT.light.hazard });
});

it('asks first, saying what leaving costs in money', async () => {
  await open();
  await waitFor(() => expect(loadStake).toHaveBeenCalled());
  const sheet = await ask();
  expect(sheet.getByRole('header', { name: words('house.lower.leaveAsk', { house: 'Flat 3' }) })).toBeOnTheScreen();
  expect(
    await sheet.findByText('You’ll lose the £3.33 coming to you from October’s forfeits, and Sam still owes you £4.50.'),
  ).toBeOnTheScreen();
  expect(removeMember).not.toHaveBeenCalled();
});

it("says it costs nothing when you're square, and that the last one out leaves the house empty", async () => {
  (loadHouse as jest.Mock).mockResolvedValue(snapshot({ members: snapshot().members.slice(0, 1) }));
  (loadStake as jest.Mock).mockResolvedValue(stake(0, []));
  await open();
  await waitFor(() => expect(loadStake).toHaveBeenCalled());
  const sheet = await ask();
  expect(await sheet.findByText(`${words('house.lower.costsNothing')} ${words('house.lower.lastOne')}`)).toBeOnTheScreen();
  expect(sheet.getByTestId('confirm')).toBeEnabled();
});

it("lets the only admin leave by picking who looks after the house", async () => {
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  await open();
  await waitFor(() => expect(loadStake).toHaveBeenCalled());
  const sheet = await ask();
  expect(sheet.getByText(new RegExp(words('house.leave.lastAdmin')))).toBeOnTheScreen();
  // Nothing to press until someone is picked.
  expect(sheet.queryByTestId('confirm')).toBeNull();
  const [first] = sheet.getAllByTestId('heir');
  await fireEvent.press(first);
  const name = first.props.accessibilityLabel as string;
  await fireEvent.press(sheet.getByRole('button', { name: words('house.leave.handOver', { name: name.split(' ')[0] }) }));
  await waitFor(() => expect(handOver).toHaveBeenCalledWith('h1', expect.any(String)));
  expect(removeMember).not.toHaveBeenCalled();
});

it('says nothing about money until the Stake is read', async () => {
  let answer: (value: unknown) => void = () => undefined;
  (loadStake as jest.Mock).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  await open();
  const sheet = await ask();
  expect(sheet.getByText(words('house.lower.costReading'))).toBeOnTheScreen();
  expect(sheet.queryByText(words('house.lower.costsNothing'))).toBeNull();
  answer(stake(0, [{ from: 'priya', to: 'sam', amount: 120 }]));
  expect(await sheet.findByText('You still owe Sam £1.20.')).toBeOnTheScreen();
});

it("says when it can't read what leaving costs, and reads the Stake again when asked again", async () => {
  (loadStake as jest.Mock).mockRejectedValue(new Error('offline'));
  await open();
  await waitFor(() => expect(loadStake).toHaveBeenCalled());
  let sheet = await ask();
  expect(await sheet.findByText(words('house.lower.costUnread'))).toBeOnTheScreen();
  expect(sheet.queryByText(words('house.lower.costsNothing'))).toBeNull();
  // Leaving is still yours to do.
  expect(sheet.getByTestId('confirm')).toBeEnabled();
  await fireEvent.press(sheet.getByTestId('cancel'));
  await waitFor(() => expect(screen.queryByTestId('leave-sheet')).toBeNull());
  (loadStake as jest.Mock).mockResolvedValue(stake(333, [{ from: 'sam', to: 'priya', amount: 450 }]));
  sheet = await ask();
  expect(await sheet.findByText(/Sam still owes you £4\.50/)).toBeOnTheScreen();
  expect(sheet.queryByTestId('leave-retry')).toBeNull();
});

it("reads the Stake again from the sheet, when it couldn't", async () => {
  (loadStake as jest.Mock).mockRejectedValue(new Error('offline'));
  await open();
  const sheet = await ask();
  expect(await sheet.findByText(words('house.lower.costUnread'))).toBeOnTheScreen();
  const retry = sheet.getByRole('button', { name: words('common.shell.retry') });
  let answer: (value: unknown) => void = () => undefined;
  (loadStake as jest.Mock).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const asked = (loadStake as jest.Mock).mock.calls.length;
  await fireEvent.press(retry);
  expect(loadStake).toHaveBeenCalledTimes(asked + 1);
  // While it reads, the sheet says so, and there's nothing to press again.
  expect(await sheet.findByText(words('house.lower.costReading'))).toBeOnTheScreen();
  expect(sheet.queryByTestId('leave-retry')).toBeNull();
  answer(stake(0, [{ from: 'priya', to: 'sam', amount: 120 }]));
  expect(await sheet.findByText('You still owe Sam £1.20.')).toBeOnTheScreen();
  expect(sheet.queryByTestId('leave-retry')).toBeNull();
});

it('leaves once you confirm, and lets the guard move you on', async () => {
  await open();
  const sheet = await ask();
  await fireEvent.press(sheet.getByTestId('confirm'));
  expect(removeMember).toHaveBeenCalledWith('h1', 'priya');
  await waitFor(() => expect(mockMembership.refresh).toHaveBeenCalledTimes(1));
});

it("says why you can't leave, where you asked", async () => {
  (removeMember as jest.Mock).mockRejectedValue(new Error('Make someone else an admin before you leave.'));
  await open();
  const sheet = await ask();
  await fireEvent.press(sheet.getByTestId('confirm'));
  expect(await sheet.findByRole('alert')).toHaveTextContent('Make someone else an admin before you leave.');
  expect(mockMembership.refresh).not.toHaveBeenCalled();
});

it('stays when you cancel', async () => {
  await open();
  const sheet = await ask();
  await fireEvent.press(sheet.getByTestId('cancel'));
  await waitFor(() => expect(screen.queryByTestId('leave-sheet')).toBeNull());
  expect(removeMember).not.toHaveBeenCalled();
});

it('says Jonz never moves money, and leads to Privacy', async () => {
  await open();
  expect(screen.getByText(words('house.lower.noMoney'))).toBeOnTheScreen();
  // The links are the same size as the words beside them (Meta, 14).
  for (const label of [words('house.lower.noMoney'), words('house.lower.privacy'), words('house.lower.terms')]) {
    expect(screen.getByText(label)).toHaveStyle({ fontSize: 14 });
  }
  await fireEvent.press(screen.getByRole('link', { name: words('house.lower.privacy') }));
  expect(screen).toHavePathname('/privacy');
  expect(screen.getByText('Privacy page')).toBeOnTheScreen();
});

it('leads to the Terms', async () => {
  await open();
  await fireEvent.press(screen.getByRole('link', { name: words('house.lower.terms') }));
  expect(screen).toHavePathname('/terms');
  expect(screen.getByText('Terms page')).toBeOnTheScreen();
});
