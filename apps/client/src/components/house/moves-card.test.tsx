import { BIN_NIGHT, moveTitle, type ChatMove, wordsFor } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { cancelAway, setAway } from '@/api/away';
import { raiseFlag } from '@/api/flags';
import { resetHouseData } from '@/api/settings';
import { testQueryClient } from '@/testing/query';

import { MovesCard } from './moves-card';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ setAway: jest.fn(async () => 0), cancelAway: jest.fn(async () => undefined) }));
jest.mock('@/api/auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/flags', () => ({ raiseFlag: jest.fn(async () => 'a1') }));
jest.mock('@/api/settings', () => ({ ...jest.requireActual('@/api/settings'), resetHouseData: jest.fn(async () => ({ weeks: 2, people: 3 })) }));

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

const HOUSE_ID = '77777777-7777-4777-8777-777777777777';
const reset: ChatMove = {
  kind: 'operation',
  operation: 'reset_house_data',
  input: { houseId: HOUSE_ID, everything: false },
  title: 'Reset the history of Elm Street',
  meta: 'Back to before the first deal; the John list stays',
};

it('puts a move that can’t be undone in the Danger zone, apart from the rest, with a hazard button while it’s ticked', async () => {
  await render(<MovesCard houseId="h1" me="u1" items={[items[0], reset]} />, { wrapper: House });
  const zone = within(screen.getByTestId('moves-list-danger'));
  expect(zone.getByText(words('house.danger.label'))).toBeVisible();
  expect(zone.getByTestId('move-reset_house_data')).toBeVisible();
  expect(zone.queryByTestId('move-away')).toBeNull();
  expect(within(screen.getByTestId('moves-list')).getByTestId('move-away')).toBeVisible();
  const apply = () => screen.getByTestId('moves-apply');
  expect(apply()).toHaveStyle({ borderColor: BIN_NIGHT.light.hazard });
  await fireEvent.press(screen.getByTestId('move-reset_house_data'));
  expect(apply()).not.toHaveStyle({ borderColor: BIN_NIGHT.light.hazard });
  await fireEvent.press(screen.getByTestId('move-reset_house_data'));
  await fireEvent.press(apply());
  expect(await screen.findByText(words('ask.moves.done', { n: 2 }))).toBeTruthy();
  expect(resetHouseData).toHaveBeenCalledWith(HOUSE_ID, false);
});

it('keeps the card’s own label on the Danger zone when nothing else is on it', async () => {
  await render(<MovesCard houseId="h1" me="u1" items={[reset]} />, { wrapper: House });
  expect(screen.queryByTestId('moves-list')).toBeNull();
  const zone = within(screen.getByTestId('moves-list-danger'));
  expect(zone.getByText(words('ask.moves.card'))).toBeVisible();
  expect(zone.queryByText(words('house.danger.label'))).toBeNull();
});
