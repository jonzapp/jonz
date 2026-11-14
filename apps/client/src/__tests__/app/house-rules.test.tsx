import { NEW_JOHN, makeupHint, wordsFor } from '@app/core';
import { Slot } from 'expo-router';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { loadJohnList, setHouseKind, updateHouse } from '@/api/settings';
import RulesScreen from '@/app/(house)/house/rules';
import { ToastProvider } from '@/components/toast';
import { snapshot, KINDS } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({ updateHouse: jest.fn(), loadJohnList: jest.fn(), setHouseKind: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/locale', () => ({ deviceTimeZone: () => 'Europe/London' }));

const mockMembership = { userId: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMembership.userId } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

/** The house's toasts, as its layout mounts them. */
function HouseLayout() {
  return (
    <ToastProvider>
      <Slot />
    </ToastProvider>
  );
}

async function open(as: 'priya' | 'sam' = 'priya') {
  mockMembership.userId = as;
  await renderPages({ 'house/_layout': HouseLayout, 'house/rules': RulesScreen }, '/house/rules');
  await untilRead(words);
}

async function edit() {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: words('house.setup.edit') }));
}

/** A setting in the form, opened, and one of its choices picked. */
async function pick(setting: string, choice: string) {
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${setting}, `) }));
  await fireEvent.press(screen.getByRole('radio', { name: choice }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (updateHouse as jest.Mock).mockResolvedValue(undefined);
  // About 9 points a week between two: Light fits.
  (loadJohnList as jest.Mock).mockResolvedValue({
    kinds: KINDS,
    johns: [
      { ...NEW_JOHN, id: 'mop', name: 'Mopping', points: 3 },
      { ...NEW_JOHN, id: 'bins', name: 'Garbage', points: 1, dueDow: 4 },
      { ...NEW_JOHN, id: 'sweep', name: 'Sweeping', points: 2, dueDow: 3 },
      { ...NEW_JOHN, id: 'kitchen', name: 'Kitchen', points: 2, dueDow: 3 },
      { ...NEW_JOHN, id: 'recycling', name: 'Recycling', points: 1, dueDow: 4 },
    ],
    groups: [],
  });
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('common.title.rules') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.house') }) })).toBeOnTheScreen();
});

it('reads the rules out in plain words, with the admins who can change them', async () => {
  await open('sam');
  const panel = within(screen.getByTestId('rules-panel'));
  expect(panel.getByText(words('house.setup.rules'))).toBeOnTheScreen();
  expect(within(screen.getByTestId('admins-section')).getByTestId('admin-row')).toHaveTextContent(/Priya$/);
  const rules = panel.getAllByTestId('rule');
  [
    [words('week.steady.mode'), 'Smart'],
    [words('week.steady.budget'), 'Usual, 4 points each'],
    [words('house.setup.stake'), '£20 a month'],
    [words('house.setup.late'), '−£1'],
    [words('house.setup.missed'), '−£3'],
    [words('house.setup.settleIn'), 'In Jonz'],
    [words('house.setup.disputes'), 'within 24 hours'],
    [words('house.setup.lateWindow'), 'up to 24 hours after it’s due'],
    [words('house.setup.cover'), '3 hours after it’s due'],
    [words('house.setup.away'), 'made up in full'],
    [words('house.setup.weekStarts'), 'Monday, London time'],
  ].forEach(([label, value], i) => expect(rules[i]).toHaveTextContent(`${label}${value}`));
});

it('names every admin in full, however many there are', async () => {
  const members = snapshot().members;
  (loadHouse as jest.Mock).mockResolvedValue(
    snapshot({
      members: [
        ...members,
        { ...members[1], userId: 'tom', name: 'Tom Reilly', role: 'admin' },
        { ...members[1], userId: 'megan', name: 'Megan Doyle', role: 'admin' },
      ],
    }),
  );
  await open('sam');
  // A row each, so nothing is cut off.
  const admins = within(screen.getByTestId('admins-section')).getAllByTestId('admin-row');
  ['Priya', 'Tom Reilly', 'Megan Doyle'].forEach((name, i) => expect(admins[i]).toHaveTextContent(new RegExp(`${name}$`)));
});

it('never shows a housemate who is not an admin a form, locked or not', async () => {
  await open('sam');
  expect(screen.queryByRole('button', { name: words('house.setup.edit') })).toBeNull();
  expect(screen.queryByTestId('house-stake')).toBeNull();
  expect(screen.queryByTestId('save-rules')).toBeNull();
});

describe('an admin', () => {
  it('opens the form with Edit', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('house.setup.edit') }));
    expect(screen.queryByTestId('rules-panel')).toBeNull();
    expect(within(screen.getByTestId('rules-money')).getByText(words('house.setup.money'))).toBeOnTheScreen();
    expect(within(screen.getByTestId('rules-fairness')).getByText(words('house.setup.fairness'))).toBeOnTheScreen();
    expect(within(screen.getByTestId('rules-house')).getByText(words('house.setup.house'))).toBeOnTheScreen();
    expect(screen.getByTestId('house-stake')).toHaveDisplayValue('20');
  });

  it('keeps Save and Cancel pinned under the page, out of the part that scrolls', async () => {
    await edit();
    const foot = within(screen.getByTestId('rules-foot'));
    expect(foot.getByTestId('save-rules')).toBeOnTheScreen();
    expect(foot.getByRole('button', { name: words('house.setup.cancel') })).toBeOnTheScreen();
    expect(within(screen.getByTestId('rules-editing')).queryByTestId('save-rules')).toBeNull();
  });

  it('can save only once something has changed', async () => {
    await edit();
    expect(screen.getByTestId('save-rules')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('house-stake'), '20.00');
    // The same money, written differently, is no change.
    expect(screen.getByTestId('save-rules')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('house-stake'), '21');
    expect(screen.getByTestId('save-rules')).toBeEnabled();
  });

  it('saves what changed, the money in minor units, then reads the new rules out', async () => {
    await edit();
    await fireEvent.changeText(screen.getByTestId('house-stake'), '25.50');
    await pick(words('house.setup.disputes'), words('house.rules.disputeHours', { hours: 48 }));
    await pick(words('house.rules.currency'), '€ EUR');
    // The picked value shows on its row, briefly.
    expect(
      screen.getByRole('button', { name: `${words('house.setup.disputes')}, ${words('house.setup.disputeShort', { hours: 48 })}` }),
    ).toBeOnTheScreen();
    (loadHouse as jest.Mock).mockResolvedValue(
      snapshot({ rules: { ...snapshot().rules, currency: 'EUR', stakeMinor: 2550, disputeHours: 48 } }),
    );
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(updateHouse).toHaveBeenCalledWith(
      'h1',
      {
        name: 'Flat 3',
        timezone: 'Europe/London',
        currency: 'EUR',
        weekStarts: 1,
        stakeMinor: 2550,
        lateForfeitMinor: 100,
        missedForfeitMinor: 300,
        disputeHours: 48,
        coverGraceHours: 3,
        lateHours: 24,
        awayMakeup: 100,
        settleIn: 'jonz',
        dealMode: 'smart',
        dealBudget: 4,
      },
      expect.any(Function),
    );
    expect(await screen.findByTestId('rules-panel')).toBeOnTheScreen();
    expect(within(screen.getByTestId('toast')).getByText(words('house.setup.saved'))).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByTestId('rule')[2]).toHaveTextContent(/€25\.50 a month/));
    expect(screen.getAllByTestId('rule')[6]).toHaveTextContent(/within 48 hours/);
  });

  it('in a family, sets the most each kid can earn in a month, in place of the stake', async () => {
    const base = snapshot();
    (loadHouse as jest.Mock).mockResolvedValue(
      snapshot({
        house: { ...base.house, kind: 'family', pocketCapMinor: 1000 },
        rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
      }),
    );
    await edit();
    expect(screen.queryByTestId('house-stake')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('house-pocket'), '12.50');
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(updateHouse).toHaveBeenCalledWith('h1', expect.objectContaining({ pocketCapMinor: 1250 }), expect.any(Function));
  });

  it('picks how the house shares Johns and its budget, each saying what it does to the list', async () => {
    await edit();
    const workload = within(screen.getByTestId('rules-workload'));
    expect(workload.getByText(words('week.steady.workload'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: `${words('week.steady.mode')}, Smart` }));
    expect(
      screen.getByRole('radio', { name: `Smart, ${words('week.steady.suggested')} ${words('week.steady.modeMeta.smart')}` }),
    ).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: `Classic, ${words('week.steady.modeMeta.classic')}` }));

    await fireEvent.press(
      screen.getByRole('button', { name: `${words('week.steady.budget')}, ${words('week.steady.budgetName', { budget: 4 })}` }),
    );
    // Light suits this list: one John each, each coming round every couple of weeks.
    const light = await screen.findByRole('radio', {
      name: new RegExp(`^Light, 2 points, ${words('week.steady.suggested')} About one John each\\.`),
    });
    expect(
      screen.getByRole('radio', { name: `${words('week.steady.budgetName', { budget: 0 })}, ${words('week.steady.noLimit')}` }),
    ).toBeOnTheScreen();
    await fireEvent.press(light);
    expect(screen.getByTestId('rules-workload-note')).toHaveTextContent(
      `${words('week.steady.modeFoot')} ${words('week.steady.budgetFoot')}`,
    );

    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(updateHouse).toHaveBeenCalledWith('h1', expect.objectContaining({ dealMode: 'classic', dealBudget: 2 }), expect.any(Function));
  });

  it('puts the form away unsaved with Cancel', async () => {
    await edit();
    await fireEvent.changeText(screen.getByTestId('house-stake'), '99');
    await fireEvent.press(screen.getByRole('button', { name: words('house.setup.cancel') }));
    expect(screen.getByTestId('rules-panel')).toBeOnTheScreen();
    expect(screen.getAllByTestId('rule')[2]).toHaveTextContent(/£20 a month/);
    expect(updateHouse).not.toHaveBeenCalled();
  });

  it("names the amounts in the house's currency", async () => {
    await edit();
    expect(screen.getByText(words('house.rules.missed', { symbol: '£' }))).toBeOnTheScreen();
    await pick(words('house.rules.currency'), '$ CAD');
    expect(screen.getByText(words('house.rules.missed', { symbol: '$' }))).toBeOnTheScreen();
  });

  it("says under the amount that isn't money what's wrong, and saves nothing", async () => {
    await edit();
    await fireEvent.changeText(screen.getByTestId('house-late'), 'a quid');
    await fireEvent.press(screen.getByTestId('save-rules'));
    const money = within(screen.getByTestId('rules-money'));
    expect(money.getByRole('alert')).toHaveTextContent(words('house.rules.badAmount'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(updateHouse).not.toHaveBeenCalled();
    // Fixing it takes the problem away.
    await fireEvent.changeText(screen.getByTestId('house-late'), '1.50');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says under an amount below zero that it is wrong, and saves nothing', async () => {
    await edit();
    await fireEvent.changeText(screen.getByTestId('house-missed'), '-3');
    // Minus three pounds isn't three pounds: Save is there to say so.
    expect(screen.getByTestId('save-rules')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(within(screen.getByTestId('rules-money')).getByRole('alert')).toHaveTextContent(words('house.rules.badAmount'));
    expect(updateHouse).not.toHaveBeenCalled();
  });

  it('says under the name when it is empty', async () => {
    await edit();
    await fireEvent.changeText(screen.getByTestId('rules-name'), ' ');
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(within(screen.getByTestId('rules-house')).getByRole('alert')).toBeOnTheScreen();
    expect(updateHouse).not.toHaveBeenCalled();
  });

  it('shows the database refusing by Save, and keeps the form', async () => {
    (updateHouse as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
    await edit();
    await fireEvent.changeText(screen.getByTestId('house-stake'), '30');
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(await within(screen.getByTestId('rules-foot')).findByRole('alert')).toHaveTextContent('Only the house admins can do that.');
    expect(screen.getByTestId('house-stake')).toHaveDisplayValue('30');
  });

  it('shows a time zone the database refuses under Time zone', async () => {
    (updateHouse as jest.Mock).mockRejectedValue(new Error('That time zone isn’t one we recognise.'));
    await edit();
    await fireEvent.changeText(screen.getByTestId('rules-timezone'), 'Europe/Londn');
    await fireEvent.press(screen.getByTestId('save-rules'));
    expect(await within(screen.getByTestId('rules-house')).findByRole('alert')).toHaveTextContent('That time zone isn’t one we recognise.');
    expect(within(screen.getByTestId('rules-foot')).queryByRole('alert')).toBeNull();
    // Fixing it takes the problem away.
    await fireEvent.changeText(screen.getByTestId('rules-timezone'), 'Europe/London');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains what time away still owes, at each rate', async () => {
    await edit();
    expect(screen.getByText(`${words('house.rules.awayNote')} ${makeupHint(100, words)}`)).toBeOnTheScreen();
    await pick(words('house.setup.away'), 'Not at all');
    expect(screen.getByText(`${words('house.rules.awayNote')} ${makeupHint(0, words)}`)).toBeOnTheScreen();
  });
});

describe('Who lives here', () => {
  it('reads out what the house is to someone who is not an admin, with no way to change it', async () => {
    await open('sam');
    const section = within(screen.getByTestId('kind-switch'));
    expect(section.getByTestId('kind-now')).toHaveTextContent(new RegExp(`^${words('house.family.kinds.housemates')}`));
    expect(section.queryByRole('radio')).toBeNull();
  });

  it("lets an admin make the house a family, saying first it waits for the month's money", async () => {
    (setHouseKind as jest.Mock).mockResolvedValue('2026-11-01');
    await open();
    expect(screen.getByRole('radio', { name: new RegExp(`^${words('house.family.kinds.housemates')}, `) })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${words('house.family.kinds.family')}, `) }));
    const sheet = within(screen.getByTestId('kind-sheet'));
    expect(sheet.getByText(words('house.kindSwitch.toFamilyTitle', { house: 'Flat 3' }))).toBeOnTheScreen();
    expect(sheet.getByText(/is settled up as usual, then the Stake stops/)).toBeOnTheScreen();
    await fireEvent.press(sheet.getByRole('button', { name: words('house.kindSwitch.toFamily') }));
    await waitFor(() => expect(setHouseKind).toHaveBeenCalledWith('h1', 'family'));
    expect(await screen.findByText(words('house.kindSwitch.later', { on: 'Sun 1 Nov' }))).toBeOnTheScreen();
  });

  it('shows a change that waits for the 1st, and keeps housemates without asking', async () => {
    const base = snapshot();
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ house: { ...base.house, nextKind: { kind: 'family', on: '2026-12-01' } } }));
    (setHouseKind as jest.Mock).mockResolvedValue(null);
    await open();
    const family = screen.getByRole('radio', { name: new RegExp(`^${words('house.family.kinds.family')}, `) });
    expect(family).toBeChecked();
    expect(family).toHaveAccessibleName(new RegExp(words('house.kindSwitch.waits', { on: 'Tue 1 Dec', month: 'November' })));
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${words('house.family.kinds.housemates')}, `) }));
    await waitFor(() => expect(setHouseKind).toHaveBeenCalledWith('h1', 'housemates'));
    expect(screen.queryByTestId('kind-sheet')).toBeNull();
    expect(await screen.findByText(words('house.kindSwitch.done.kept'))).toBeOnTheScreen();
  });

  it('asks before making a family housemates again', async () => {
    const base = snapshot();
    (loadHouse as jest.Mock).mockResolvedValue(
      snapshot({
        house: { ...base.house, kind: 'family', pocketCapMinor: 1000 },
        rules: { ...base.rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 },
      }),
    );
    (setHouseKind as jest.Mock).mockResolvedValue(null);
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${words('house.family.kinds.housemates')}, `) }));
    const sheet = within(screen.getByTestId('kind-sheet'));
    expect(sheet.getByText(words('house.kindSwitch.toHousemates'))).toBeOnTheScreen();
    await fireEvent.press(sheet.getByRole('button', { name: words('house.kindSwitch.toHousematesConfirm') }));
    await waitFor(() => expect(setHouseKind).toHaveBeenCalledWith('h1', 'housemates'));
    expect(await screen.findByText(words('house.kindSwitch.done.housemates'))).toBeOnTheScreen();
  });
});
