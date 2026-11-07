import { DISPUTE_COPY, PARENT_OK_COPY } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { HouseSnapshot } from '@/api/board';
import { loadHouse } from '@/api/board';
import { answerTick } from '@/api/disputes';
import { ToastProvider } from '@/components/toast';
import { assignment, snapshot } from '@/testing/house';
import { testQueryClient } from '@/testing/query';

import { JohnSheetProvider, useJohnSheet } from '.';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn(() => Promise.resolve(false)) }));
jest.mock('@/api/disputes', () => ({ answerTick: jest.fn(), castVote: jest.fn(), raiseDispute: jest.fn() }));
jest.mock('@/api/johns', () => ({ undoDone: jest.fn(), undoCover: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/photos', () => ({ pickPhoto: jest.fn(), uploadProof: jest.fn() }));
jest.mock('@/api/wall', () => ({ signPhoto: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));

const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/** A family: Priya the parent, Sam a kid whose Clean the bath waits for an OK. */
function family(pay = 0): HouseSnapshot {
  const base = snapshot();
  return {
    ...base,
    house: { ...base.house, kind: 'family' },
    rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
    assignments: [
      assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', category: 'bathroom', done_at: at(-1), awaits_ok: true, pay_minor: pay }),
    ],
  };
}

function Opener() {
  const sheet = useJohnSheet();
  return (
    <Pressable accessibilityRole="button" onPress={() => sheet.open('a4')}>
      <Text>Open it</Text>
    </Pressable>
  );
}

async function openAs(userId: string, pay = 0) {
  (loadHouse as jest.Mock).mockResolvedValue(family(pay));
  await render(
    <QueryClientProvider client={testQueryClient()}>
      <ToastProvider>
        <JohnSheetProvider houseId="h1" userId={userId}>
          <Opener />
        </JohnSheetProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(loadHouse).toHaveBeenCalled());
  await fireEvent.press(await screen.findByRole('button', { name: 'Open it' }));
  return screen.findByTestId('john-sheet-body');
}

beforeEach(() => {
  jest.clearAllMocks();
  (answerTick as jest.Mock).mockResolvedValue(undefined);
});

describe("a kid's tick in the John sheet", () => {
  it('offers a parent OK it and Not yet, never a dispute', async () => {
    await openAs('priya');
    expect(await screen.findByTestId('ok-who')).toHaveTextContent('You can OK it. Not yet sends it back to Sam.');
    expect(screen.getByTestId('ticked-line')).toHaveTextContent(PARENT_OK_COPY.waiting, { exact: false });
    expect(screen.queryByRole('button', { name: DISPUTE_COPY.open })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: PARENT_OK_COPY.ok }));
    await waitFor(() => expect(answerTick).toHaveBeenCalledWith('a4', true));
  });

  it('says what OK pays, on a John that earns', async () => {
    await openAs('priya', 20);
    await fireEvent.press(await screen.findByRole('button', { name: 'OK, pay 20p' }));
    await waitFor(() => expect(answerTick).toHaveBeenCalledWith('a4', true));
  });

  it('sends it back on Not yet', async () => {
    await openAs('priya');
    await fireEvent.press(await screen.findByRole('button', { name: PARENT_OK_COPY.notYet }));
    await waitFor(() => expect(answerTick).toHaveBeenCalledWith('a4', false));
  });

  it('tells the kid it waits, and leaves them Undo', async () => {
    await openAs('sam');
    expect(await screen.findByTestId('ticked-line')).toHaveTextContent(PARENT_OK_COPY.waiting, { exact: false });
    expect(screen.queryByRole('button', { name: PARENT_OK_COPY.ok })).toBeNull();
    expect(screen.getByTestId('sheet-undo')).toBeOnTheScreen();
  });
});
