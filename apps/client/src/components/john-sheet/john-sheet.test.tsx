import {
  BIN_NIGHT,
  buildStake,
  CREW_COPY,
  DISPUTE_COPY,
  FOCUS_SHELL_COPY,
  JOHN_COPY,
  JOHN_SHEET_COPY,
  monthOf,
  NEXT_UP_COPY,
  ON_CALL_COPY,
  SWAP_COPY,
  WHY_COPY,
  type DisputeRow,
} from '@app/core';
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Pressable, ScrollView, Text } from 'react-native';

import type { Housemate, HouseSnapshot } from '@/api/board';
import { loadHouse } from '@/api/board';
import { castVote } from '@/api/disputes';
import { coverJohn, markDone, removeFlag, rollCall, spendImmunity, spendSwap, undoCover, undoDone } from '@/api/johns';
import { pickPhoto } from '@/api/photos';
import { applyReset, previewReset } from '@/api/resets';
import { signPhoto } from '@/api/wall';
import { ToastProvider } from '@/components/toast';
import { houseKey, stakeKey } from '@/hooks/keys';
import { assignment, snapshot } from '@/testing/house';
import { measureAt, measureNowhere } from '@/testing/layout';
import { testQueryClient } from '@/testing/query';

import { JohnSheetProvider, useJohnSheet, type JohnSheetFocus } from '.';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn(() => Promise.resolve(false)) }));
jest.mock('@/api/johns', () => ({
  markDone: jest.fn(),
  rollCall: jest.fn(),
  undoDone: jest.fn(),
  coverJohn: jest.fn(),
  undoCover: jest.fn(),
  spendImmunity: jest.fn(),
  spendSwap: jest.fn(),
  removeFlag: jest.fn(),
}));
jest.mock('@/api/disputes', () => ({ castVote: jest.fn(), raiseDispute: jest.fn() }));
jest.mock('@/api/photos', () => ({ pickPhoto: jest.fn(), uploadProof: jest.fn() }));
jest.mock('@/api/wall', () => ({ signPhoto: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

const MEGAN: Housemate = { userId: 'megan', name: 'Megan', photo: null, role: 'member', streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } };

/** Where the sheet is opened from, and what for. */
const OPENERS: [string, JohnSheetFocus?][] = [['a1'], ['a3'], ['a4'], ['a5'], ['gone'], ['a1', 'swap'], ['a1', 'cant'], ['a4', 'dispute']];

/** Somewhere in the house: buttons that open the sheet on a John, and put it away. */
function Opener() {
  const sheet = useJohnSheet();
  return (
    <>
      {OPENERS.map(([id, focus]) => (
        <Pressable key={`${id}${focus ?? ''}`} accessibilityRole="button" onPress={() => sheet.open(id, focus)}>
          <Text>{focus ? `Open ${id} at ${focus}` : `Open ${id}`}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={sheet.close}>
        <Text>Put it away</Text>
      </Pressable>
    </>
  );
}

async function show(house?: HouseSnapshot): Promise<QueryClient> {
  if (house) (loadHouse as jest.Mock).mockResolvedValue(house);
  const client = testQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <JohnSheetProvider houseId="h1" userId="priya">
          <Opener />
        </JohnSheetProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(loadHouse).toHaveBeenCalled());
  return client;
}

/** Open the sheet on a John and wait for it. */
async function openOn(name: string) {
  await fireEvent.press(await screen.findByRole('button', { name }));
  return screen.findByTestId('john-sheet-body');
}

/** The house with these Johns this week, and these people. */
function house(assignments: HouseSnapshot['assignments'], members = snapshot().members, disputes: DisputeRow[] = []) {
  return snapshot({ assignments, members, disputes });
}

/** Priya, with what she holds changed. */
function priyaWith(tokens: Partial<Housemate>): Housemate[] {
  const [priya, ...rest] = snapshot().members;
  return [{ ...priya, ...tokens }, ...rest];
}

const binsOut = (overrides: Parameters<typeof assignment>[0] = {}) => assignment(overrides);
const samsBath = (overrides: Parameters<typeof assignment>[0] = {}) =>
  assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', category: 'bathroom', points: 4, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(house([binsOut(), samsBath({ done_at: at(-1) })]));
  (markDone as jest.Mock).mockResolvedValue(undefined);
  (rollCall as jest.Mock).mockResolvedValue(2);
  (undoDone as jest.Mock).mockResolvedValue(undefined);
  (coverJohn as jest.Mock).mockResolvedValue(undefined);
  (undoCover as jest.Mock).mockResolvedValue(undefined);
  (spendImmunity as jest.Mock).mockResolvedValue(undefined);
  (spendSwap as jest.Mock).mockResolvedValue(undefined);
  (castVote as jest.Mock).mockResolvedValue(undefined);
  (pickPhoto as jest.Mock).mockResolvedValue(null);
  (signPhoto as jest.Mock).mockResolvedValue('https://photos.test/a3.jpg');
});

/** The sheet's buttons, but for an admin's Change result. */
function notChangeResult(body: ReturnType<typeof screen.getByTestId>) {
  const change = within(body).queryByTestId('change-result');
  const theirs = change ? within(change).queryAllByRole('button') : [];
  return within(body).queryAllByRole('button').filter((b) => !theirs.includes(b));
}

describe('the header', () => {
  it('says what the John is, its name, when it is due and what lateness costs', async () => {
    await show();
    expect(screen.queryByTestId('john-sheet-body')).toBeNull();
    await openOn('Open a1');
    expect(screen.getByRole('header', { name: 'Bins out' })).toBeOnTheScreen();
    expect(screen.getByText('Bins, 2 pts')).toBeOnTheScreen();
    expect(screen.getByTestId('lid-bar', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('john-sheet-when')).toHaveTextContent(/^Due .+, late costs £1, missed £3$/);
  });

  it('says how often it comes round, from the John on the list it was dealt from', async () => {
    await show(house([binsOut({ john_id: 'j1', johns: { every_weeks: 2 } })]));
    await openOn('Open a1');
    expect(screen.getByText('Bins, 2 pts, every 2 weeks')).toBeOnTheScreen();
  });

  it("says no more than lateness can still cost the John's owner this month, once a screen has read the Stake", async () => {
    const client = await show();
    const month = monthOf(new Date(Date.now() + 48 * HOUR), 'Europe/London');
    // Priya has £2 of her £20 stake left to lose.
    await act(() =>
      client.setQueryData(
        stakeKey('h1'),
        buildStake({
          ledger: [{ id: 1, user_id: 'priya', kind: 'forfeit', amount_minor: -1800, month, counterparty: null, created_at: at(-1) }],
          closedMonths: [],
          memberIds: ['priya', 'sam'],
          stakeMinor: 2000,
          month,
        }),
      ),
    );
    await openOn('Open a1');
    expect(screen.getByTestId('john-sheet-when')).toHaveTextContent(/^Due .+, late costs £1, missed £2$/);
  });
});

describe('Why?', () => {
  const dealt = {
    to: 'priya',
    by: 'behind',
    weighed: [
      { userId: 'priya', standing: -2.5 },
      { userId: 'sam', standing: 1, last: true },
    ],
    away: [],
  };

  it('says why the John is yours and what slipping would cost, with how it added up folded away', async () => {
    await show(house([binsOut({ dealt })]));
    await openOn('Open a1');
    const why = screen.getByTestId('john-why');
    expect(within(why).getByText(WHY_COPY.label)).toBeOnTheScreen();
    expect(within(why).getByTestId('why-answer')).toHaveTextContent(WHY_COPY.behind('you'));
    expect(within(why).getByTestId('why-stakes')).toHaveTextContent(
      /^If it isn’t done by .+, it’s missed\. A miss counts for nobody, so the work comes back to you/,
    );
    expect(within(why).queryByTestId('why-row')).toBeNull();

    await fireEvent.press(within(why).getByTestId('why-adds-up'));
    const rows = within(why).getAllByTestId('why-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/You.*Dealt it.*−2\.5/);
    expect(rows[1]).toHaveTextContent(/Had it last time.*\+1/);
    expect(within(why).getByText(WHY_COPY.key)).toBeOnTheScreen();
  });

  it('owns up to a John dealt before the deal kept its working, with nothing to fold open', async () => {
    await show();
    await openOn('Open a1');
    expect(screen.getByTestId('why-answer')).toHaveTextContent(WHY_COPY.unknown);
    expect(screen.queryByTestId('why-adds-up')).toBeNull();
  });

  it("says whose work a housemate's settled John counted as", async () => {
    const onlySam = { to: 'sam', by: 'only', weighed: [{ userId: 'sam', standing: 0 }], away: ['priya'] };
    await show(house([binsOut(), samsBath({ dealt: onlySam, done_at: at(-30), outcome: 'done' })]));
    await openOn('Open a4');
    expect(screen.getByTestId('why-answer')).toHaveTextContent(`${WHY_COPY.only('Sam', false)} ${WHY_COPY.away('You', false)}`);
    expect(screen.getByTestId('why-stakes')).toHaveTextContent(WHY_COPY.counts('Sam’s'));
  });
});

describe('your open John', () => {
  it('ticks it, or takes a photo first', async () => {
    await show();
    const body = await openOn('Open a1');
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.markDone }));
    expect(markDone).toHaveBeenCalledWith('a1');
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_SHEET_COPY.addPhoto }));
    expect(pickPhoto).toHaveBeenCalledWith('camera');
  });

  it('leads a photo John with the camera, then the library', async () => {
    await show(house([binsOut({ needs_photo: true })]));
    const body = await openOn('Open a1');
    expect(within(body).getByTestId('sheet-mark-done')).toHaveTextContent(NEXT_UP_COPY.takePhoto);
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_SHEET_COPY.fromLibrary }));
    expect(pickPhoto).toHaveBeenCalledWith('library');
  });

  it('says a refusal in the sheet', async () => {
    (markDone as jest.Mock).mockRejectedValue(new Error('That week has closed.'));
    await show();
    const body = await openOn('Open a1');
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.markDone }));
    expect(await within(body).findByRole('alert')).toHaveTextContent('That week has closed.');
  });

  it("offers no way out without a skip or a swap", async () => {
    await show(house([binsOut(), samsBath()]));
    await openOn('Open a1');
    expect(screen.queryByTestId('if-you-cant')).toBeNull();
  });

  describe("opened at If you can't (Today's skip or swap)", () => {
    it('starts on the skip, ready to confirm, when a skip is all you hold', async () => {
      await show(house([binsOut(), samsBath()], priyaWith({ immunityTokens: 1 })));
      const body = await openOn('Open a1 at cant');
      expect(within(within(body).getByTestId('skip-confirm')).getByText(JOHN_SHEET_COPY.skipSentence('Bins out', 0))).toBeOnTheScreen();
      expect(spendImmunity).not.toHaveBeenCalled();
    });

    it('starts on the swap when a swap is all you hold', async () => {
      await show(house([binsOut(), samsBath()], priyaWith({ swapTokens: 1 })));
      const body = await openOn('Open a1 at cant');
      expect(within(body).getByTestId('swap-picker')).toBeOnTheScreen();
    });

    it('offers both, with the tick, when you hold both', async () => {
      await show(house([binsOut(), samsBath()], priyaWith({ immunityTokens: 1, swapTokens: 1 })));
      const body = await openOn('Open a1 at cant');
      expect(within(body).getByTestId('tick-actions')).toBeOnTheScreen();
      expect(within(body).getByTestId('skip-row')).toBeOnTheScreen();
      expect(within(body).getByTestId('swap-row')).toBeOnTheScreen();
    });

    it('opens scrolled to them, should the tick above leave them out of view', async () => {
      // Jest lays nothing out: the sheet is 400 tall, its content 900, and If you can't starts at 500.
      measureAt(500);
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
      await show(house([binsOut(), samsBath()], priyaWith({ immunityTokens: 1, swapTokens: 1 })));
      const body = await openOn('Open a1 at cant');
      const anchor = within(body).getByTestId('sheet-anchor-cant');
      expect(anchor).toContainElement(within(body).getByTestId('if-you-cant'));
      await fireEvent(screen.getByTestId('sheet-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } });
      await fireEvent(screen.getByTestId('sheet-scroll'), 'contentSizeChange', 390, 900);
      await fireEvent(anchor, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 160 } } });
      expect(scrollTo).toHaveBeenCalledWith({ y: 500 - 16, animated: false });
      measureNowhere();
    });

    it('opens at the top when opened on the John itself', async () => {
      measureAt(500);
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
      await show(house([binsOut(), samsBath()], priyaWith({ immunityTokens: 1, swapTokens: 1 })));
      const body = await openOn('Open a1');
      await fireEvent(screen.getByTestId('sheet-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } });
      await fireEvent(screen.getByTestId('sheet-scroll'), 'contentSizeChange', 390, 900);
      await fireEvent(within(body).getByTestId('sheet-anchor-cant'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 160 } } });
      expect(scrollTo).not.toHaveBeenCalled();
      measureNowhere();
    });
  });

  describe('using a skip', () => {
    it('says what it means first, and can be called off', async () => {
      await show(house([binsOut()], priyaWith({ immunityTokens: 1 })));
      const body = await openOn('Open a1');
      expect(within(body).getByText(JOHN_SHEET_COPY.skipMeta(1))).toBeOnTheScreen();
      await fireEvent.press(within(body).getByTestId('skip-row'));
      expect(within(within(body).getByTestId('skip-confirm')).getByText(JOHN_SHEET_COPY.skipSentence('Bins out', 0))).toBeOnTheScreen();
      await fireEvent.press(within(body).getByRole('button', { name: FOCUS_SHELL_COPY.cancel }));
      expect(within(body).queryByTestId('skip-confirm')).toBeNull();
      expect(spendImmunity).not.toHaveBeenCalled();
    });

    it('spends it on "Skip it"', async () => {
      await show(house([binsOut()], priyaWith({ immunityTokens: 2 })));
      const body = await openOn('Open a1');
      await fireEvent.press(within(body).getByTestId('skip-row'));
      expect(within(body).getByText(JOHN_SHEET_COPY.skipSentence('Bins out', 1))).toBeOnTheScreen();
      await fireEvent.press(within(body).getByRole('button', { name: JOHN_SHEET_COPY.skipIt }));
      expect(spendImmunity).toHaveBeenCalledWith('a1');
    });

    it('says a refusal where it was asked', async () => {
      (spendImmunity as jest.Mock).mockRejectedValue(new Error('You have no immunity left.'));
      await show(house([binsOut()], priyaWith({ immunityTokens: 1 })));
      const body = await openOn('Open a1');
      await fireEvent.press(within(body).getByTestId('skip-row'));
      await fireEvent.press(within(body).getByRole('button', { name: JOHN_SHEET_COPY.skipIt }));
      expect(await within(within(body).getByTestId('skip-confirm')).findByRole('alert')).toHaveTextContent(
        'You have no immunity left.',
      );
    });
  });

  describe('swapping', () => {
    const swappable = () => house([binsOut(), samsBath()], priyaWith({ swapTokens: 1 }));

    it("offers the housemates' open Johns, and swaps for the one picked", async () => {
      await show(swappable());
      const body = await openOn('Open a1');
      expect(within(body).queryByTestId('skip-row')).toBeNull();
      await fireEvent.press(within(body).getByTestId('swap-row'));
      expect(within(body).getByText(JOHN_SHEET_COPY.swapBody('Bins out'))).toBeOnTheScreen();
      // One choice of n, to a screen reader.
      expect(within(body).getByLabelText(JOHN_SHEET_COPY.swapFor)).toBeOnTheScreen();
      const choice = within(body).getByRole('radio', { name: /^Clean the bath, Sam, / });
      expect(choice).not.toBeChecked();
      expect(within(body).queryByTestId('swap-chosen')).toBeNull();
      expect(within(body).getByTestId('swap-them')).toBeDisabled();

      expect(within(body).getByTestId('swap-choice')).not.toHaveStyle({ backgroundColor: BIN_NIGHT.light.secondary });

      await fireEvent.press(choice);
      expect(choice).toBeChecked();
      // Ticked at the end of its row, which takes the tint; the owner's initials keep a plate that shows on it.
      expect(within(choice).getByTestId('swap-chosen')).toBeOnTheScreen();
      const row = within(body).getByTestId('swap-choice');
      expect(row).toHaveStyle({ backgroundColor: BIN_NIGHT.light.secondary });
      expect(within(row).getByTestId('avatar', { includeHiddenElements: true })).toHaveStyle({ backgroundColor: BIN_NIGHT.light.card });
      await fireEvent.press(within(body).getByRole('button', { name: SWAP_COPY.swap }));
      expect(spendSwap).toHaveBeenCalledWith('a1', 'a4');
      // The John is Sam's now: the sheet goes.
      await waitFor(() => expect(screen.queryByTestId('john-sheet-body')).toBeNull());
    });

    it('says which of their Johns is overdue, with its edge and its mark until picked', async () => {
      await show(house([binsOut(), samsBath({ due_at: at(-5) })], priyaWith({ swapTokens: 1 })));
      const body = await openOn('Open a1 at swap');
      // Its status is said too, not just drawn.
      const choice = within(body).getByRole('radio', { name: /^Clean the bath, Overdue, Sam, was due / });
      expect(within(choice).getByTestId('status-overdue')).toBeOnTheScreen();
      expect(within(within(body).getByTestId('swap-choice')).getByTestId('hazard-tape', { includeHiddenElements: true })).toBeOnTheScreen();
      await fireEvent.press(choice);
      // Picked, the tick takes the mark's place, and the word leads the meta line instead.
      expect(within(choice).queryByTestId('status-overdue')).toBeNull();
      expect(within(choice).getByTestId('swap-chosen')).toBeOnTheScreen();
      expect(within(choice).getByText(/^Overdue, Sam, was due /)).toBeOnTheScreen();
    });

    it('goes back to the tick on Cancel', async () => {
      await show(swappable());
      const body = await openOn('Open a1');
      await fireEvent.press(within(body).getByTestId('swap-row'));
      await fireEvent.press(within(body).getByTestId('swap-cancel'));
      expect(within(body).queryByTestId('swap-picker')).toBeNull();
      expect(within(body).getByTestId('tick-actions')).toBeOnTheScreen();
    });

    it('opens straight on the swap when asked to', async () => {
      await show(swappable());
      const body = await openOn('Open a1 at swap');
      expect(within(body).getByTestId('swap-picker')).toBeOnTheScreen();
    });

    it('says a refusal, and stays open', async () => {
      (spendSwap as jest.Mock).mockRejectedValue(new Error('Sam has ticked that one.'));
      await show(swappable());
      const body = await openOn('Open a1 at swap');
      await fireEvent.press(within(body).getByRole('radio', { name: /^Clean the bath/ }));
      await fireEvent.press(within(body).getByTestId('swap-them'));
      expect(await within(body).findByRole('alert')).toHaveTextContent('Sam has ticked that one.');
      expect(screen.getByTestId('john-sheet-body')).toBeOnTheScreen();
    });
  });
});

describe('a John done together, and help', () => {
  const MEGAN_HOME: Housemate = { ...MEGAN };
  const people = [...snapshot().members, MEGAN_HOME];
  /** Garden tidy for two: Priya's place (a1) and Sam's (a5), 4 pts each. */
  const garden = (mine: Parameters<typeof assignment>[0] = {}, sams: Parameters<typeof assignment>[0] = {}) => [
    assignment({ id: 'a1', name: 'Garden tidy', category: 'outside', points: 4, job_id: 'job1', ...mine }),
    assignment({ id: 'a5', user_id: 'sam', name: 'Garden tidy', category: 'outside', points: 4, job_id: 'job1', ...sams }),
  ];

  it('says who is on it, and ticks it with its roll call', async () => {
    await show(house(garden(), people));
    const body = await openOn('Open a1');
    const onIt = within(body).getByTestId('crew-part');
    expect(within(onIt).getByText(JOHN_SHEET_COPY.you)).toBeOnTheScreen();
    expect(within(onIt).getByText('Sam')).toBeOnTheScreen();
    // No one-tap tick: Mark done asks who did it.
    expect(within(body).queryByRole('button', { name: CREW_COPY.withHelp })).toBeNull();
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.markDone }));
    const call = within(body).getByTestId('roll-call');
    expect(within(body).getByTestId('roll-call-sub')).toHaveTextContent('8 pts, split between whoever did it');
    expect(within(call).getByRole('checkbox', { name: `You, ${CREW_COPY.youDidIt}` })).toBeDisabled();
    expect(within(call).getByRole('checkbox', { name: 'Sam' })).toBeChecked();
    expect(within(call).getByTestId('roll-call-split')).toHaveTextContent('8 pts ÷ 2, 4 pts each');
    expect(within(body).queryByTestId('crew-part')).toBeNull();

    // Sam wasn't there: a miss for Sam, and Sam's part comes to whoever did it.
    await fireEvent.press(within(call).getByRole('checkbox', { name: 'Sam' }));
    expect(within(call).getByRole('checkbox', { name: `Sam, ${CREW_COPY.leftOff('Sam')}` })).not.toBeChecked();
    expect(within(call).getByTestId('roll-call-split')).toHaveTextContent('8 pts ÷ 1, 8 pts each');

    // Megan helped.
    await fireEvent.press(within(call).getByRole('button', { name: CREW_COPY.addHelper }));
    await fireEvent.press(within(call).getByRole('button', { name: 'Megan' }));
    expect(within(call).getByRole('checkbox', { name: `Megan, ${CREW_COPY.helped}` })).toBeChecked();
    expect(within(call).getByTestId('roll-call-split')).toHaveTextContent('8 pts ÷ 2, 4 pts each');

    await fireEvent.press(within(body).getByRole('button', { name: CREW_COPY.markDone }));
    expect(rollCall).toHaveBeenCalledWith('a1', ['priya', 'megan'], undefined);
    expect(markDone).not.toHaveBeenCalled();
  });

  it('goes back to the sheet on Cancel', async () => {
    await show(house(garden(), people));
    const body = await openOn('Open a1');
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.markDone }));
    await fireEvent.press(within(body).getByRole('button', { name: FOCUS_SHELL_COPY.cancel }));
    expect(within(body).queryByTestId('roll-call')).toBeNull();
    expect(within(body).getByTestId('crew-part')).toBeOnTheScreen();
  });

  it('adds a helper to a John done by one, and has nobody left to add once everyone is on it', async () => {
    await show(house([binsOut()]));
    const body = await openOn('Open a1');
    await fireEvent.press(within(body).getByRole('button', { name: CREW_COPY.withHelp }));
    const call = within(body).getByTestId('roll-call');
    expect(within(call).getByTestId('roll-call-split')).toHaveTextContent('2 pts ÷ 1, 2 pts each');
    await fireEvent.press(within(call).getByRole('button', { name: CREW_COPY.addHelper }));
    await fireEvent.press(within(call).getByRole('button', { name: 'Sam' }));
    expect(within(call).getByTestId('roll-call-split')).toHaveTextContent('2 pts ÷ 2, 1 pt each');
    await fireEvent.press(within(call).getByRole('button', { name: CREW_COPY.addHelper }));
    expect(within(call).getByText(CREW_COPY.noMoreHelpers)).toBeOnTheScreen();
    await fireEvent.press(within(body).getByRole('button', { name: CREW_COPY.markDone }));
    expect(rollCall).toHaveBeenCalledWith('a1', ['priya', 'sam'], undefined);
  });

  it('says who did it once ticked, and takes the whole roll call back from any of its places', async () => {
    const crew = [
      { user_id: 'priya', helper: false, points: 4 },
      { user_id: 'megan', helper: true, points: '4' },
    ];
    await show(house(garden({ done_at: at(-1), crew }, { absent_at: at(-1) }), people));
    const body = await openOn('Open a5');
    const did = within(body).getByTestId('crew-part');
    expect(within(did).getAllByTestId('crew-member')).toHaveLength(2);
    expect(within(did).getByText(CREW_COPY.helped)).toBeOnTheScreen();
    expect(within(did).getByText(CREW_COPY.wasntThere)).toBeOnTheScreen();
    expect(within(body).getByTestId('ticked-line')).toHaveTextContent(/^You ticked it .+ without Sam/);
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.undo }));
    expect(undoDone).toHaveBeenCalledWith('a1');
  });
});

describe('your tick, being checked', () => {
  it('says when it stands, and undoes it', async () => {
    await show(house([binsOut({ done_at: at(-1) })]));
    const body = await openOn('Open a1');
    expect(within(body).getByTestId('ticked-line')).toHaveTextContent(/^You ticked this .+, stands in 2[23]h$/);
    expect(within(body).queryByRole('button', { name: JOHN_COPY.markDone })).toBeNull();
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.undo }));
    expect(undoDone).toHaveBeenCalledWith('a1');
  });

  it('says a refusal', async () => {
    (undoDone as jest.Mock).mockRejectedValue(new Error('It has stood.'));
    await show(house([binsOut({ done_at: at(-1) })]));
    const body = await openOn('Open a1');
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.undo }));
    expect(await within(body).findByRole('alert')).toHaveTextContent('It has stood.');
  });
});

describe("a housemate's John", () => {
  it("lets an admin change its result, through the reset's numbers and its hazard button", async () => {
    (previewReset as jest.Mock).mockResolvedValue({
      kind: 'result',
      week: null,
      month: '2026-10',
      people: { sam: { points: 2 } },
      told: ['sam'],
      reopened: 0,
      past_due: 0,
      flags: 0,
      disputes: 0,
      correction: false,
      nothing: false,
    });
    (applyReset as jest.Mock).mockResolvedValue('action-1');
    await show(house([binsOut(), samsBath()]));
    const body = await openOn('Open a4');
    await fireEvent.press(within(body).getByTestId('result-done'));
    const panel = within(await within(body).findByTestId('reset-panel'));
    expect(await panel.findByText('Sam gets a notification')).toBeOnTheScreen();
    await fireEvent.press(panel.getByRole('button', { name: 'Mark it done' }));
    await waitFor(() =>
      expect(applyReset).toHaveBeenCalledWith({ houseId: 'h1', kind: 'result', assignment: 'a4', outcome: 'done' }),
    );
  });

  it('says whose it is while it is open, with nothing to do', async () => {
    await show(house([binsOut(), samsBath()]));
    const body = await openOn('Open a4');
    expect(within(body).getByText(JOHN_SHEET_COPY.theirs('Sam'))).toBeOnTheScreen();
    // Only an admin's Change result, which every John has.
    expect(notChangeResult(body)).toEqual([]);
  });

  it('says who ticked it and when it stands, and disputes it in place', async () => {
    await show();
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('ticked-line')).toHaveTextContent(/^Sam ticked this .+, stands in 2[23]h$/);
    await fireEvent.press(within(body).getByRole('button', { name: DISPUTE_COPY.open }));
    expect(within(body).getByTestId('dispute-reason')).toBeOnTheScreen();
    expect(within(body).getByTestId('send-dispute')).toBeOnTheScreen();
  });

  it('waits for Dispute to be pressed, even when opened to dispute', async () => {
    await show();
    const body = await openOn('Open a4 at dispute');
    expect(within(body).queryByTestId('dispute-reason')).toBeNull();
    expect(within(body).getByRole('button', { name: DISPUTE_COPY.open })).toBeOnTheScreen();
  });
});

describe("covering a housemate's John", () => {
  it('offers "I did this" once it is past due and the grace, and covers it', async () => {
    await show(house([binsOut(), samsBath({ due_at: at(-5) })]));
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('cover-body')).toHaveTextContent(/^Sam hasn’t done it\. If you do, it counts as Sam’s miss/);
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_SHEET_COPY.coverIt }));
    expect(coverJohn).toHaveBeenCalledWith('a4');
    expect(markDone).not.toHaveBeenCalled();
  });

  it('says when covering opens while it is still in the grace', async () => {
    await show(house([binsOut(), samsBath({ due_at: at(-1) })]));
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('cover-soon')).toHaveTextContent(/^It’s still Sam’s to do\. Anyone else can cover it from /);
    expect(within(body).queryByRole('button', { name: JOHN_SHEET_COPY.coverIt })).toBeNull();
  });

  it("says who covered it, and lets the coverer take it back", async () => {
    await show(house([binsOut(), samsBath({ due_at: at(-5), done_at: at(-1), covered_by: 'priya' })]));
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('ticked-line')).toHaveTextContent(/^You covered this .+, stands in 2[23]h$/);
    await fireEvent.press(within(body).getByRole('button', { name: JOHN_COPY.undo }));
    expect(undoCover).toHaveBeenCalledWith('a4');
    expect(undoDone).not.toHaveBeenCalled();
  });
});

describe('a disputed John', () => {
  const dispute = (votes: DisputeRow['dispute_votes'] = [{ user_id: 'megan', uphold: true }]): DisputeRow => ({
    id: 'd1',
    assignment_id: 'a4',
    raised_by: 'megan',
    reason: 'Ring round the bath',
    closes_at: at(17.5),
    dispute_votes: votes,
  });
  const disputed = (votes?: DisputeRow['dispute_votes']) =>
    house([binsOut(), samsBath({ done_at: at(-2) })], [...snapshot().members, MEGAN], [dispute(votes)]);

  it('shows the reason beside the owner, and the tally', async () => {
    await show(disputed());
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('john-sheet-when')).toHaveTextContent('Disputed by Megan');
    expect(within(body).getByText('“Ring round the bath”')).toBeOnTheScreen();
    expect(within(body).getByTestId('tally')).toHaveTextContent(/^0 done, 1 not done, closes in 1[78]h$/);
    expect(within(body).getByRole('button', { name: DISPUTE_COPY.done })).not.toBeSelected();
    expect(within(body).getByRole('button', { name: DISPUTE_COPY.notDone })).not.toBeSelected();
  });

  it('counts your vote, puts itself away, and says where to change it', async () => {
    await show(disputed());
    const body = await openOn('Open a4');
    await fireEvent.press(within(body).getByRole('button', { name: DISPUTE_COPY.done }));
    expect(castVote).toHaveBeenCalledWith('d1', false);
    await waitFor(() => expect(screen.queryByTestId('john-sheet-body')).toBeNull());
    expect(screen.getByText(JOHN_SHEET_COPY.voted)).toBeOnTheScreen();
  });

  it('shows the vote you cast as chosen', async () => {
    await show(
      disputed([
        { user_id: 'megan', uphold: true },
        { user_id: 'priya', uphold: false },
      ]),
    );
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('tally')).toHaveTextContent(/^1 done, 1 not done/);
    expect(within(body).getByRole('button', { name: DISPUTE_COPY.done })).toBeSelected();
    expect(within(body).getByRole('button', { name: DISPUTE_COPY.notDone })).not.toBeSelected();
  });

  it('says a refusal, and stays open', async () => {
    (castVote as jest.Mock).mockRejectedValue(new Error('The vote has closed.'));
    await show(disputed());
    const body = await openOn('Open a4');
    await fireEvent.press(within(body).getByRole('button', { name: DISPUTE_COPY.notDone }));
    expect(await within(body).findByRole('alert')).toHaveTextContent('The vote has closed.');
    expect(screen.queryByText(JOHN_SHEET_COPY.voted)).toBeNull();
  });

  it('only tells the owner the house is voting', async () => {
    await show(
      house([binsOut({ done_at: at(-2) })], [...snapshot().members, MEGAN], [{ ...dispute(), assignment_id: 'a1' }]),
    );
    const body = await openOn('Open a1');
    expect(within(body).getByText(JOHN_SHEET_COPY.yourTick)).toBeOnTheScreen();
    expect(within(body).queryByRole('button', { name: DISPUTE_COPY.done })).toBeNull();
  });
});

describe('a settled John', () => {
  it('says it was done on time, in its header, with the photo receipt signed for it', async () => {
    await show(
      house([
        binsOut(),
        assignment({ id: 'a3', name: 'Wipe the hob', category: 'kitchen', due_at: at(-30), done_at: at(-40), outcome: 'done', photo_path: 'h1/a3.jpg' }),
      ]),
    );
    const body = await openOn('Open a3');
    expect(within(body).getByTestId('john-sheet-when')).toHaveTextContent(/^You did it on time, .+\.$/);
    const photo = await within(body).findByTestId('sheet-photo');
    expect(photo.props.source).toEqual({ uri: 'https://photos.test/a3.jpg' });
    expect(signPhoto).toHaveBeenCalledWith('h1/a3.jpg');
    // Only an admin's Change result, which every John has.
    expect(notChangeResult(body)).toEqual([]);
  });

  it.each([
    [{ done_at: at(-1), outcome: 'late' as const }, /^Sam did it late, .+\.$/],
    [{ excused: true }, /^Sam used a skip on it, so there’s no forfeit\.$/],
    [{ due_at: at(-30), outcome: 'missed' as const }, /^It was missed\.$/],
  ])('says what happened, in place of what lateness would cost: %o', async (how, words) => {
    await show(house([binsOut(), samsBath(how)]));
    const body = await openOn('Open a4');
    expect(within(body).getByTestId('john-sheet-when')).toHaveTextContent(words);
    expect(within(body).queryByTestId('sheet-photo')).toBeNull();
    expect(signPhoto).not.toHaveBeenCalled();
  });
});

describe('an open flag', () => {
  const flag = { john_id: 'j-bins', flagged_at: at(-1), due_at: at(11) };

  it('lets whoever raised it take it down, and closes', async () => {
    (removeFlag as jest.Mock).mockResolvedValue(undefined);
    await show(house([binsOut(), samsBath({ ...flag, flagged_by: 'priya' })], priyaWith({ role: 'member' })));
    const body = within(await openOn('Open a4'));
    expect(body.getByText(ON_CALL_COPY.removeBody('Sam'))).toBeOnTheScreen();
    await fireEvent.press(body.getByTestId('remove-flag'));
    await waitFor(() => expect(removeFlag).toHaveBeenCalledWith('a4'));
    await waitFor(() => expect(screen.queryByTestId('john-sheet-body')).toBeNull());
  });

  it('tells whoever has a housemate’s flag who can take it down, with no way to do it themselves', async () => {
    await show(house([binsOut({ ...flag, flagged_by: 'sam' })], priyaWith({ role: 'member' })));
    const body = within(await openOn('Open a1'));
    expect(body.getByText(ON_CALL_COPY.onlyRaiser('Sam'))).toBeOnTheScreen();
    expect(body.queryByTestId('remove-flag')).toBeNull();
  });

  it('lets an admin take down anyone’s flag', async () => {
    await show(house([binsOut(), samsBath({ ...flag, flagged_by: 'sam' })]));
    const body = within(await openOn('Open a4'));
    expect(body.getByTestId('remove-flag')).toBeOnTheScreen();
  });

  it('offers nothing once the flag is ticked', async () => {
    await show(house([binsOut(), samsBath({ ...flag, flagged_by: 'priya', done_at: at(-0.5) })], priyaWith({ role: 'member' })));
    const body = within(await openOn('Open a4'));
    expect(body.queryByTestId('remove-flag')).toBeNull();
  });
});

it('puts itself away', async () => {
  await show();
  await openOn('Open a1');
  await fireEvent.press(screen.getByRole('button', { name: 'Put it away' }));
  expect(screen.queryByTestId('john-sheet-body')).toBeNull();
});

it('opens on nothing for a John the board does not have', async () => {
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: 'Open gone' }));
  expect(screen.queryByTestId('john-sheet-body')).toBeNull();
});

it('follows the John live, and closes when it goes (a re-deal)', async () => {
  const client = await show();
  await openOn('Open a1');
  expect(screen.getByRole('header', { name: 'Bins out' })).toBeOnTheScreen();

  // Ticked underneath the open sheet, from another phone: it follows.
  (loadHouse as jest.Mock).mockResolvedValue(house([binsOut({ done_at: at(0) })]));
  await act(() => client.invalidateQueries({ queryKey: houseKey('h1') }));
  expect(await screen.findByTestId('ticked-line')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: JOHN_COPY.markDone })).toBeNull();

  // Re-dealt: the John is gone, and so is the sheet.
  (loadHouse as jest.Mock).mockResolvedValue(house([binsOut({ id: 'a9' })]));
  await act(() => client.invalidateQueries({ queryKey: houseKey('h1') }));
  await waitFor(() => expect(screen.queryByTestId('john-sheet-body')).toBeNull());
  // And it stays shut when that id comes back.
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  await act(() => client.invalidateQueries({ queryKey: houseKey('h1') }));
  expect(screen.queryByTestId('john-sheet-body')).toBeNull();
});

it('needs the provider above it', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(render(<Opener />)).rejects.toThrow(/JohnSheetProvider/);
});
