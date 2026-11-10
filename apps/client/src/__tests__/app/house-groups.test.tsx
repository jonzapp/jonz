import { wordsFor } from '@app/core';
import { Slot } from 'expo-router';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { deleteGroup, loadJohnList, saveGroup } from '@/api/settings';
import GroupsScreen from '@/app/(house)/house/groups';
import JohnListScreen from '@/app/(house)/house/johns';
import { ToastProvider } from '@/components/toast';
import { snapshot } from '@/testing/house';
import { BATH, renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
// Groups are on the John list, among the Johns they share.
jest.mock('@/api/settings', () => ({
  loadJohnList: jest.fn(),
  saveGroup: jest.fn(),
  deleteGroup: jest.fn(),
  saveJohn: jest.fn(),
  archiveJohn: jest.fn(),
  dealThisWeek: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const mockMembership = { userId: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMembership.userId } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const UPSTAIRS = { id: 'g1', name: 'Upstairs bathroom', memberIds: ['priya', 'sam'] };

/** The house's toasts, as its layout mounts them (the deal at the foot of the list uses them). */
function HouseLayout() {
  return (
    <ToastProvider>
      <Slot />
    </ToastProvider>
  );
}

async function open(as: 'priya' | 'sam' = 'priya', path = '/house/johns') {
  mockMembership.userId = as;
  await renderPages({ 'house/_layout': HouseLayout, 'house/johns': JohnListScreen, 'house/groups': GroupsScreen }, path);
  await untilRead(words);
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  for (const move of [saveGroup, deleteGroup]) (move as jest.Mock).mockResolvedValue(undefined);
});

it('is on the John list, where an old link to Groups lands', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [{ ...BATH, groupId: 'g1' }], groups: [UPSTAIRS] });
  await open('priya', '/house/groups');
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: words('common.title.johnList') })).toBeOnTheScreen();
  const groups = within(screen.getByTestId('johns-groups'));
  expect(groups.getByText(words('house.groups.title'))).toBeOnTheScreen();
  expect(groups.getByTestId('group')).toHaveTextContent(/Upstairs bathroom/);
  // On a phone, at the foot: after the Johns.
  expect(screen.getByTestId('john-def')).toBeOnTheScreen();
});

it('names each group and who is in it, and says when nobody is', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({
    johns: [{ ...BATH, groupId: 'g1' }],
    groups: [UPSTAIRS, { id: 'g2', name: 'Attic', memberIds: [] }],
  });
  await open();
  const [upstairs, attic] = screen.getAllByTestId('group');
  expect(upstairs).toHaveTextContent(/Upstairs bathroom.*You and Sam/);
  expect(attic).toHaveTextContent(`Attic${words('house.groups.nobody')}`);
  expect(screen.getByText(words('house.setup.groupsNote'))).toBeOnTheScreen();
});

it('explains what a group is to an admin before there are any, and shows a housemate none', async () => {
  await open();
  expect(within(screen.getByTestId('johns-groups')).getByText(words('house.groups.empty'))).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: words('house.setup.addGroup') })).toBeOnTheScreen();

  await open('sam');
  expect(screen.queryByTestId('johns-groups')).toBeNull();
});

describe('an admin', () => {
  it('makes a group of the people who share something, each named by first name', async () => {
    const members = snapshot().members;
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ members: [members[0], { ...members[1], name: 'Sam Carter' }] }));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('house.setup.addGroup') }));
    expect(screen.getByRole('header', { name: words('house.setup.addGroup') })).toBeOnTheScreen();
    const form = within(screen.getByTestId('group-form'));
    expect(form.getByTestId('save-group')).toBeDisabled();
    await fireEvent.changeText(form.getByTestId('group-name'), 'Upstairs bathroom');
    await fireEvent.press(form.getByRole('checkbox', { name: words('house.setup.you') }));
    await fireEvent.press(form.getByRole('checkbox', { name: 'Sam' }));
    expect(form.getByRole('checkbox', { name: 'Sam' })).toBeChecked();
    await fireEvent.press(form.getByRole('checkbox', { name: 'Sam' }));
    expect(form.getByRole('checkbox', { name: 'Sam' })).not.toBeChecked();
    await fireEvent.press(form.getByTestId('save-group'));
    expect(saveGroup).toHaveBeenCalledWith('h1', { id: undefined, name: 'Upstairs bathroom', members: ['priya'] });
    await waitFor(() => expect(screen.queryByTestId('group-form')).toBeNull());
  });

  it("won't make a group with nobody in it", async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('house.setup.addGroup') }));
    await fireEvent.changeText(screen.getByTestId('group-name'), 'Attic');
    expect(screen.getByTestId('save-group')).toBeDisabled();
  });

  it('adds another group from the foot of the list', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [UPSTAIRS] });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: words('house.setup.addGroup') }));
    expect(screen.getByTestId('group-name')).toHaveDisplayValue('');
  });

  it('opens a group to change it, or to delete it', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [UPSTAIRS] });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: `${words('house.groups.edit', { name: 'Upstairs bathroom' })}, You and Sam` }));
    const form = within(screen.getByTestId('group-form'));
    expect(form.getByTestId('group-name')).toHaveDisplayValue('Upstairs bathroom');
    expect(form.getByRole('checkbox', { name: 'Sam' })).toBeChecked();
    await fireEvent.press(form.getByRole('button', { name: words('house.groups.remove') }));
    expect(deleteGroup).toHaveBeenCalledWith('g1');
  });

  it('keeps the sheet open, saying why, when the save is refused', async () => {
    (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [UPSTAIRS] });
    (saveGroup as jest.Mock).mockRejectedValue(new Error('Only the house admins can do that.'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: `${words('house.groups.edit', { name: 'Upstairs bathroom' })}, You and Sam` }));
    await fireEvent.changeText(screen.getByTestId('group-name'), 'Bathroom');
    await fireEvent.press(screen.getByTestId('save-group'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the house admins can do that.');
    expect(screen.getByTestId('group-form')).toBeOnTheScreen();
  });
});

it('is for admins to change', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [UPSTAIRS] });
  await open('sam');
  expect(screen.getByTestId('group')).toHaveTextContent(/Upstairs bathroom.*You and Priya/);
  expect(screen.queryByRole('button', { name: words('house.setup.addGroup') })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
});
