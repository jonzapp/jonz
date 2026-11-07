import { BIN_NIGHT, DEAL_COPY, NEXT_UP_COPY } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { dealThisWeek } from '@/api/settings';
import { testQueryClient } from '@/testing/query';

import { DealButton } from './deal-button';

jest.mock('@/api/settings', () => ({ dealThisWeek: jest.fn() }));

const deal = dealThisWeek as jest.Mock;
const light = BIN_NIGHT.light;

function House({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  deal.mockResolvedValue(undefined);
});

it('starts the house in amber, "Deal week 1" as on every screen, across the column on a phone, and deals the week', async () => {
  await render(<DealButton houseId="h1" />, { wrapper: House });
  const button = screen.getByRole('button', { name: NEXT_UP_COPY.dealWeek1 });
  expect(button).toHaveStyle({ backgroundColor: light.hivis });
  expect(button).toHaveStyle({ alignSelf: 'stretch' });
  await fireEvent.press(button);
  expect(deal).toHaveBeenCalledWith('h1');
});

it('re-deals in outline once the house has started', async () => {
  await render(<DealButton houseId="h1" started />, { wrapper: House });
  expect(screen.getByRole('button', { name: DEAL_COPY.again })).toHaveStyle({ backgroundColor: 'transparent' });
});

it("says it in the screen's words, in the colour asked for, across a card", async () => {
  await render(<DealButton houseId="h1" label="Deal week 1" variant="outline" fill />, { wrapper: House });
  const button = screen.getByRole('button', { name: 'Deal week 1' });
  expect(button).toHaveStyle({ backgroundColor: 'transparent' });
  // On its own, a ButtonRow puts it across the column (Week's empty page, Today's setup card).
  expect(button).toHaveStyle({ alignSelf: 'stretch' });
  expect(screen.getByTestId('deal-week')).toBe(button);
});

it('says why under it when the database refuses', async () => {
  deal.mockRejectedValue(new Error('Only the house admins can do that.'));
  await render(<DealButton houseId="h1" label="Deal this week" />, { wrapper: House });
  await fireEvent.press(screen.getByRole('button', { name: 'Deal this week' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only the house admins can do that.');
});
