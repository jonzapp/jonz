import { OPERATIONS, signInReason, wordsFor } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { answerApproval, readApproval } from '@/api/approvals';
import { signInWithGoogle } from '@/api/auth';
import Approve from '@/app/approve/[approvalId]';
import { useMembership } from '@/hooks/use-membership';
import { testQueryClient } from '@/testing/query';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/approvals', () => ({ readApproval: jest.fn(), answerApproval: jest.fn() }));
jest.mock('@/api/email-auth', () => ({}));
jest.mock('@/api/auth', () => ({
  appleSignInAvailable: jest.fn(async () => false),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithMicrosoft: jest.fn(),
}));
jest.mock('@/hooks/use-membership', () => ({ useMembership: jest.fn() }));

const read = readApproval as jest.Mock;
const answer = answerApproval as jest.Mock;
const membership = useMembership as jest.Mock;
const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const WAITING = {
  id: ID,
  operation: 'set_house_kind',
  input: { houseId: '9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', kind: 'family' },
  house_id: '9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  house_name: 'Flat 3',
  created_at: '2027-01-04T09:30:00Z',
  expires_at: '2027-01-04T09:45:00Z',
  approved_at: null,
  declined_at: null,
  used_at: null,
};

function as(session: object | null) {
  membership.mockReturnValue({ session, house: null, refresh: jest.fn() });
}

async function open() {
  const client = testQueryClient();
  await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      ),
      'approve/[approvalId]': Approve,
    },
    { initialUrl: `/approve/${ID}` },
  );
}

// A pretend clock: 09:35 on the request's day, five minutes into its fifteen.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date('2027-01-04T09:35:00Z'), advanceTimers: true });
});
afterEach(() => jest.useRealTimers());

it('signs you in right there when signed out, and Google brings you back to it', async () => {
  as(null);
  await open();
  expect(screen.getByText(signInReason(`/approve/${ID}`))).toBeOnTheScreen();
  expect(read).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: words('door.signIn.google') }));
  expect(signInWithGoogle).toHaveBeenCalledWith(`/approve/${ID}`);
});

it("says what the app asked, in the registry's words, and approves it", async () => {
  as({ user: { id: 'u1', email: 'glyn@example.com' } });
  read.mockResolvedValueOnce(WAITING).mockResolvedValue({ ...WAITING, approved_at: '2027-01-04T09:31:00Z' });
  answer.mockResolvedValue(undefined);
  await open();
  expect(await screen.findByRole('header', { name: words('people.approve.heading') })).toBeOnTheScreen();
  expect(screen.getByTestId('approve-ask')).toHaveTextContent(`${OPERATIONS.set_house_kind.about}.`);
  expect(screen.getByText(words('people.approve.inHouse', { house: 'Flat 3' }))).toBeOnTheScreen();
  expect(screen.getByText('Kind: family')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: words('people.approve.approve') }));
  expect(answer).toHaveBeenCalledWith(ID, true);
  expect(await screen.findByRole('header', { name: words('people.approve.approved') })).toBeOnTheScreen();
  expect(screen.getByText(words('people.approve.approvedBody'))).toBeOnTheScreen();
});

it('declines it', async () => {
  as({ user: { id: 'u1' } });
  read.mockResolvedValueOnce(WAITING).mockResolvedValue({ ...WAITING, declined_at: '2027-01-04T09:31:00Z' });
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: words('people.approve.decline') }));
  expect(answer).toHaveBeenCalledWith(ID, false);
  await waitFor(() => expect(screen.getByRole('header', { name: words('people.approve.declined') })).toBeOnTheScreen());
});

it("says when the link isn't yours, and when a request has expired or been done", async () => {
  as({ user: { id: 'u1', email: 'glyn@example.com' } });
  read.mockResolvedValue(null);
  await open();
  expect(await screen.findByRole('header', { name: words('people.approve.unknown') })).toBeOnTheScreen();
  expect(screen.getByText(words('people.approve.signedInAs', { email: 'glyn@example.com' }))).toBeOnTheScreen();

  read.mockResolvedValue({ ...WAITING, expires_at: '2027-01-04T09:34:00Z' });
  await open();
  expect(await screen.findByRole('header', { name: words('people.approve.expired') })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: words('people.approve.approve') })).toBeNull();

  read.mockResolvedValue({ ...WAITING, approved_at: '2027-01-04T09:31:00Z', used_at: '2027-01-04T09:32:00Z' });
  await open();
  expect(await screen.findByRole('header', { name: words('people.approve.done') })).toBeOnTheScreen();
});
