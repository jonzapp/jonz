import {
  BIN_NIGHT,
  CATEGORY_LABEL,
  DEAL_COPY,
  KIDS_COPY,
  FOCUS_SHELL_COPY,
  HOUSE_LOWER_COPY,
  JOHN_LIST_COPY,
  NEW_JOHN,
  PAGE_TITLE,
  REPEAT_COPY,
  SECTION_LABEL,
  SETUP_COPY,
  STEADY_COPY,
  wordsFor,
} from '@app/core';
import { router, Slot } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useContext } from 'react';
import { Text, useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { archiveJohn, dealThisWeek, loadJohnList, saveJohn } from '@/api/settings';
import JohnListScreen from '@/app/(house)/house/johns';
import { HouseWorkspace } from '@/components/house/workspace';
import { ToastProvider } from '@/components/toast';
import { AskPanelContext, AskPanelProvider } from '@/hooks/use-ask-jonz';
import { assignment, snapshot } from '@/testing/house';
import { BATH, BINS, renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({
  loadJohnList: jest.fn(),
  saveJohn: jest.fn(),
  archiveJohn: jest.fn(),
  dealThisWeek: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const mockMembership = { userId: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMembership.userId } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 412, height: 915, scale: 1, fontScale: 1 })),
}));

const UPSTAIRS = { id: 'g1', name: 'Upstairs bathroom', memberIds: ['priya', 'sam'] };

/** The chat with Jonz beside the page, as the house layout's sparkles open it: here, a line saying whether it's open. */
function AskToggle() {
  const ask = useContext(AskPanelContext);
  return (
    <Text accessibilityRole="button" onPress={() => ask?.setOpen(!ask.open)} testID="ask-toggle">
      {ask?.open ? 'ask open' : 'ask closed'}
    </Text>
  );
}

/** The house's toasts and the chat with Jonz, as its layout mounts them, and House's workspace, as its stack's does. */
function HouseLayout() {
  return (
    <ToastProvider>
      <AskPanelProvider>
        <AskToggle />
        <HouseWorkspace>
          <Slot />
        </HouseWorkspace>
      </AskPanelProvider>
    </ToastProvider>
  );
}

async function open(as: 'priya' | 'sam' = 'priya') {
  mockMembership.userId = as;
  await renderPages({ 'house/_layout': HouseLayout, 'house/johns': JohnListScreen }, '/house/johns');
  await untilRead();
}

/** A setting in the John sheet, opened: its row is named "Kind, Kitchen". */
async function pick(form: ReturnType<typeof within>, setting: string, choice: string) {
  await fireEvent.press(form.getByRole('button', { name: new RegExp(`^${setting}, `) }));
  await fireEvent.press(form.getByRole('radio', { name: choice }));
}

/** A word in the timing sentence, opened: its choices take the form's place until Done. */
async function word(form: ReturnType<typeof within>, what: string, label: string) {
  await fireEvent.press(form.getByRole('button', { name: REPEAT_COPY.word(what, label) }));
}

/** The timing sentence, as it reads: its words are laid out apart, so joined here with spaces. */
const sentence = () =>
  within(screen.getByTestId('john-sentence'))
    .getAllByText(/./)
    .map((t) => t.props.children)
    .join(' ');

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [BINS, BATH], groups: [] });
  for (const move of [saveJohn, archiveJohn, dealThisWeek]) (move as jest.Mock).mockResolvedValue(undefined);
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: PAGE_TITLE.johnList })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) })).toBeOnTheScreen();
});

it('groups the Johns by kind, each with when, what sets it apart and its points', async () => {
  await open();
  // Kinds in the house's order, each counted.
  expect(within(screen.getByTestId('kind-bathroom')).getByRole('header', { name: 'Bathroom' })).toBeOnTheScreen();
  expect(screen.getByTestId('kind-bathroom')).toHaveTextContent(/^Bathroom1/);
  expect(within(screen.getByTestId('kind-bins')).getByRole('header', { name: 'Bins & recycling' })).toBeOnTheScreen();
  const [bath, bins] = screen.getAllByTestId('john-def');
  expect(bath).toHaveTextContent(/Bathroom.*Sun 21:00, every 2 weeks, photo.*4 pts/);
  expect(bins).toHaveTextContent(/Bins.*Thu 07:00.*1 pt/);
  // Every week is the usual, so a row doesn't say it.
  expect(bins).not.toHaveTextContent(/Every week/i);
  // Over the list on a phone: what it adds up to, then Add a John.
  const bar = within(screen.getByTestId('john-list-bar'));
  expect(bar.getByText(`${JOHN_LIST_COPY.count(2)} ${JOHN_LIST_COPY.perWeek(3)}`)).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: JOHN_LIST_COPY.add })).toBeOnTheScreen();
});

it('says which group shares a John', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [{ ...BATH, groupId: 'g1' }], groups: [UPSTAIRS] });
  await open();
  expect(screen.getByTestId('john-def')).toHaveTextContent(/photo, Upstairs bathroom/);
});

it('starts an empty house off with the Johns that cause arguments', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  await open();
  expect(screen.getByText(SETUP_COPY.noJohns)).toBeOnTheScreen();
  expect(screen.getByText(SETUP_COPY.noJohnsBody)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: JOHN_LIST_COPY.add })).toBeOnTheScreen();
  // Nothing to hand out yet.
  expect(screen.queryByTestId('deal-week')).toBeNull();
});

it('tells a housemate who will add the Johns to an empty list, not how to', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  await open('sam');
  expect(screen.getByText(SETUP_COPY.noJohns)).toBeOnTheScreen();
  expect(screen.getByText(SETUP_COPY.johnsComing('Priya'))).toBeOnTheScreen();
  expect(screen.queryByText(SETUP_COPY.noJohnsBody)).toBeNull();
  expect(screen.queryByRole('button', { name: JOHN_LIST_COPY.add })).toBeNull();
});

it('reads the list again on the way back to it', async () => {
  mockMembership.userId = 'priya';
  await renderPages(
    { 'house/_layout': HouseLayout, 'house/johns': JohnListScreen, 'house/index': () => <Text>House</Text> },
    '/house/johns',
  );
  await screen.findAllByTestId('john-def');
  expect(loadJohnList).toHaveBeenCalledTimes(1);
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [BINS], groups: [] });
  await act(() => router.navigate('/house'));
  await act(() => router.navigate('/house/johns'));
  await waitFor(() => expect(screen.getAllByTestId('john-def')).toHaveLength(1));
});

describe('an admin', () => {
  it('adds a John from the foot of the list', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    expect(screen.getByRole('header', { name: JOHN_LIST_COPY.add })).toBeOnTheScreen();
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Shower');
    await pick(form, JOHN_LIST_COPY.kind, 'Bathroom');
    await pick(form, JOHN_LIST_COPY.effort, '5 pts');
    // When it comes round reads as a sentence, each word opening its own choices.
    expect(sentence()).toBe('Every week on Sunday by 21:00');
    await word(form, REPEAT_COPY.often, 'week');
    expect(screen.getByTestId('picker-often')).toBeOnTheScreen();
    expect(screen.queryByTestId('john-name')).toBeNull();
    await fireEvent.press(form.getByRole('radio', { name: 'Every 2 weeks' }));
    await fireEvent.press(form.getByTestId('timing-done'));
    await word(form, REPEAT_COPY.day, 'Sunday');
    await fireEvent.press(within(form.getByTestId('timing-days')).getByRole('radio', { name: 'Monday' }));
    await fireEvent.press(form.getByTestId('timing-done'));
    await word(form, REPEAT_COPY.time, '21:00');
    await fireEvent.changeText(form.getByTestId('john-time'), '18:30');
    await fireEvent.press(form.getByTestId('timing-done'));
    expect(sentence()).toBe('Every 2 weeks on Monday by 18:30');
    expect(form.getByTestId('john-next')).toHaveTextContent(/^Next: /);
    const photo = form.getByRole('checkbox', { name: `${JOHN_LIST_COPY.photo}, ${SETUP_COPY.photoMeta}` });
    expect(photo).not.toBeChecked();
    await fireEvent.press(photo);
    expect(photo).toBeChecked();
    await fireEvent.press(form.getByTestId('save-john'));

    expect(saveJohn).toHaveBeenCalledWith(
      'h1',
      snapshot().rules,
      {
        ...NEW_JOHN,
        name: 'Shower',
        category: 'bathroom',
        points: 5,
        dueDow: 1,
        everyWeeks: 2,
        dueTime: '18:30',
        needsPhoto: true,
      },
      expect.any(Date),
    );
    await waitFor(() => expect(screen.queryByRole('header', { name: JOHN_LIST_COPY.add })).toBeNull());
    // The list is read again with the change.
    expect(loadJohnList).toHaveBeenCalledTimes(2);
  });

  it('sets a John to come round every few months, on a weekday of the month', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Fridge deep clean');
    await pick(form, JOHN_LIST_COPY.effort, '8 pts');
    await word(form, REPEAT_COPY.often, 'week');
    await fireEvent.press(form.getByRole('radio', { name: 'Every 3 months' }));
    // Into months, it lands on the first of its day.
    expect(within(form.getByTestId('timing-unit')).getByRole('radio', { name: REPEAT_COPY.units.months })).toBeChecked();
    await fireEvent.press(form.getByTestId('timing-done'));
    expect(sentence()).toMatch(/^Every 3 months from \w+ on the first Sunday by 21:00$/);
    await word(form, REPEAT_COPY.which('Sunday'), 'first');
    // Each choice says when it would land.
    expect(form.getByRole('radio', { name: /^Last/ })).toBeOnTheScreen();
    await fireEvent.press(form.getByRole('radio', { name: /^Last/ }));
    await fireEvent.press(form.getByTestId('timing-done'));
    await word(form, REPEAT_COPY.day, 'Sunday');
    await fireEvent.press(within(form.getByTestId('timing-days')).getByRole('radio', { name: 'Saturday' }));
    await fireEvent.press(form.getByTestId('timing-done'));
    expect(sentence()).toMatch(/^Every 3 months from \w+ on the last Saturday by 21:00$/);
    // It starts in the first of the next three months it can, unless told another.
    await fireEvent.press(form.getByRole('button', { name: new RegExp(`^${REPEAT_COPY.startsIn}: `) }));
    const months = within(form.getByTestId('picker-from')).getAllByRole('radio');
    expect(months).toHaveLength(3);
    expect(months[0]).toBeChecked();
    await fireEvent.press(months[1]);
    expect(within(form.getByTestId('picker-from')).getAllByRole('radio')[1]).toBeChecked();
    await fireEvent.press(form.getByTestId('timing-done'));
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith(
      'h1',
      snapshot().rules,
      { ...NEW_JOHN, name: 'Fridge deep clean', points: 8, everyWeeks: 1, everyMonths: 3, weekOfMonth: 5, dueDow: 6, anchorMonth: expect.any(Number) },
      expect.any(Date),
    );
  });

  it('takes any period, up to years', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await word(form, REPEAT_COPY.often, 'week');
    await fireEvent.press(form.getByRole('button', { name: `${REPEAT_COPY.more}: ${REPEAT_COPY.often}` }));
    expect(form.getByTestId('stepper-value')).toHaveTextContent('2');
    await fireEvent.press(within(form.getByTestId('timing-unit')).getByRole('radio', { name: REPEAT_COPY.units.years }));
    await fireEvent.press(form.getByTestId('timing-done'));
    // A John that comes round in years starts in a month, rather than from one.
    expect(sentence()).toMatch(/^Every 2 years in \w+ on the first Sunday by 21:00$/);
    await fireEvent.changeText(form.getByTestId('john-name'), 'Gutters');
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith(
      'h1',
      snapshot().rules,
      { ...NEW_JOHN, name: 'Gutters', everyMonths: 24, weekOfMonth: 1 },
      expect.any(Date),
    );
  });

  it('makes a John one done together, saying what its points add up to', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    expect(form.getByRole('button', { name: `${words('john.crew.doneBy')}, ${words('john.crew.choice', { crew: 1 })}` })).toBeOnTheScreen();
    expect(form.queryByTestId('crew-note')).toBeNull();
    await fireEvent.changeText(form.getByTestId('john-name'), 'Garden tidy');
    await pick(form, JOHN_LIST_COPY.effort, '4 pts');
    await pick(form, words('john.crew.doneBy'), words('john.crew.choice', { crew: 3 }));
    expect(form.getByTestId('crew-note')).toHaveTextContent(`4 pts each, so 12 pts in all. ${words('john.crew.hint')}`);
    await pick(form, words('john.crew.doneBy'), words('john.crew.choice', { crew: 0 }));
    expect(form.getByTestId('crew-note')).toHaveTextContent(`4 pts each, for everyone at home that day. ${words('john.crew.hint')}`);
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith(
      'h1',
      snapshot().rules,
      { ...NEW_JOHN, name: 'Garden tidy', points: 4, crew: 0 },
      expect.any(Date),
    );
  });

  it('keeps a John to its own day, like bins night, and says so on the list', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Bins');
    const keep = form.getByRole('checkbox', { name: `${STEADY_COPY.keepDay}, ${STEADY_COPY.keepDayMeta}` });
    expect(keep).not.toBeChecked();
    await fireEvent.press(keep);
    expect(keep).toBeChecked();
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith('h1', snapshot().rules, { ...NEW_JOHN, name: 'Bins', keepDay: true }, expect.any(Date));
    // On call has no day to keep.
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    await fireEvent.press(within(screen.getByTestId('john-timing')).getByRole('radio', { name: JOHN_LIST_COPY.onCall }));
    expect(screen.queryByTestId('john-keep-day')).toBeNull();
  });

  it('switches a John to on call, with how often it comes up and how long whoever has it gets', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Kitchen bin');
    await fireEvent.press(within(form.getByTestId('john-timing')).getByRole('radio', { name: JOHN_LIST_COPY.onCall }));
    expect(sentence()).toBe('On call, up to 2 times a week, done within 12 hours');
    expect(form.getByTestId('on-call-note')).toBeOnTheScreen();
    // Whoever is on call does it: on call is never done together.
    expect(form.queryByRole('button', { name: new RegExp(`^${words('john.crew.doneBy')}, `) })).toBeNull();
    expect(form.queryByTestId('john-next')).toBeNull();
    await word(form, REPEAT_COPY.timesAWeek, REPEAT_COPY.times(2));
    await fireEvent.press(form.getByRole('button', { name: `${REPEAT_COPY.more}: ${REPEAT_COPY.timesAWeek}` }));
    await fireEvent.press(form.getByTestId('timing-done'));
    await word(form, REPEAT_COPY.within, JOHN_LIST_COPY.respondHours(12));
    await fireEvent.press(form.getByRole('radio', { name: JOHN_LIST_COPY.respondHours(4) }));
    await fireEvent.press(form.getByTestId('timing-done'));
    expect(sentence()).toBe('On call, up to 3 times a week, done within 4 hours');
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith(
      'h1',
      snapshot().rules,
      { ...NEW_JOHN, name: 'Kitchen bin', when: 'on_call', perWeek: 3, respondHours: 4 },
      expect.any(Date),
    );
  });

  it('adds the first John from the empty list', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    expect(screen.getByTestId('john-form')).toBeOnTheScreen();
  });

  it('keeps the sheet open, saying why, when the save is refused', async () => {
    (saveJohn as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    await fireEvent.changeText(screen.getByTestId('john-name'), 'Hob');
    await fireEvent.press(screen.getByTestId('save-john'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the house admins can do that.');
    expect(screen.getByRole('header', { name: JOHN_LIST_COPY.add })).toBeOnTheScreen();
  });

  it("won't save a John without a name", async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    expect(screen.getByTestId('save-john')).toBeDisabled();
  });

  it('opens a John to edit it, or to take it off the list', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Edit Bins, Thu 07:00, 1 pt$/ }));
    const form = within(screen.getByTestId('john-form'));
    expect(form.getByTestId('john-name')).toHaveDisplayValue('Bins');
    expect(form.getByRole('button', { name: `${JOHN_LIST_COPY.kind}, Bins & recycling` })).toBeOnTheScreen();
    expect(sentence()).toBe('Every week on Thursday by 07:00');
    // An open word ticks what it's set to.
    await word(form, REPEAT_COPY.day, 'Thursday');
    expect(within(form.getByTestId('timing-days')).getByRole('radio', { name: 'Thursday' })).toBeChecked();
    await fireEvent.press(form.getByTestId('timing-done'));
    await fireEvent.press(form.getByRole('button', { name: JOHN_LIST_COPY.remove }));
    expect(archiveJohn).toHaveBeenCalledWith('h1', 'j1', expect.any(Date));
  });

  it('offers a group as who shares a John, and says what that means once one is picked', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [UPSTAIRS] });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    // Everyone shares it to begin with, which needs no explaining.
    expect(form.queryByTestId('sharing-note')).toBeNull();
    await fireEvent.changeText(form.getByTestId('john-name'), 'Bath');
    await pick(form, JOHN_LIST_COPY.sharedBy, 'Upstairs bathroom');
    expect(form.getByTestId('sharing-note')).toHaveTextContent(JOHN_LIST_COPY.groupOnly);
    await fireEvent.press(form.getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith('h1', snapshot().rules, { ...NEW_JOHN, name: 'Bath', groupId: 'g1' }, expect.any(Date));
  });

  it('says how to share a John with fewer when the house has no groups', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    expect(within(screen.getByTestId('john-form')).getByTestId('sharing-note')).toHaveTextContent(JOHN_LIST_COPY.noGroups);
  });

  it('shows the kinds by name alone, with no lid colours to pick from', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.press(form.getByRole('button', { name: new RegExp(`^${JOHN_LIST_COPY.kind}, `) }));
    const kinds = form.getAllByRole('radio').filter((r) => Object.values(CATEGORY_LABEL).includes(r.props.accessibilityLabel));
    expect(kinds).toHaveLength(6);
    expect(form.queryAllByTestId('lid-bar', { includeHiddenElements: true })).toHaveLength(0);
  });
});

describe('a parent, in a family', () => {
  it('says what a John earns a kid, and lists it', async () => {
    const base = snapshot();
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...base.house, kind: 'family', pocketCapMinor: 1000 } }));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Feed the fish');
    await fireEvent.changeText(form.getByTestId('john-pay'), '0.20');
    await fireEvent.press(form.getByTestId('save-john'));
    await waitFor(() =>
      expect(saveJohn).toHaveBeenCalledWith('h1', expect.anything(), expect.objectContaining({ name: 'Feed the fish', payMinor: 20 }), expect.any(Date)),
    );
  });

  it('is not asked of housemates', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    expect(screen.queryByTestId('john-pay')).toBeNull();
    expect(screen.queryByTestId('john-min-age')).toBeNull();
  });

  it('says how old a kid has to be for it, or leaves it for anyone', async () => {
    const base = snapshot();
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...base.house, kind: 'family', pocketCapMinor: 1000 } }));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: JOHN_LIST_COPY.add }));
    const form = within(screen.getByTestId('john-form'));
    await fireEvent.changeText(form.getByTestId('john-name'), 'Use the oven');
    await fireEvent.changeText(form.getByTestId('john-min-age'), '30');
    await fireEvent.press(form.getByTestId('save-john'));
    expect(form.getByText(KIDS_COPY.problems.minAge)).toBeOnTheScreen();
    expect(saveJohn).not.toHaveBeenCalled();
    await fireEvent.changeText(form.getByTestId('john-min-age'), '10');
    await fireEvent.press(form.getByTestId('save-john'));
    await waitFor(() =>
      expect(saveJohn).toHaveBeenCalledWith('h1', expect.anything(), expect.objectContaining({ name: 'Use the oven', minAge: 10 }), expect.any(Date)),
    );
  });
});

describe('the deal', () => {
  /** This week dealt, and nothing in it ticked yet. */
  const unticked = () => snapshot({ assignments: [assignment(), assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath' })] });

  it('re-deals a week nobody has ticked in, once asked whether to', async () => {
    (loadHouse as jest.Mock).mockResolvedValue(unticked());
    await open();
    const deal = within(screen.getByTestId('deal'));
    expect(deal.getByText(DEAL_COPY.againBody)).toBeOnTheScreen();
    await fireEvent.press(deal.getByRole('button', { name: DEAL_COPY.again }));
    expect(dealThisWeek).not.toHaveBeenCalled();
    const confirm = within(screen.getByTestId('redeal-confirm'));
    expect(confirm.getByRole('header', { name: SETUP_COPY.redealTitle })).toBeOnTheScreen();
    await fireEvent.press(confirm.getByTestId('confirm'));
    expect(dealThisWeek).toHaveBeenCalledWith('h1');
    expect(await within(screen.getByTestId('toast')).findByText(SETUP_COPY.redealt)).toBeOnTheScreen();
  });

  it('keeps the confirm open, saying why, when the re-deal is refused', async () => {
    (loadHouse as jest.Mock).mockResolvedValue(unticked());
    (dealThisWeek as jest.Mock).mockRejectedValue(new Error("Someone’s already ticked a John this week, so it can’t be re-dealt."));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: DEAL_COPY.again }));
    await fireEvent.press(screen.getByTestId('confirm'));
    expect(await within(screen.getByTestId('redeal-confirm')).findByRole('alert')).toHaveTextContent(/can’t be re-dealt/);
  });

  it('offers no re-deal once something this week is ticked', async () => {
    await open();
    expect(screen.queryByTestId('deal')).toBeNull();
    expect(screen.queryByRole('button', { name: DEAL_COPY.again })).toBeNull();
  });

  it("hands out the first week, and says when it can't", async () => {
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...snapshot().house, everDealt: false } }));
    (dealThisWeek as jest.Mock).mockRejectedValue(new Error("Someone’s already ticked a John this week, so it can’t be re-dealt."));
    await open();
    expect(screen.getByText(DEAL_COPY.firstBody)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: words('today.nextUp.dealWeek1') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can’t be re-dealt/);
  });
});

describe('a housemate who is not an admin', () => {
  it('reads the list, but has nothing to change', async () => {
    await open('sam');
    expect(screen.getAllByTestId('john-def')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: JOHN_LIST_COPY.add })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByTestId('deal')).toBeNull();
  });

  it('opens a John to read what it is, with nothing to edit', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [{ ...BATH, groupId: 'g1' }], groups: [UPSTAIRS] });
    await open('sam');
    await fireEvent.press(screen.getByRole('button', { name: /^Bathroom/ }));
    const sheet = within(screen.getByTestId('john-facts'));
    expect(sheet.getByRole('header', { name: 'Bathroom' })).toBeOnTheScreen();
    const facts = sheet.getAllByTestId('john-fact');
    [
      [SETUP_COPY.kindLabel, 'Bathroom'],
      [JOHN_LIST_COPY.sharedBy, 'Upstairs bathroom'],
      [JOHN_LIST_COPY.effort, '4 pts'],
      [JOHN_LIST_COPY.often, 'Every 2 weeks'],
      [JOHN_LIST_COPY.due, 'Sunday 21:00'],
      [SETUP_COPY.photoLabel, SETUP_COPY.photoNeeded],
    ].forEach(([label, value], i) => expect(facts[i]).toHaveTextContent(`${label}${value}`));
    expect(screen.queryByTestId('john-form')).toBeNull();
    expect(screen.queryByTestId('save-john')).toBeNull();
  });
});

describe('on a laptop', () => {
  beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 }));
  afterEach(() => (useWindowDimensions as jest.Mock).mockReturnValue({ width: 412, height: 915, scale: 1, fontScale: 1 }));

  it('opens a John in the panel beside the list, and the next John in its place', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Edit Bins, / }));
    const panel = within(screen.getByTestId('john-panel'));
    expect(panel.getByRole('header', { name: JOHN_LIST_COPY.edit('Bins') })).toBeOnTheScreen();
    expect(panel.getByTestId('john-name')).toHaveDisplayValue('Bins');
    // The list stays in view, and the next John is a click away.
    await fireEvent.press(screen.getByRole('button', { name: /^Edit Bathroom, / }));
    expect(within(screen.getByTestId('john-panel')).getByTestId('john-name')).toHaveDisplayValue('Bathroom');
    expect(screen.getAllByTestId('john-form')).toHaveLength(1);
  });

  it('closes the panel once the John is saved, and from its close button', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: /^Edit Bins, / }));
    await fireEvent.press(within(screen.getByTestId('john-panel')).getByTestId('save-john'));
    expect(saveJohn).toHaveBeenCalledWith('h1', expect.anything(), expect.objectContaining({ id: 'j1' }), expect.any(Date));
    await waitFor(() => expect(screen.queryByTestId('john-panel')).toBeNull());
    await fireEvent.press(screen.getByTestId('add-john'));
    expect(within(screen.getByTestId('john-panel')).getByRole('header', { name: JOHN_LIST_COPY.add })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: HOUSE_LOWER_COPY.closePanel }));
    expect(screen.queryByTestId('john-panel')).toBeNull();
  });

  it('keeps one panel down the right: a John closes the chat with Jonz, and the chat closes the John', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('ask-toggle'));
    expect(screen.getByTestId('ask-toggle')).toHaveTextContent('ask open');
    await fireEvent.press(screen.getByRole('button', { name: /^Edit Bins, / }));
    expect(screen.getByTestId('john-panel')).toBeOnTheScreen();
    expect(screen.getByTestId('ask-toggle')).toHaveTextContent('ask closed');
    await fireEvent.press(screen.getByTestId('ask-toggle'));
    expect(screen.queryByTestId('john-panel')).toBeNull();
  });

  it('puts Add a John over the list with how many Johns and the week’s points, in amber once the house is dealt', async () => {
    await open();
    const bar = within(screen.getByTestId('john-list-bar'));
    expect(bar.getByText(new RegExp(`^${JOHN_LIST_COPY.count(2)} About \\d+ points a week`))).toBeOnTheScreen();
    expect(bar.getByTestId('add-john')).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
    // Not at the foot as well.
    expect(screen.getAllByTestId('add-john')).toHaveLength(1);
  });

  it('keeps Add a John in outline before the first deal, whose button is the page’s one in amber', async () => {
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...snapshot().house, everDealt: false } }));
    await open();
    expect(within(screen.getByTestId('john-list-bar')).getByTestId('add-john')).toHaveStyle({ backgroundColor: 'transparent' });
    expect(within(screen.getByTestId('deal')).getByRole('button', { name: words('today.nextUp.dealWeek1') })).toHaveStyle({
      backgroundColor: BIN_NIGHT.light.hivis,
    });
  });

  it('opens a John to read in the panel, for a housemate who is not an admin', async () => {
    await open('sam');
    await fireEvent.press(screen.getByRole('button', { name: /^Bathroom/ }));
    const panel = within(screen.getByTestId('john-facts'));
    expect(panel.getByRole('header', { name: 'Bathroom' })).toBeOnTheScreen();
    expect(panel.getAllByTestId('john-fact').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('john-form')).toBeNull();
  });
});

it("says when it can't read the list, and tries again", async () => {
  (loadJohnList as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  mockMembership.userId = 'priya';
  await renderPages({ 'house/_layout': HouseLayout, 'house/johns': JohnListScreen }, '/house/johns');
  expect(await screen.findByRole('alert')).toHaveTextContent(FOCUS_SHELL_COPY.unreadable);
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.retry }));
  expect(await screen.findAllByTestId('john-def')).toHaveLength(2);
});
