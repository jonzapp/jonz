import { CONSENT_COPY, SIGN_IN_COPY, signInReason } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { signInWithGoogle } from '@/api/auth';
import { answerConsent, goBack, readConsent } from '@/api/connected-apps';
import Consent from '@/app/oauth/consent';
import { useMembership } from '@/hooks/use-membership';
import { testQueryClient } from '@/testing/query';

jest.mock('@/api/connected-apps', () => ({ readConsent: jest.fn(), answerConsent: jest.fn(), goBack: jest.fn() }));
jest.mock('@/api/email-auth', () => ({}));
jest.mock('@/api/auth', () => ({
  appleSignInAvailable: jest.fn(async () => false),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithMicrosoft: jest.fn(),
}));
jest.mock('@/hooks/use-membership', () => ({ useMembership: jest.fn() }));

const read = readConsent as jest.Mock;
const answer = answerConsent as jest.Mock;
const membership = useMembership as jest.Mock;
const ASK = {
  kind: 'ask',
  details: {
    authorization_id: 'auth123',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' },
    user: { id: 'u1', email: 'glyn@example.com' },
    scope: 'openid email',
  },
};
const assign = goBack as jest.Mock;

function as(session: object | null) {
  membership.mockReturnValue({ session, house: null, refresh: jest.fn() });
}

async function open(id = 'auth123') {
  const client = testQueryClient();
  await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      ),
      'oauth/consent': Consent,
    },
    { initialUrl: `/oauth/consent?authorization_id=${id}` },
  );
}

beforeEach(() => jest.clearAllMocks());

it('signs you in right there, and Google brings you back to the same sign-in', async () => {
  as(null);
  await open();
  expect(screen.getByText(signInReason('/oauth/consent?authorization_id=auth123'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
  expect(signInWithGoogle).toHaveBeenCalledWith('/oauth/consent?authorization_id=auth123');
  expect(read).not.toHaveBeenCalled();
});

it('names the app and what it may do, and allows it, back to the app', async () => {
  as({ user: { id: 'u1' } });
  read.mockResolvedValue(ASK);
  answer.mockResolvedValue('https://claude.ai/api/mcp/auth_callback?code=xyz&state=s');
  await open();
  expect(await screen.findByRole('header', { name: CONSENT_COPY.heading('Claude') })).toBeOnTheScreen();
  expect(screen.getByText(CONSENT_COPY.body('Claude'))).toBeOnTheScreen();
  expect(screen.getByText(CONSENT_COPY.backTo('https://claude.ai/api/mcp/auth_callback'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: CONSENT_COPY.allow }));
  expect(answer).toHaveBeenCalledWith('auth123', true);
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=xyz&state=s'));
});

it("says no, back to the app", async () => {
  as({ user: { id: 'u1' } });
  read.mockResolvedValue(ASK);
  answer.mockResolvedValue('https://claude.ai/api/mcp/auth_callback?error=access_denied');
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: CONSENT_COPY.deny }));
  expect(answer).toHaveBeenCalledWith('auth123', false);
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied'));
});

it('goes straight back to an app already allowed, and says when the link has expired', async () => {
  as({ user: { id: 'u1' } });
  read.mockResolvedValue({ kind: 'back', url: 'https://claude.ai/api/mcp/auth_callback?code=again' });
  await open();
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=again'));

  read.mockRejectedValue(new Error('gone'));
  await open('old');
  expect(await screen.findByRole('header', { name: CONSENT_COPY.gone })).toBeOnTheScreen();
});
