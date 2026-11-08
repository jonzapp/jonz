import { ASK_CHATS_COPY } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { deleteChat, listChats } from '@/api/ask-chats';
import { testQueryClient } from '@/testing/query';

import { houseChats } from '@/hooks/use-ask-chats';

import { AllChats } from './saved-chats';

jest.mock('@/api/ask-chats', () => ({ listChats: jest.fn(), deleteChat: jest.fn(async () => undefined) }));

// A fixed day, so Today and Yesterday never hang on the real clock.
const NOW = new Date('2026-11-06T12:00:00Z');
const CHATS = [
  { id: 'a', title: 'Add Ivy to main floor', updatedAt: '2026-11-06T09:00:00Z' },
  { id: 'b', title: 'Who has the bins?', updatedAt: '2026-11-05T09:00:00Z' },
  { id: 'c', title: 'Book me away 14–21 Nov', updatedAt: '2026-11-02T09:00:00Z' },
  { id: 'd', title: 'Oven every month', updatedAt: '2026-10-20T09:00:00Z' },
];

function House({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (listChats as jest.Mock).mockResolvedValue(CHATS);
});

it('lists every chat under Today, Last 7 days and Earlier, and opens one', async () => {
  const open = jest.fn();
  await render(<AllChats store={houseChats('h1')} zone="Europe/London" now={NOW} onOpen={open} onDeleted={jest.fn()} />, { wrapper: House });
  expect(await screen.findByText('Oven every month')).toBeTruthy();
  expect(screen.getAllByTestId('chats-group')).toHaveLength(3);
  expect(screen.getByText(ASK_CHATS_COPY.lastWeek)).toBeTruthy();
  expect(screen.getByText(ASK_CHATS_COPY.earlier)).toBeTruthy();
  await fireEvent.press(screen.getByText('Who has the bins?'));
  expect(open).toHaveBeenCalledWith('b');
});

it('lists every chat and deletes one only after the sheet says it is gone for good', async () => {
  const deleted = jest.fn();
  await render(
    <AllChats store={houseChats('h1')} zone="Europe/London" now={NOW} onOpen={jest.fn()} onDeleted={deleted} />,
    { wrapper: House },
  );
  expect(await screen.findByText('Oven every month')).toBeTruthy();
  expect(screen.getAllByTestId('saved-chat')).toHaveLength(4);
  await fireEvent.press(screen.getByRole('button', { name: ASK_CHATS_COPY.deleteChat('Who has the bins?') }));
  expect(screen.getByText(ASK_CHATS_COPY.deleteBody)).toBeTruthy();
  expect(deleteChat).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('confirm'));
  await waitFor(() => expect(deleted).toHaveBeenCalledWith('b'));
  expect(deleteChat).toHaveBeenCalledWith('b');
});

it('says so when there are no chats', async () => {
  (listChats as jest.Mock).mockResolvedValue([]);
  await render(
    <AllChats store={houseChats('h1')} zone="Europe/London" now={NOW} onOpen={jest.fn()} onDeleted={jest.fn()} />,
    { wrapper: House },
  );
  expect(await screen.findByText(ASK_CHATS_COPY.none)).toBeTruthy();
});
