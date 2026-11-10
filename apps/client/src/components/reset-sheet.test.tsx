import { type ResetPreview, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { undoAction } from '@/api/history';
import { applyReset, previewReset } from '@/api/resets';
import { ToastProvider } from '@/components/toast';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

import { ResetSheet } from './reset-sheet';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/history', () => ({ undoAction: jest.fn(), undoLatest: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const onClose = jest.fn();

/** What resetting this week would do: Sam's two ticks and Priya's one go, and Sam hears. */
function preview(overrides: Partial<ResetPreview> = {}): ResetPreview {
  return {
    kind: 'week',
    week: { id: 'w1', starts_on: '2026-10-26', starts_at: '2026-10-26T00:00:00Z', ends_at: '2026-11-02T00:00:00Z' },
    month: '2026-10',
    people: { sam: { ticks: 2, points: -4, forfeit: 300 }, priya: { ticks: 1 } },
    told: ['sam'],
    reopened: 3,
    past_due: 0,
    flags: 1,
    disputes: 0,
    correction: false,
    nothing: false,
    ...overrides,
  };
}

async function open() {
  function Host() {
    return (
      <ToastProvider>
        <ResetSheet ask={{ houseId: 'h1', kind: 'week', week: 'w1' }} userId="priya" words={{}} onClose={onClose} />
      </ToastProvider>
    );
  }
  await renderPages({ index: Host }, '/');
  return within(await screen.findByTestId('reset-sheet'));
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (previewReset as jest.Mock).mockResolvedValue(preview());
  (applyReset as jest.Mock).mockResolvedValue('action-1');
  (undoAction as jest.Mock).mockResolvedValue(undefined);
});

it('says in numbers what resetting the week changes, before anything does', async () => {
  const sheet = await open();
  expect(await sheet.findByText('3 ticks cleared')).toBeOnTheScreen();
  expect(sheet.getByText('Sam 2, you 1')).toBeOnTheScreen();
  expect(sheet.getByText('Sam −4 pts')).toBeOnTheScreen();
  expect(sheet.getByText('£3 of forfeits removed')).toBeOnTheScreen();
  expect(sheet.getByText('1 flag')).toBeOnTheScreen();
  expect(sheet.getByTestId('reset-told')).toHaveTextContent('Sam gets a notification');
  expect(previewReset).toHaveBeenCalledWith({ houseId: 'h1', kind: 'week', week: 'w1' });
  expect(applyReset).not.toHaveBeenCalled();
});

it('resets on the hazard button, then offers Undo', async () => {
  const sheet = await open();
  await fireEvent.press(await sheet.findByRole('button', { name: 'Reset this week' }));
  await waitFor(() => expect(applyReset).toHaveBeenCalledWith({ houseId: 'h1', kind: 'week', week: 'w1' }));
  expect(onClose).toHaveBeenCalled();
  const toast = within(await screen.findByTestId('toast'));
  expect(toast.getByText(words('house.resets.done'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('toast-action'));
  await waitFor(() => expect(undoAction).toHaveBeenCalledWith('action-1'));
});

it('has nothing to press when there is nothing to reset', async () => {
  (previewReset as jest.Mock).mockResolvedValue(preview({ people: {}, told: [], nothing: true }));
  const sheet = await open();
  expect(await sheet.findByText(words('house.resets.nothing'))).toBeOnTheScreen();
  expect(sheet.queryByTestId('confirm')).toBeNull();
});
