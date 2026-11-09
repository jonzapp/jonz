import { FRONT_DOOR_COPY, SIGN_IN_COPY, signInReason } from '@app/core';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { appleSignInAvailable, signInWithApple, signInWithGoogle, signInWithMicrosoft } from '@/api/auth';
import SignIn from '@/app/signin';
import { TAP } from '@/theme';

jest.mock('@/api/email-auth', () => ({}));
jest.mock('@/api/auth', () => ({
  appleSignInAvailable: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithMicrosoft: jest.fn(),
}));

// Apple's button is a native view; a plain button stands in for it.
jest.mock('expo-apple-authentication', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppleAuthenticationButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) =>
      createElement(Pressable, { accessibilityRole: 'button', onPress, testID }, createElement(Text, null, 'Continue with Apple')),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
  };
});

const available = appleSignInAvailable as jest.Mock;
const google = signInWithGoogle as jest.Mock;
const apple = signInWithApple as jest.Mock;
const microsoft = signInWithMicrosoft as jest.Mock;

async function open(url = '/signin') {
  await renderRouter({ signin: SignIn }, { initialUrl: url });
}

beforeEach(() => {
  jest.clearAllMocks();
  available.mockResolvedValue(false);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('sign-in on Android and the web', () => {
  it('offers Google and Microsoft, with the web’s words', async () => {
    await open();
    expect(screen.getByRole('header', { name: SIGN_IN_COPY.heading })).toBeOnTheScreen();
    expect(screen.getByText(signInReason(null))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.google })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.microsoft })).toBeOnTheScreen();
    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    // Production builds never offer the demo house (EXPO_PUBLIC_STAGE is staging's alone).
    expect(screen.queryByTestId('demo-sign-in')).toBeNull();
    expect(screen.queryByTestId('staging-ribbon')).toBeNull();
    expect(screen.getByText(SIGN_IN_COPY.sameAccount)).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: SIGN_IN_COPY.privacy })).toHaveProp('href', '/privacy');
    expect(screen.getByRole('link', { name: SIGN_IN_COPY.termsLink })).toHaveProp('href', '/terms');
  });

  it('signs in with Google, and a closed sheet is no failure', async () => {
    google.mockResolvedValue('cancelled');
    await open();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    expect(google).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.google })).toBeEnabled();
  });

  it('stays busy while the web leaves for Google', async () => {
    google.mockResolvedValue('redirected');
    await open();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    // Busy at once, and says so once the wait shows.
    expect(screen.getByTestId('google-sign-in')).toBeBusy();
    expect(await screen.findByRole('button', { name: SIGN_IN_COPY.googleBusy })).toBeDisabled();
  });

  it('says so when Google fails, and lets you try again', async () => {
    google.mockRejectedValue(new Error('DEVELOPER_ERROR'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.failed('Google'));
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.google })).toBeEnabled();
  });

  it('says so when the web comes back with an error, without guessing whose', async () => {
    await open('/signin?error=access_denied');
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.returnFailed);
  });

  it('signs in with Microsoft, staying busy while the web leaves for it', async () => {
    microsoft.mockResolvedValue('redirected');
    await open('/signin?next=%2Fhouse%2Fnew');
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.microsoft }));
    expect(microsoft).toHaveBeenCalledWith('/signin?next=%2Fhouse%2Fnew');
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.google })).toBeDisabled();
    expect(await screen.findByRole('button', { name: SIGN_IN_COPY.microsoftBusy })).toBeDisabled();
  });

  it('says so when Microsoft fails, and lets you try again', async () => {
    microsoft.mockRejectedValue(new Error('provider is not enabled'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.microsoft }));
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.failed('Microsoft'));
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.microsoft })).toBeEnabled();
  });

  it('sets the page on the taped sign, with the small print under it', async () => {
    await open();
    expect(screen.getByTestId('hazard-tape', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText(SIGN_IN_COPY.terms)).toBeOnTheScreen();
    // The links are the same size as the line they follow.
    for (const label of [SIGN_IN_COPY.terms, SIGN_IN_COPY.privacy, SIGN_IN_COPY.termsLink]) {
      expect(screen.getByText(label)).toHaveStyle({ fontSize: 14 });
    }
    const home = screen.getByRole('link', { name: 'Jonz' });
    expect(home).toHaveProp('href', '/');
    expect(home).toHaveStyle({ minHeight: TAP });
  });
});

describe("the front door's choice", () => {
  it('says where starting a house leads, and Google brings the web back carrying it', async () => {
    google.mockResolvedValue('redirected');
    await open('/signin?next=%2Fhouse%2Fnew');
    expect(screen.getByText(FRONT_DOOR_COPY.startReason)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    expect(google).toHaveBeenCalledWith('/signin?next=%2Fhouse%2Fnew');
  });

  it('says where an invite leads, and Google brings the web back carrying it', async () => {
    google.mockResolvedValue('redirected');
    await open('/signin?next=%2Fwelcome');
    expect(screen.getByText(FRONT_DOOR_COPY.inviteReason)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    expect(google).toHaveBeenCalledWith('/signin?next=%2Fwelcome');
  });

  it('says so when the web is turned back, and keeps the choice', async () => {
    google.mockResolvedValue('redirected');
    await open('/signin?next=%2Fhouse%2Fnew&error=access_denied&error_description=denied');
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.returnFailed);
    expect(screen.getByText(FRONT_DOOR_COPY.startReason)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
    expect(google).toHaveBeenCalledWith('/signin?next=%2Fhouse%2Fnew');
  });

  it.each(['%2F%2Fevil.example', 'https%3A%2F%2Fevil.example', '%2Fsignin', '%2Ftoday'])(
    'never sends the web off the site, or anywhere but sign-in (next=%s)',
    async (next) => {
      google.mockResolvedValue('redirected');
      await open(`/signin?next=${next}`);
      expect(screen.getByText(signInReason(null))).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_COPY.google }));
      expect(google).toHaveBeenCalledWith('/signin');
    },
  );
});

describe('sign-in on iOS', () => {
  beforeEach(() => available.mockResolvedValue(true));

  it('offers Apple first, and warns that a second account starts with no house', async () => {
    await open();
    expect(await screen.findByTestId('apple-sign-in')).toBeOnTheScreen();
    expect(screen.getByText(SIGN_IN_COPY.eitherAccount)).toBeOnTheScreen();
    expect(screen.getByText(SIGN_IN_COPY.sameAccount)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SIGN_IN_COPY.google })).toBeOnTheScreen();
  });

  it('keeps the warning when the front door sent you, since a new house stays with the account chosen', async () => {
    await open('/signin?next=%2Fhouse%2Fnew');
    expect(await screen.findByTestId('apple-sign-in')).toBeOnTheScreen();
    expect(screen.getByText(SIGN_IN_COPY.eitherAccount)).toBeOnTheScreen();
    expect(screen.queryByText(FRONT_DOOR_COPY.startReason)).not.toBeOnTheScreen();
  });

  it('signs in with Apple, and names Apple when it fails', async () => {
    apple.mockRejectedValue(new Error('invalid nonce'));
    await open();
    await act(async () => {
      fireEvent.press(await screen.findByTestId('apple-sign-in'));
    });
    expect(apple).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.failed('Apple'));
  });
});
