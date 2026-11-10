import { ADMINS_COPY, copyFor, HISTORY_COPY, PAGE_TITLE, PARENT_OK_COPY, SETUP_COPY } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { setRole } from '@/api/settings';
import AdminsScreen from '@/app/(house)/house/admins';
import RulesScreen from '@/app/(house)/house/rules';
import { ToastProvider } from '@/components/toast';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

const PARENTS_COPY = copyFor('family').ADMINS;

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/history', () => ({ undoAction: jest.fn(), undoLatest: jest.fn() }));
jest.mock('@/api/settings', () => ({ setRole: jest.fn(), updateHouse: jest.fn(), loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
let mockMe = 'priya';
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMe } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const ADA = { userId: 'ada', name: 'Ada', photo: null, role: 'member' as const, streak: 0, immunityTokens: 0, swapTokens: 0, prefs: { days: [], bestTime: null, rather: {} } };

function Rules() {
  return (
    <ToastProvider>
      <RulesScreen />
    </ToastProvider>
  );
}

function OldAdmins() {
  return (
    <ToastProvider>
      <AdminsScreen />
    </ToastProvider>
  );
}

/** The admins, on the Rules page beside the rules they can change, from its own path or an old link to Admins. */
async function open(path = '/house/rules') {
  await renderPages({ 'house/rules': Rules, 'house/admins': OldAdmins }, path);
  return within(await screen.findByTestId('admins-list'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe = 'priya';
  (loadHouse as jest.Mock).mockResolvedValue(snapshot({ members: [...snapshot().members, ADA] }));
  (setRole as jest.Mock).mockResolvedValue(undefined);
});

it('is on the Rules page, where an old link to Admins lands', async () => {
  await open('/house/admins');
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: PAGE_TITLE.rules })).toBeOnTheScreen();
  expect(screen.getByTestId('rules-panel')).toBeOnTheScreen();
  expect(within(screen.getByTestId('admins-section')).getByText(ADMINS_COPY.title)).toBeOnTheScreen();
});

it('lists the admins, and the only one is told leaving hands over', async () => {
  const list = await open();
  expect(list.getAllByTestId('admin-row')).toHaveLength(1);
  expect(list.getByText(ADMINS_COPY.you('Priya'))).toBeOnTheScreen();
  // The only admin can't step themselves down here.
  expect(list.queryByTestId('remove-admin')).toBeNull();
  expect(screen.getByText(new RegExp(ADMINS_COPY.onlyAdmin))).toBeOnTheScreen();
});

it('adds an admin from the housemates who aren’t one, then offers Undo', async () => {
  const list = await open();
  await fireEvent.press(list.getByRole('button', { name: ADMINS_COPY.add }));
  const sheet = within(screen.getByTestId('add-admin-sheet'));
  expect(sheet.getAllByTestId('admin-pick')).toHaveLength(2);
  await fireEvent.press(sheet.getByRole('radio', { name: 'Ada' }));
  await fireEvent.press(sheet.getByRole('button', { name: ADMINS_COPY.make('Ada') }));
  await waitFor(() => expect(setRole).toHaveBeenCalledWith('h1', 'ada', 'admin'));
  expect(await screen.findByText(HISTORY_COPY.madeAdmin('Ada'))).toBeOnTheScreen();
});

it('lets an admin step another down, and shows housemates the list alone', async () => {
  (loadHouse as jest.Mock).mockResolvedValue(snapshot({ members: [...snapshot().members, { ...ADA, role: 'admin' }] }));
  const list = await open();
  await fireEvent.press(list.getByRole('button', { name: ADMINS_COPY.removeLabel('Ada') }));
  await waitFor(() => expect(setRole).toHaveBeenCalledWith('h1', 'ada', 'member'));

  mockMe = 'sam';
  const theirs = await open();
  expect(theirs.queryByTestId('add-admin')).toBeNull();
  expect(theirs.queryByTestId('remove-admin')).toBeNull();
});

describe('in a family', () => {
  beforeEach(() => {
    const family = snapshot({ members: [...snapshot().members, ADA] });
    (loadHouse as jest.Mock).mockResolvedValue({ ...family, house: { ...family.house, kind: 'family' } });
  });

  it('calls the admins parents, and adds a parent from the kids', async () => {
    const list = await open();
    expect(within(screen.getByTestId('admins-section')).getByText(PARENTS_COPY.title)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(PARENTS_COPY.onlyAdmin))).toBeOnTheScreen();
    await fireEvent.press(list.getByRole('button', { name: PARENTS_COPY.add }));
    const sheet = within(screen.getByTestId('add-admin-sheet'));
    await fireEvent.press(sheet.getByRole('radio', { name: 'Ada' }));
    await fireEvent.press(sheet.getByRole('button', { name: PARENTS_COPY.make('Ada') }));
    await waitFor(() => expect(setRole).toHaveBeenCalledWith('h1', 'ada', 'admin'));
  });

  it('leaves the stake, forfeits and vote out of the rules', async () => {
    await open();
    const rules = within(screen.getByTestId('rules-panel'));
    expect(rules.queryByText(SETUP_COPY.stake)).not.toBeOnTheScreen();
    expect(rules.queryByText(SETUP_COPY.missed)).not.toBeOnTheScreen();
    expect(rules.queryByText(SETUP_COPY.disputes)).not.toBeOnTheScreen();
    expect(rules.getByText(PARENT_OK_COPY.rulesValue)).toBeOnTheScreen();
  });
});
