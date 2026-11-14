import { wordsFor } from '@app/core';
import { Slot } from 'expo-router';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { deleteKind, loadJohnList, orderKinds, saveKind } from '@/api/settings';
import JohnListScreen from '@/app/(house)/house/johns';
import { HouseWorkspace } from '@/components/house/workspace';
import { ToastProvider } from '@/components/toast';
import { AskPanelProvider } from '@/hooks/use-ask-jonz';
import { KINDS, snapshot } from '@/testing/house';
import { BATH, BINS, renderPages, untilRead } from '@/testing/pages';

// The house's own kinds of John, under the John list (Kinds list A, 14 Nov):
// each with its lid bar and how many Johns it has, opened to rename it, give
// it a colour (a ready one or any colour), move it or delete it. A deleted
// kind's Johns have no kind until they're given one (no kind C, 14 Nov).

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({
  loadJohnList: jest.fn(),
  saveJohn: jest.fn(),
  archiveJohn: jest.fn(),
  dealThisWeek: jest.fn(),
  saveKind: jest.fn(),
  orderKinds: jest.fn(),
  deleteKind: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

const mockMembership = { userId: 'priya' };
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: mockMembership.userId } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 412, height: 915, scale: 1, fontScale: 1 })),
}));

/** A kind the house made, and a John in it. */
const GARDEN = { id: 'garden', name: 'Garden', colour: '#4f9a2e', position: 6, preset: null };
const LAWN = { ...BINS, id: 'j-lawn', name: 'Mow the lawn', kindId: 'garden' };
/** A John whose kind was deleted. */
const SHED = { ...BINS, id: 'j-shed', name: 'Sweep the shed', kindId: null };

function HouseLayout() {
  return (
    <ToastProvider>
      <AskPanelProvider>
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
  await untilRead(words);
}

/** A kind on the Kinds list, opened. */
async function openKind(name: string) {
  await fireEvent.press(within(screen.getByTestId('johns-kinds')).getByRole('button', { name: new RegExp(`^${words('house.kinds.edit', { name })}, `) }));
  return within(screen.getByTestId('kind-form'));
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (loadJohnList as jest.Mock).mockResolvedValue({ kinds: [...KINDS, GARDEN], johns: [BINS, BATH, LAWN], groups: [] });
  (saveKind as jest.Mock).mockResolvedValue('k-new');
  for (const move of [orderKinds, deleteKind]) (move as jest.Mock).mockResolvedValue(undefined);
});

it("shows an admin the house's kinds in order, each with how many Johns it has, then Add a kind", async () => {
  await open();
  const kinds = within(screen.getByTestId('johns-kinds'));
  expect(kinds.getByRole('header', { name: words('house.kinds.title') })).toBeOnTheScreen();
  expect(kinds.getAllByTestId('kind-row')).toHaveLength(7);
  const named = [
    `${words('house.kinds.edit', { name: 'Kitchen' })}, No Johns`,
    `${words('house.kinds.edit', { name: 'Bathroom' })}, 1 John`,
    `${words('house.kinds.edit', { name: 'Bins & recycling' })}, 1 John`,
    `${words('house.kinds.edit', { name: 'Floors & hoovering' })}, No Johns`,
    `${words('house.kinds.edit', { name: 'Errands & shopping' })}, No Johns`,
    `${words('house.kinds.edit', { name: 'Everything else' })}, No Johns`,
    `${words('house.kinds.edit', { name: 'Garden' })}, 1 John`,
  ];
  // In the house's order, each a button named for what it does and how many Johns it has.
  const buttons = kinds.getAllByRole('button');
  expect(named.map((name) => buttons.indexOf(kinds.getByRole('button', { name })))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(kinds.getByRole('button', { name: words('house.kinds.add') })).toBeOnTheScreen();
  expect(kinds.getByText(words('house.kinds.note'))).toBeOnTheScreen();
});

it("puts a John in a kind the house made under that kind's own name", async () => {
  await open();
  const garden = within(screen.getByTestId('kind-garden'));
  expect(garden.getByRole('header', { name: 'Garden' })).toBeOnTheScreen();
  expect(garden.getByTestId('john-def')).toHaveTextContent(/Mow the lawn/);
});

it('puts Johns with no kind last, in a grey No kind section, and says so in the John form', async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ kinds: [...KINDS, GARDEN], johns: [SHED, BINS, LAWN], groups: [] });
  await open();
  const sections = within(screen.getByTestId('john-kinds')).getAllByRole('header');
  expect(sections.map((h) => h.props.children)).toEqual(['Bins & recycling', 'Garden', words('house.kinds.none')]);
  const none = within(screen.getByTestId('kind-none'));
  expect(none.getByTestId('john-def')).toHaveTextContent(/Sweep the shed/);
  // Not counted under any kind.
  expect(within(screen.getByTestId('johns-kinds')).getByRole('button', { name: `${words('house.kinds.edit', { name: 'Everything else' })}, No Johns` })).toBeOnTheScreen();
  await fireEvent.press(none.getByTestId('john-def'));
  expect(within(screen.getByTestId('john-form')).getByTestId('john-kind')).toHaveTextContent(new RegExp(words('house.kinds.none')));
});

it("doesn't show a housemate the kinds to change", async () => {
  await open('sam');
  expect(screen.getByTestId('kind-bathroom')).toBeOnTheScreen();
  expect(screen.queryByTestId('johns-kinds')).toBeNull();
});

it('adds a kind in a ready colour no kind has yet, or one picked', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: words('house.kinds.add') }));
  const form = within(screen.getByTestId('kind-form'));
  // A new kind starts on the first ready colour no kind has, and can't be saved without a name.
  expect(form.getByRole('radio', { name: words('house.kinds.colourName.pink') })).toBeChecked();
  expect(form.getByTestId('save-kind')).toBeDisabled();
  // No place to move to or delete yet.
  expect(form.queryByTestId('kind-place')).toBeNull();
  expect(form.queryByTestId('delete-kind')).toBeNull();
  await fireEvent.changeText(form.getByTestId('kind-name'), 'Pets');
  await fireEvent.press(form.getByRole('radio', { name: words('house.kinds.colourName.ochre') }));
  // How a John of it looks, before it's saved.
  expect(form.getByTestId('kind-preview')).toHaveTextContent(/Pets/);
  await fireEvent.press(form.getByTestId('save-kind'));
  expect(saveKind).toHaveBeenCalledWith('h1', null, { name: 'Pets', colour: '#b08840' });
  await waitFor(() => expect(screen.queryByTestId('kind-form')).toBeNull());
});

it('takes any colour by its code, and says when a code is not one', async () => {
  await open();
  const form = await openKind('Garden');
  await fireEvent.press(form.getByRole('radio', { name: words('house.kinds.anyColour') }));
  expect(form.getByRole('adjustable', { name: words('house.kinds.shade') })).toBeOnTheScreen();
  expect(form.getByRole('adjustable', { name: words('house.kinds.hue') })).toBeOnTheScreen();
  await fireEvent.changeText(form.getByTestId('colour-code'), 'zz');
  expect(form.getByText(words('errors.bad_colour'))).toBeOnTheScreen();
  await fireEvent.changeText(form.getByTestId('colour-code'), '#3A7');
  expect(form.queryByText(words('errors.bad_colour'))).toBeNull();
  await fireEvent.press(form.getByTestId('save-kind'));
  expect(saveKind).toHaveBeenCalledWith('h1', 'garden', { name: 'Garden', colour: '#33aa77' });
});

it('renames a kind, showing a John of it as it will look', async () => {
  await open();
  const form = await openKind('Bathroom');
  expect(form.getByTestId('kind-name')).toHaveDisplayValue('Bathroom');
  expect(form.getByTestId('kind-preview')).toHaveTextContent(/Bathroom/);
  await fireEvent.changeText(form.getByTestId('kind-name'), 'Shower room');
  expect(form.getByTestId('kind-preview')).toHaveTextContent(/Shower room/);
  await fireEvent.press(form.getByTestId('save-kind'));
  expect(saveKind).toHaveBeenCalledWith('h1', 'bathroom', { name: 'Shower room', colour: '#1f5fae' });
});

it('moves a kind up or down the list at once', async () => {
  await open();
  const form = await openKind('Bathroom');
  expect(form.getByTestId('kind-up')).toHaveTextContent(/Above Kitchen/);
  expect(form.getByTestId('kind-down')).toHaveTextContent(/Below Bins & recycling/);
  await fireEvent.press(form.getByTestId('kind-down'));
  expect(orderKinds).toHaveBeenCalledWith('h1', ['kitchen', 'bins', 'bathroom', 'floors', 'errands', 'other', 'garden']);
  // The first kind has nowhere further up to go.
  await fireEvent.press(screen.getByTestId('sheet-close'));
});

it('keeps the first kind from going up and the last from going down', async () => {
  await open();
  let form = await openKind('Kitchen');
  expect(form.queryByTestId('kind-up')).toBeNull();
  expect(form.getByTestId('kind-down')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('sheet-close'));
  form = await openKind('Garden');
  expect(form.getByTestId('kind-up')).toBeOnTheScreen();
  expect(form.queryByTestId('kind-down')).toBeNull();
});

it('deletes a kind, saying its Johns will have no kind until they are given one', async () => {
  await open();
  const form = await openKind('Garden');
  expect(form.getByTestId('kind-note')).toHaveTextContent(words('house.kinds.deleteNote', { n: 1 }));
  await fireEvent.press(form.getByTestId('delete-kind'));
  expect(deleteKind).toHaveBeenCalledWith('garden');
  await waitFor(() => expect(screen.queryByTestId('kind-form')).toBeNull());
});

it('deletes any kind, Everything else too, with nothing to say when it has no Johns', async () => {
  await open();
  const form = await openKind('Everything else');
  expect(form.queryByTestId('kind-note')).toBeNull();
  await fireEvent.press(form.getByTestId('delete-kind'));
  expect(deleteKind).toHaveBeenCalledWith('other');
});
