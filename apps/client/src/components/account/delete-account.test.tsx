import { DELETION_DAYS, wordsFor } from "@app/core";
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { deletionPreview, keepAccount, requestDeletion } from '@/api/account';
import { signOut } from '@/api/auth';
import { loadHouse } from '@/api/board';
import { reminderSupport } from '@/api/push';
import DeletePage from '@/app/delete';
import { LeaveSection } from '@/components/house-page/leave-section';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

import { BeingDeleted } from './being-deleted';

const words = wordsFor("en", "housemates");

jest.mock('@/api/account', () => ({ deletionPreview: jest.fn(), requestDeletion: jest.fn(), keepAccount: jest.fn() }));
jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/profile', () => ({ renameMe: jest.fn() }));
jest.mock('@/api/settings', () => ({ removeMember: jest.fn(), handOver: jest.fn() }));
jest.mock('@/api/stake', () => ({ loadStake: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('@/api/push', () => ({ reminderSupport: jest.fn(), remindersOn: jest.fn(), turnRemindersOn: jest.fn(), turnRemindersOff: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-membership', () => ({ useMembership: jest.fn() }));

const refresh = jest.fn();

function signedIn(house: { id: string; name: string } | null = { id: 'h1', name: 'The Annexe' }) {
  jest.mocked(useMembership).mockReturnValue({ session: { user: { id: 'priya' } }, house, refresh } as unknown as ReturnType<typeof useMembership>);
}

/** You's Danger zone. */
function Host() {
  const { view } = useHouse('h1', 'priya');
  return view ? <LeaveSection houseId="h1" userId="priya" view={view} /> : null;
}

/** You's Danger zone, with the Delete sheet open. */
async function openSheet() {
  await renderPages({ 'house/index': Host }, '/house');
  await fireEvent.press(within(await screen.findByTestId('to-delete-account-row')).getByRole('button', { name: words('people.delete.button') }));
  return within(await screen.findByTestId('delete-sheet'));
}

beforeEach(() => {
  jest.clearAllMocks();
  signedIn();
  jest.mocked(loadHouse).mockResolvedValue(snapshot());
  jest.mocked(reminderSupport).mockReturnValue('none');
  jest.mocked(deletionPreview).mockResolvedValue({ house: 'The Annexe', passUntil: '2027-10-12', deleteAfter: '2026-11-30T09:00:00Z' });
  jest.mocked(requestDeletion).mockResolvedValue('2026-11-30T09:00:00Z');
  jest.mocked(keepAccount).mockResolvedValue(undefined);
  jest.mocked(signOut).mockResolvedValue(undefined);
});

describe('in House', () => {
  it('sits in the Danger zone, saying what goes and that it’s on the web too', async () => {
    await renderPages({ 'house/index': Host }, '/house');
    const row = within(await screen.findByTestId('to-delete-account-row'));
    expect(row.getByText(words('people.delete.row'))).toBeOnTheScreen();
    expect(row.getByText(words('people.delete.meta', { days: DELETION_DAYS }))).toBeOnTheScreen();
  });

  it('says what goes, what stays with the house, and that the Pass stops renewing', async () => {
    const sheet = await openSheet();
    expect(sheet.getByRole('header', { name: words('people.delete.title') })).toBeOnTheScreen();
    expect(sheet.getByText(words('people.delete.goes'), { exact: false })).toBeOnTheScreen();
    expect(await sheet.findByTestId('delete-stays')).toHaveTextContent(`Stays with The Annexe: ${words('people.delete.stays')}`);
    expect(sheet.getByTestId('delete-pass')).toHaveTextContent('Your House Pass stops renewing. It covers the house until 12 Oct 2027.');
    expect(sheet.getByTestId('delete-wait')).toHaveTextContent(words('people.delete.wait', { days: DELETION_DAYS }));
  });

  it('leaves out the Pass for someone who doesn’t pay for one', async () => {
    jest.mocked(deletionPreview).mockResolvedValue({ house: 'The Annexe', passUntil: null, deleteAfter: '2026-11-30T09:00:00Z' });
    const sheet = await openSheet();
    await sheet.findByTestId('delete-stays');
    expect(sheet.queryByTestId('delete-pass')).toBeNull();
  });

  it('waits for DELETE to be typed, then asks and reads the account again', async () => {
    const sheet = await openSheet();
    expect(sheet.getByTestId('delete-account')).toBeDisabled();
    await fireEvent.changeText(sheet.getByLabelText(words('people.delete.typeLabel')), 'DELE');
    expect(sheet.getByTestId('delete-account')).toBeDisabled();
    await fireEvent.changeText(sheet.getByLabelText(words('people.delete.typeLabel')), 'delete');
    expect(sheet.getByTestId('delete-account')).toBeEnabled();
    await fireEvent.press(sheet.getByTestId('delete-account'));
    expect(requestDeletion).toHaveBeenCalledTimes(1);
    // The app becomes the being-deleted screen once it reads the account again.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('says why when it couldn’t, and keeps the sheet open', async () => {
    jest.mocked(requestDeletion).mockRejectedValue(new Error('Something went wrong. Try again.'));
    const sheet = await openSheet();
    await fireEvent.changeText(sheet.getByLabelText(words('people.delete.typeLabel')), 'DELETE');
    await fireEvent.press(sheet.getByTestId('delete-account'));
    expect(await sheet.findByText('Something went wrong. Try again.')).toBeOnTheScreen();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('puts the sheet away on Keep it, asking nothing', async () => {
    const sheet = await openSheet();
    await fireEvent.press(sheet.getByTestId('keep-it'));
    await waitFor(() => expect(screen.queryByTestId('delete-sheet')).toBeNull());
    expect(requestDeletion).not.toHaveBeenCalled();
  });
});

describe('while it waits', () => {
  const deletion = { deleteAfter: '2026-11-29T09:00:00Z', requestedBy: 'self' as const };

  it('says when it goes, and Keep my account stops it', async () => {
    await renderPages({ index: () => <BeingDeleted deletion={deletion} /> }, '/');
    expect(screen.getByText(words('people.delete.beingDeleted'))).toBeOnTheScreen();
    expect(screen.getByText(/It goes for good on Sun 29 Nov\. Until then nothing is gone, and your house still sees you as away\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('keep-account'));
    expect(keepAccount).toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('doesn’t mention a house for someone in none, and signs out', async () => {
    signedIn(null);
    await renderPages({ index: () => <BeingDeleted deletion={deletion} /> }, '/');
    expect(screen.getByText(/It goes for good on Sun 29 Nov\. Until then nothing is gone\.$/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('deleted-sign-out'));
    expect(signOut).toHaveBeenCalled();
    expect(keepAccount).not.toHaveBeenCalled();
  });
});

describe('jonz.app/delete', () => {
  it('signed out, says what goes and stays, and signs in on the way back here', async () => {
    jest.mocked(useMembership).mockReturnValue({ session: null, house: null, refresh } as unknown as ReturnType<typeof useMembership>);
    await renderPages({ delete: DeletePage }, '/delete');
    expect(screen.getByText(words('people.delete.pageTitle'))).toBeOnTheScreen();
    expect(screen.getByText(words('people.delete.stays'), { exact: false })).toBeOnTheScreen();
    expect(screen.getByText(words('people.delete.passAny'))).toBeOnTheScreen();
    expect(screen.getByText(words('people.delete.cantSignIn'))).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-to-delete')).toHaveProp('href', '/signin?next=%2Fdelete');
    expect(deletionPreview).not.toHaveBeenCalled();
  });

  it('signed in, is the same as in House', async () => {
    await renderPages({ delete: DeletePage }, '/delete');
    expect(await screen.findByTestId('delete-stays')).toBeOnTheScreen();
    expect(screen.getByTestId('delete-account')).toBeDisabled();
  });
});
