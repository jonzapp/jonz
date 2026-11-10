import { moveTitle, type ChatMove, wordsFor } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { cancelAway, setAway } from '@/api/away';
import { raiseFlag } from '@/api/flags';
import { testQueryClient } from '@/testing/query';

import { MovesCard } from './moves-card';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ setAway: jest.fn(async () => 0), cancelAway: jest.fn(async () => undefined) }));
jest.mock('@/api/auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/flags', () => ({ raiseFlag: jest.fn(async () => 'a1') }));

const AWAY_ID = '55555555-5555-4555-8555-555555555555';
const items: ChatMove[] = [
  { kind: 'away', from: '2026-11-20', to: '2026-11-23', note: 'Lisbon' },
  { kind: 'cancel_away', awayId: AWAY_ID, from: '2026-12-01', to: '2026-12-03' },
];

function House({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

it('offers each move ticked, does only the ticked ones, and says so', async () => {
  await render(<MovesCard houseId="h1" me="u1" items={items} />, { wrapper: House });
  expect(screen.getByTestId('move-away')).toHaveTextContent(moveTitle(items[0], words), { exact: false });
  expect(screen.getByTestId('move-cancel_away')).toHaveTextContent(moveTitle(items[1], words), { exact: false });
  expect(setAway).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`^${moveTitle(items[1], words)}`) }));
  await fireEvent.press(screen.getByRole('button', { name: words('ask.moves.apply', { n: 1 }) }));
  expect(setAway).toHaveBeenCalledWith({ from: '2026-11-20', to: '2026-11-23', note: 'Lisbon' });
  expect(cancelAway).not.toHaveBeenCalled();
  expect(await screen.findByText(words('ask.moves.done', { n: 1 }))).toBeTruthy();
});

it('says what was refused, and what got done before it', async () => {
  (cancelAway as jest.Mock).mockRejectedValueOnce(new Error('That time away has already ended.'));
  await render(<MovesCard houseId="h1" me="u1" items={items} />, { wrapper: House });
  await fireEvent.press(screen.getByRole('button', { name: words('ask.moves.apply', { n: 2 }) }));
  expect(await screen.findByText(words('ask.moves.done', { n: 1 }))).toBeTruthy();
  expect(screen.getByText('That time away has already ended.')).toBeTruthy();
});

it('can’t do nothing', async () => {
  await render(<MovesCard houseId="h1" me="u1" items={items.slice(0, 1)} />, { wrapper: House });
  await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`^${moveTitle(items[0], words)}`) }));
  expect(screen.getByRole('button', { name: words('ask.moves.apply', { n: 0 }) })).toBeDisabled();
});

it('does a house write through the app’s own call, as the person', async () => {
  const JOHN = '66666666-6666-4666-8666-666666666666';
  const operation: ChatMove = { kind: 'operation', operation: 'raise_flag', input: { johnId: JOHN }, title: 'Flag the bins', meta: 'Say an on-call John needs doing · Bins' };
  await render(<MovesCard houseId="h1" me="u1" items={[operation]} />, { wrapper: House });
  expect(screen.getByTestId('move-raise_flag')).toHaveTextContent('Flag the bins', { exact: false });
  expect(raiseFlag).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: words('ask.moves.apply', { n: 1 }) }));
  expect(await screen.findByText(words('ask.moves.done', { n: 1 }))).toBeTruthy();
  expect(raiseFlag).toHaveBeenCalledWith(JOHN);
});
