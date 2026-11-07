import { CHAT_MOVES_COPY, type ChatMove } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { cancelAway, setAway } from '@/api/away';
import { testQueryClient } from '@/testing/query';

import { MovesCard } from './moves-card';

jest.mock('@/api/away', () => ({ setAway: jest.fn(async () => 0), cancelAway: jest.fn(async () => undefined) }));

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
  await render(<MovesCard houseId="h1" items={items} />, { wrapper: House });
  expect(screen.getByTestId('move-away')).toHaveTextContent(CHAT_MOVES_COPY.title(items[0]), { exact: false });
  expect(screen.getByTestId('move-cancel_away')).toHaveTextContent(CHAT_MOVES_COPY.title(items[1]), { exact: false });
  expect(setAway).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`^${CHAT_MOVES_COPY.title(items[1])}`) }));
  await fireEvent.press(screen.getByRole('button', { name: CHAT_MOVES_COPY.apply(1) }));
  expect(setAway).toHaveBeenCalledWith({ from: '2026-11-20', to: '2026-11-23', note: 'Lisbon' });
  expect(cancelAway).not.toHaveBeenCalled();
  expect(await screen.findByText(CHAT_MOVES_COPY.done(1))).toBeTruthy();
});

it('says what was refused, and what got done before it', async () => {
  (cancelAway as jest.Mock).mockRejectedValueOnce(new Error('That time away has already ended.'));
  await render(<MovesCard houseId="h1" items={items} />, { wrapper: House });
  await fireEvent.press(screen.getByRole('button', { name: CHAT_MOVES_COPY.apply(2) }));
  expect(await screen.findByText(CHAT_MOVES_COPY.done(1))).toBeTruthy();
  expect(screen.getByText('That time away has already ended.')).toBeTruthy();
});

it('can’t do nothing', async () => {
  await render(<MovesCard houseId="h1" items={items.slice(0, 1)} />, { wrapper: House });
  await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`^${CHAT_MOVES_COPY.title(items[0])}`) }));
  expect(screen.getByRole('button', { name: CHAT_MOVES_COPY.apply(0) })).toBeDisabled();
});
