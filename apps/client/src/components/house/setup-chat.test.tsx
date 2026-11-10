import { ASK_CHATS_COPY, ASK_USAGE_COPY, type AskUsage, HOUSE_DRAFT_COPY, RESET_COPY, STEADY_COPY, type ChatReset, listAsDraft, NEW_JOHN, starterDraft, tidyDraft, type HouseRules, type JohnDef } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { keepChat } from '@/api/ask-chats';
import { applyDraft, askUsageOf, sendChat } from '@/api/draft';
import { undoAction } from '@/api/history';
import { applyReset } from '@/api/resets';
import { saveDealMode } from '@/api/settings';
import { testQueryClient } from '@/testing/query';

import { SetupChat } from './setup-chat';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/draft', () => ({
  applyDraft: jest.fn(),
  sendChat: jest.fn(),
  askUsageOf: jest.fn(async () => ({ left: 1, house: false, resetsAt: '2026-11-09T00:00:00.000Z', pass: true, people: 2, houseUsed: 0, mineUsed: 0, usedBy: [] })),
}));
jest.mock('@/api/ask-chats', () => ({ keepChat: jest.fn(async () => 'chat-1') }));
jest.mock('@/api/history', () => ({ undoAction: jest.fn() }));
jest.mock('@/api/resets', () => ({ applyReset: jest.fn() }));
jest.mock('@/api/away', () => ({ setAway: jest.fn(), cancelAway: jest.fn() }));
jest.mock('@/api/settings', () => ({ saveDealMode: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/operations', () => ({ runCardOperation: jest.fn() }));
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { dismissTo: jest.fn() } }));

const chat = sendChat as jest.Mock;
const keep = applyDraft as jest.Mock;
const ME = '00000000-0000-4000-8000-000000000001';
const RULES: HouseRules = {
  timezone: 'Europe/London',
  currency: 'GBP',
  weekStarts: 1,
  stakeMinor: 0,
  lateForfeitMinor: 0,
  missedForfeitMinor: 0,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: 'smart',
  dealBudget: 4,
};
const people = [{ userId: ME, name: 'Glyn Finck' }];
const drafted = tidyDraft(
  {
    groups: [{ name: 'Upstairs', members: ['me', 'Priya'] }],
    johns: [
      { name: 'Upstairs bathroom', category: 'bathroom', points: 4, everyWeeks: 1, dueDow: 6, dueTime: '18:00', group: 'Upstairs' },
      { name: 'Bins out', category: 'bins', points: 1, everyWeeks: 1, dueDow: 1, dueTime: '21:00', why: 'collection is Tuesday' },
    ],
    note: 'I guessed the bins go out Monday night.',
  },
  people,
  ME,
);
const HOUSE = 'Three of us, two bathrooms';

function House({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

async function open() {
  await render(<SetupChat houseId="h1" rules={RULES} johns={[]} groups={[]} people={people} me={ME} passOpen />, { wrapper: House });
}

async function say(text: string) {
  await fireEvent.changeText(screen.getByTestId('chat-input'), text);
  await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.send }));
}

beforeEach(() => {
  jest.clearAllMocks();
  chat.mockResolvedValue({ reply: 'Here’s a first go.', ask: null, draft: drafted, source: 'ai' });
  keep.mockResolvedValue(1);
});

it('greets with the starter lists, says where messages go, and waits for words before sending', async () => {
  await open();
  expect(screen.getByText(HOUSE_DRAFT_COPY.greeting)).toBeTruthy();
  expect(screen.getByText(HOUSE_DRAFT_COPY.privacy)).toBeTruthy();
  expect(screen.getByTestId('starter-family')).toBeTruthy();
  expect(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.send })).toBeDisabled();
  await fireEvent.changeText(screen.getByTestId('chat-input'), HOUSE);
  expect(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.send })).toBeEnabled();
});

it('shows the draft in the chat with every John kept, opens it into its groups, and adds only the ones still ticked', async () => {
  await open();
  await say(HOUSE);
  expect(chat).toHaveBeenCalledWith('h1', [{ role: 'user', text: HOUSE }], null);
  expect(await screen.findByText('Here’s a first go.')).toBeTruthy();
  expect(screen.getByTestId('chat-user')).toHaveTextContent(HOUSE);
  expect(screen.getByTestId('draft-note')).toHaveTextContent('I guessed the bins go out Monday night.');
  expect(screen.queryByTestId('starter-family')).toBeNull();

  for (const row of screen.getAllByRole('checkbox')) expect(row).toBeChecked();
  expect(screen.queryByTestId('draft-group')).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: /^Upstairs bathroom/ }));
  expect(screen.getByText(HOUSE_DRAFT_COPY.draftMeta(1, 1))).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.keep(1) }));
  expect(keep).toHaveBeenCalledWith('h1', RULES, null, drafted, ['add:1'], { johns: [], groups: [] }, expect.any(Date));
  expect(await screen.findByText(HOUSE_DRAFT_COPY.added(1))).toBeTruthy();
  expect(screen.queryByTestId('chat-input')).toBeNull();
  await fireEvent.press(screen.getByTestId('chat-open-list'));
  expect(router.dismissTo).toHaveBeenCalledWith('/house/johns');
});

it('asks once the list is in how the house shares Johns, Smart already chosen, and saves a change at a tap', async () => {
  const save = saveDealMode as jest.Mock;
  save.mockResolvedValue(undefined);
  await open();
  await say(HOUSE);
  await screen.findByText('Here’s a first go.');
  expect(screen.queryByTestId('chat-mode')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.keep(2) }));
  expect(await screen.findByText(STEADY_COPY.modeAsk)).toBeTruthy();
  expect(screen.getByTestId('chat-mode-smart')).toBeChecked();
  expect(screen.getByTestId('chat-mode-smart')).toHaveTextContent(STEADY_COPY.suggested, { exact: false });
  expect(screen.getByTestId('chat-mode-classic')).not.toBeChecked();
  await fireEvent.press(screen.getByTestId('chat-mode-smart'));
  expect(save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('chat-mode-classic'));
  expect(save).toHaveBeenCalledWith('h1', 'classic');
  expect(await screen.findByTestId('chat-mode-classic')).toBeChecked();
  expect(screen.getByTestId('chat-mode-smart')).not.toBeChecked();
});

it('puts the choice back and says why when saving it is refused', async () => {
  (saveDealMode as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
  await open();
  await fireEvent.press(screen.getByTestId('starter-family'));
  await fireEvent.press(screen.getByRole('button', { name: /^Add / }));
  await fireEvent.press(await screen.findByTestId('chat-mode-classic'));
  expect(await screen.findByText('Only the house admins can do that.')).toBeTruthy();
  expect(screen.getByTestId('chat-mode-smart')).toBeChecked();
});

it('sends the chat so far and the draft with each change, and keeps the draft when Jonz only talks', async () => {
  await open();
  await say(HOUSE);
  await screen.findByText('Here’s a first go.');
  chat.mockResolvedValue({ reply: 'That’s all of it.', ask: null, draft: null, source: 'ai' });
  await say('Is that all?');
  expect(chat).toHaveBeenLastCalledWith(
    'h1',
    [
      { role: 'user', text: HOUSE },
      { role: 'assistant', text: 'Here’s a first go.' },
      { role: 'user', text: 'Is that all?' },
    ],
    drafted,
  );
  expect(await screen.findByText('That’s all of it.')).toBeTruthy();
  expect(screen.getAllByTestId('draft-card')).toHaveLength(1);
});

it('shows what Jonz is doing while it thinks, then folds it over the answer to open', async () => {
  let reply: (value: unknown) => void = () => undefined;
  chat.mockReturnValue(new Promise((resolve) => (reply = resolve)));
  await open();
  await say(HOUSE);
  expect(screen.getByLabelText(HOUSE_DRAFT_COPY.thinking)).toBeTruthy();
  expect(screen.getByTestId('chat-thinking-step', { includeHiddenElements: true })).toHaveTextContent(HOUSE_DRAFT_COPY.thinkingSteps(false)[0]);
  await act(async () => reply({ reply: 'Here’s a first go.', ask: null, draft: drafted, source: 'ai' }));
  expect(screen.queryByTestId('chat-thinking')).toBeNull();
  expect(screen.queryByTestId('chat-thought-steps')).toBeNull();
  await fireEvent.press(screen.getByTestId('chat-thought'));
  expect(screen.getByTestId('chat-thought-steps')).toHaveTextContent(HOUSE_DRAFT_COPY.thinkingSteps(false)[0]);
});

it('says "your list" while it thinks once there is a draft, and a starter list has no fold', async () => {
  await open();
  await fireEvent.press(screen.getByTestId('starter-family'));
  expect(screen.queryByTestId('chat-thought')).toBeNull();
  chat.mockReturnValue(new Promise(() => undefined));
  await say('Add the oven');
  expect(HOUSE_DRAFT_COPY.thinkingSteps(true)[1]).toBe('Looking at your list');
  expect(screen.getByTestId('chat-thinking')).toBeTruthy();
});

it('answers a question with a tap: a quick answer, or a day', async () => {
  chat.mockResolvedValueOnce({ reply: 'Anything nobody gets round to?', ask: { kind: 'choices', options: ['Oven', 'Windows'] }, draft: null, source: 'ai' });
  await open();
  await say(HOUSE);
  await fireEvent.press(await screen.findByRole('button', { name: 'Windows' }));
  expect(chat).toHaveBeenLastCalledWith('h1', expect.arrayContaining([{ role: 'user', text: 'Windows' }]), null);

  chat.mockResolvedValueOnce({ reply: 'Which night are the bins?', ask: { kind: 'day' }, draft: null, source: 'ai' });
  await say('Bins too');
  await fireEvent.press(await screen.findByRole('radio', { name: 'Tuesday' }));
  expect(chat).toHaveBeenLastCalledWith('h1', expect.arrayContaining([{ role: 'user', text: 'Tuesday' }]), drafted);
});

it('starts from a list without asking anyone, and opens it to see every John', async () => {
  await open();
  await fireEvent.press(screen.getByTestId('starter-couple'));
  expect(chat).not.toHaveBeenCalled();
  expect(screen.getByText(HOUSE_DRAFT_COPY.fromStarter)).toBeTruthy();
  const all = starterDraft('couple').johns.length;
  expect(screen.getAllByRole('checkbox')).toHaveLength(Math.min(3, all));
  await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.seeAll(all) }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(all);
});

it("says why when the API refuses, and puts back what was written", async () => {
  chat.mockRejectedValue(new Error('That’s enough for one day.'));
  await open();
  await say('Five students, one kitchen');
  expect(await screen.findByRole('alert')).toHaveTextContent(/enough for one day/);
  expect(screen.getByTestId('chat-input').props.value).toBe('Five students, one kitchen');
  expect(screen.queryByTestId('chat-user')).toBeNull();
});

it('can’t add nothing', async () => {
  await open();
  await fireEvent.press(screen.getByTestId('starter-family'));
  await fireEvent.press(screen.getByTestId('draft-see-all'));
  for (const row of screen.getAllByRole('checkbox')) await fireEvent.press(row);
  expect(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.keep(0) })).toBeDisabled();
  expect(words('today.nextUp.describe')).toBe(HOUSE_DRAFT_COPY.title);
});

describe('with a list already', () => {
  const BATH = '11111111-1111-4111-8111-111111111111';
  const BINS = '22222222-2222-4222-8222-222222222222';
  const johns: JohnDef[] = [
    { ...NEW_JOHN, id: BATH, name: 'Bathroom', category: 'bathroom', points: 3 },
    { ...NEW_JOHN, id: BINS, name: 'Bins out', category: 'bins', points: 1 },
  ];
  const base = listAsDraft(johns, []);
  const changed = { ...base, johns: [{ ...base.johns[0], points: 4 }, starterDraft('couple').johns[0]] };

  async function openList(passOpen = true) {
    await render(<SetupChat houseId="h1" rules={RULES} johns={johns} groups={[]} people={people} me={ME} passOpen={passOpen} />, {
      wrapper: House,
    });
  }

  it('asks what to change, sends the list as the draft, and shows each change to tick', async () => {
    chat.mockResolvedValue({ reply: 'Done.', ask: null, draft: changed, source: 'ai' });
    await openList();
    expect(screen.getByText(HOUSE_DRAFT_COPY.greetingList)).toBeTruthy();
    expect(screen.queryByTestId('starter-family')).toBeNull();
    await say('Bathroom is more work, and no bins');
    expect(chat).toHaveBeenCalledWith('h1', [{ role: 'user', text: 'Bathroom is more work, and no bins' }], base);
    expect(await screen.findByTestId('draft-change')).toHaveTextContent(/3 → 4 pts/);
    // Sorted by what each does, taking off first so it's never missed.
    const headings = [HOUSE_DRAFT_COPY.removingHeading, HOUSE_DRAFT_COPY.changingHeading, HOUSE_DRAFT_COPY.addingHeading];
    expect(screen.getByTestId('draft-removes')).toHaveTextContent(new RegExp(`^${headings[0]}`));
    expect(screen.getByTestId('draft-changes')).toHaveTextContent(new RegExp(`^${headings[1]}`));
    expect(screen.getByTestId('draft-adds')).toHaveTextContent(new RegExp(`^${headings[2]}`));
    expect(screen.getByTestId('draft-remove')).toHaveTextContent(/Bins out/);
    expect(screen.getByText(HOUSE_DRAFT_COPY.changesMeta(4, 7))).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Bins out/ }));
    await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.apply(2) }));
    expect(keep).toHaveBeenCalledWith('h1', RULES, base, changed, [`change:${BATH}`, 'add:1'], { johns, groups: [] }, expect.any(Date));
    expect(await screen.findByText(HOUSE_DRAFT_COPY.applied(1))).toBeTruthy();
    // The house was asked how it shares Johns when it was new; House rules has it now.
    expect(screen.queryByTestId('chat-mode')).toBeNull();
    // The chat carries on, from the list as it now is.
    chat.mockResolvedValue({ reply: 'Anything else?', ask: null, draft: null, source: 'ai' });
    await say('And the oven?');
    expect(chat).toHaveBeenLastCalledWith('h1', expect.any(Array), null);
  });

  it('changes who’s in a group the house has, as a change to tick', async () => {
    const IVY = '00000000-0000-4000-8000-000000000009';
    const floor = { id: '44444444-4444-4444-8444-444444444444', name: 'Main floor', memberIds: [ME] };
    const withFloor = listAsDraft(johns, [floor]);
    const ivyIn = { ...withFloor, groups: [{ name: 'Main floor', memberIds: [ME, IVY], waitingFor: [] }] };
    chat.mockResolvedValue({ reply: 'Ivy’s in once you apply.', ask: null, draft: ivyIn, source: 'ai' });
    await render(
      <SetupChat houseId="h1" rules={RULES} johns={johns} groups={[floor]} people={[...people, { userId: IVY, name: 'Ivy Moss' }]} me={ME} passOpen />,
      { wrapper: House },
    );
    await say('Add Ivy to main floor');
    expect(await screen.findByTestId('draft-group-change')).toHaveTextContent(`Main floor${HOUSE_DRAFT_COPY.groupPeople('You', 'You and Ivy')}`);
    await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.apply(1) }));
    expect(keep).toHaveBeenCalledWith('h1', RULES, withFloor, ivyIn, ['group:Main floor'], { johns, groups: [floor] }, expect.any(Date));
  });

  it('puts time away Jonz offers on its own card, under its answer', async () => {
    chat.mockResolvedValue({ reply: 'Booked once you tap.', ask: null, draft: null, source: 'ai', moves: [{ kind: 'away', from: '2026-11-20', to: '2026-11-23' }] });
    await openList();
    await say('I’m away 20th to 23rd');
    expect(await screen.findByTestId('moves-card')).toBeTruthy();
    expect(screen.getByTestId('move-away')).toBeTruthy();
    // No list change, so no draft card.
    expect(screen.queryByTestId('draft-changes')).toBeNull();
  });

  it('answers someone who can’t change the list, with no starters and no card', async () => {
    chat.mockResolvedValue({ reply: 'Ben has bins this week.', ask: null, draft: null, source: 'ai' });
    await render(<SetupChat houseId="h1" rules={RULES} johns={johns} groups={[]} people={people} me={ME} passOpen canChange={false} />, {
      wrapper: House,
    });
    expect(screen.getByText(HOUSE_DRAFT_COPY.greetingAsk)).toBeTruthy();
    // Three questions to tap, so the chat never opens on nothing.
    expect(within(screen.getByTestId('chat-examples')).getAllByRole('button')).toHaveLength(3);
    await say('Who has bins?');
    expect(await screen.findByText('Ben has bins this week.')).toBeTruthy();
    expect(screen.queryByTestId('draft-card')).toBeNull();
  });

  it('sends a question tapped under the greeting as it is written, and the questions go once the chat has begun', async () => {
    chat.mockResolvedValue({ reply: 'Ben has bins this week.', ask: null, draft: null, source: 'ai' });
    await openList();
    await fireEvent.press(screen.getByRole('button', { name: HOUSE_DRAFT_COPY.examples[0] }));
    expect(chat).toHaveBeenCalledWith('h1', [{ role: 'user', text: HOUSE_DRAFT_COPY.examples[0] }], base);
    expect(await screen.findByText('Ben has bins this week.')).toBeTruthy();
    expect(screen.queryByTestId('chat-examples')).toBeNull();
  });

  it('offers the House Pass in place of the message box when the house hasn’t got it', async () => {
    await openList(false);
    // Nothing to tap that the house can't ask.
    expect(screen.queryByTestId('chat-examples')).toBeNull();
    expect(screen.getByText(HOUSE_DRAFT_COPY.passNeeded)).toBeTruthy();
    expect(screen.queryByTestId('chat-input')).toBeNull();
  });
});

describe('fixing mistakes', () => {
  const SAM = '00000000-0000-4000-8000-000000000002';
  const resets: ChatReset[] = [
    { kind: 'undo', action: 'tick-1', line: 'Sam ticked Bins', actor: SAM },
    {
      kind: 'reset',
      ask: { kind: 'week', week: '00000000-0000-4000-8000-0000000000aa' },
      preview: {
        kind: 'week',
        week: { id: 'w1', starts_on: '2026-10-26', starts_at: '2026-10-26T00:00:00Z', ends_at: '2026-11-02T00:00:00Z' },
        month: '2026-10',
        people: { [SAM]: { ticks: 2 } },
        told: [SAM],
        reopened: 2,
        past_due: 0,
        flags: 0,
        disputes: 0,
        correction: false,
        nothing: false,
      },
      words: {},
    },
  ];

  beforeEach(() => {
    chat.mockResolvedValue({ reply: 'Here’s what I’d put right.', ask: null, draft: null, source: 'ai', resets });
    (applyReset as jest.Mock).mockResolvedValue('reset-1');
    (undoAction as jest.Mock).mockResolvedValue(undefined);
  });

  async function offered() {
    const list = [{ ...NEW_JOHN, id: 'j1', name: 'Bins', category: 'bins' as const }] as JohnDef[];
    await render(
      <SetupChat houseId="h1" rules={RULES} johns={list} groups={[]} people={[...people, { userId: SAM, name: 'Sam Lee' }]} me={ME} passOpen />,
      { wrapper: House },
    );
    await say('Sam’s tick was a mistake, and reset the week');
    return screen.findByTestId('resets-card');
  }

  it('offers each fix ticked, with its numbers, under hazard tape, and changes nothing yet', async () => {
    await offered();
    expect(screen.getByRole('checkbox', { name: /^Undo: Sam ticked Bins/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Reset this week/ })).toBeChecked();
    expect(screen.getByTestId('resets-told')).toHaveTextContent('Sam gets a notification');
    expect(screen.getByRole('button', { name: RESET_COPY.applyN(2) })).toBeTruthy();
    expect(applyReset).not.toHaveBeenCalled();
    expect(undoAction).not.toHaveBeenCalled();
  });

  it('does only what is still ticked, then Undo takes the reset back', async () => {
    await offered();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Undo: Sam ticked Bins/ }));
    await fireEvent.press(screen.getByRole('button', { name: RESET_COPY.applyN(1) }));
    expect(await screen.findByText(RESET_COPY.appliedN(1))).toBeTruthy();
    expect(applyReset).toHaveBeenCalledWith({ houseId: 'h1', kind: 'week', week: '00000000-0000-4000-8000-0000000000aa' });
    expect(undoAction).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: RESET_COPY.undoAll }));
    expect(await screen.findByText(RESET_COPY.putBack)).toBeTruthy();
    expect(undoAction).toHaveBeenCalledWith('reset-1');
  });
});

describe("the week's Ask Jonz", () => {
  const usage = (over: Partial<AskUsage>): AskUsage => ({
    left: 1,
    house: false,
    resetsAt: '2026-11-09T00:00:00.000Z',
    pass: true,
    people: 3,
    houseUsed: 0,
    mineUsed: 0,
    usedBy: [],
    ...over,
  });

  it('says nothing while there is plenty left', async () => {
    (askUsageOf as jest.Mock).mockResolvedValue(usage({ left: 0.62 }));
    await open();
    await waitFor(() => expect(askUsageOf).toHaveBeenCalledWith('h1'));
    expect(screen.queryByTestId('chat-low')).toBeNull();
    expect(screen.getByTestId('chat-input')).toBeTruthy();
  });

  it('warns over the box once under a quarter is left, with when more comes', async () => {
    (askUsageOf as jest.Mock).mockResolvedValue(usage({ left: 0.18 }));
    await open();
    expect(await screen.findByTestId('chat-low')).toHaveTextContent(ASK_USAGE_COPY.low(0.18, false, 'Monday at 00:00'));
    expect(screen.getByTestId('chat-input')).toBeTruthy();
  });

  it('puts the notice in the box’s place once their half is used, without the Pass', async () => {
    (askUsageOf as jest.Mock).mockResolvedValue(usage({ left: 0, pass: false }));
    await open();
    expect(await screen.findByTestId('chat-out')).toHaveTextContent(ASK_USAGE_COPY.outMine, { exact: false });
    expect(screen.queryByTestId('chat-input')).toBeNull();
    expect(screen.queryByTestId('chat-out-pass')).toBeNull();
    expect(screen.getByTestId('chat-out-usage')).toBeTruthy();
  });

  it('offers the Pass when the whole house has used its week and has no Pass', async () => {
    (askUsageOf as jest.Mock).mockResolvedValue(usage({ left: 0, house: true, pass: false }));
    await open();
    expect(await screen.findByTestId('chat-out')).toHaveTextContent(ASK_USAGE_COPY.outHouse, { exact: false });
    expect(screen.getByTestId('chat-out-pass')).toBeTruthy();
  });

  it('turns the box into the notice when an answer uses the last of it', async () => {
    (askUsageOf as jest.Mock).mockResolvedValue(usage({ left: 0.5 }));
    chat.mockResolvedValue({ reply: 'Done.', ask: null, draft: null, source: 'ai', allowance: usage({ left: 0 }) });
    await open();
    await say(HOUSE);
    expect(await screen.findByTestId('chat-out')).toBeTruthy();
  });
});

describe('kept chats', () => {
  const kept = keepChat as jest.Mock;

  it('keeps the chat after each answer: a new one first, then the same one, with no card kept', async () => {
    await open();
    await say(HOUSE);
    await waitFor(() => expect(kept).toHaveBeenCalledTimes(1));
    expect(kept).toHaveBeenCalledWith('h1', null, [
      { role: 'user', text: HOUSE },
      { role: 'assistant', text: 'Here’s a first go.', ask: null, hadCard: true },
    ]);
    chat.mockResolvedValueOnce({ reply: 'Bins are Monday.', ask: null, draft: null, source: 'ai' });
    await say('When are the bins?');
    await waitFor(() => expect(kept).toHaveBeenCalledTimes(2));
    expect(kept.mock.calls[1][1]).toBe('chat-1');
    expect(kept.mock.calls[1][2].at(-1)).toEqual({ role: 'assistant', text: 'Bins are Monday.', ask: null, hadCard: false });
  });

  it('carries on with a kept chat: its words come back, a card says to ask again, and Jonz is sent what was said', async () => {
    const johns: JohnDef[] = [{ ...NEW_JOHN, id: 'j1', name: 'Bins out', category: 'bins' } as JohnDef];
    await render(
      <SetupChat
        houseId="h1"
        rules={RULES}
        johns={johns}
        groups={[]}
        people={people}
        me={ME}
        passOpen
        saved={{
          id: 'chat-9',
          title: 'Bins weekly',
          turns: [
            { role: 'user', text: 'Bins weekly' },
            { role: 'assistant', text: 'Here’s the change.', ask: null, hadCard: true },
          ],
        }}
      />,
      { wrapper: House },
    );
    expect(screen.getByText('Bins weekly')).toBeTruthy();
    expect(screen.getByTestId('chat-old-card')).toHaveTextContent(ASK_CHATS_COPY.oldCard);
    expect(screen.queryByTestId('draft-card')).toBeNull();
    chat.mockResolvedValueOnce({ reply: 'Done that.', ask: null, draft: null, source: 'ai' });
    await say('Thanks');
    expect(chat.mock.calls[0][1]).toEqual([
      { role: 'user', text: 'Bins weekly' },
      { role: 'assistant', text: 'Here’s the change.' },
      { role: 'user', text: 'Thanks' },
    ]);
    await waitFor(() => expect(kept).toHaveBeenCalled());
    expect(kept.mock.calls[0][1]).toBe('chat-9');
  });

  it('keeps nothing when only a starter list was tapped', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('starter-family'));
    await fireEvent.press(screen.getByTestId('describe-keep'));
    await screen.findByTestId('chat-done');
    expect(kept).not.toHaveBeenCalled();
  });

  it('says when there is something in the chat, so New chat has something to clear', async () => {
    const talked = jest.fn();
    await render(<SetupChat houseId="h1" rules={RULES} johns={[]} groups={[]} people={people} me={ME} passOpen onTalked={talked} />, {
      wrapper: House,
    });
    expect(talked).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'Two bathrooms');
    expect(talked).toHaveBeenLastCalledWith(true);
    await fireEvent.changeText(screen.getByTestId('chat-input'), '  ');
    expect(talked).toHaveBeenLastCalledWith(false);
  });
});
