import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { appleSignInAvailable, signInWithApple, signInWithGoogle, signOut } from './auth';
import { supabase } from './supabase';
import { callV1 } from './v1';

jest.mock('./supabase', () => ({ supabase: { auth: { signInWithIdToken: jest.fn(), signOut: jest.fn() } } }));
jest.mock('./v1', () => ({ callV1: jest.fn() }));

jest.mock('./nonce', () => ({
  appleNonce: jest.fn(async () => ({ raw: 'raw-nonce', hashed: 'hashed-nonce' })),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(), signIn: jest.fn(), signOut: jest.fn() },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
  isSuccessResponse: (response: { type: string }) => response.type === 'success',
  isErrorWithCode: (error: unknown) => typeof (error as { code?: unknown })?.code === 'string',
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

type MockGoogle = Record<'configure' | 'hasPlayServices' | 'signIn' | 'signOut', jest.Mock>;

const auth = supabase.auth as unknown as { signInWithIdToken: jest.Mock; signOut: jest.Mock };
const google = GoogleSignin as unknown as MockGoogle;
const apple = AppleAuthentication as unknown as Record<'isAvailableAsync' | 'signInAsync', jest.Mock>;
const nameWrite = callV1 as jest.Mock;

const WEB = 'web-123.apps.googleusercontent.com';
const IOS = 'ios-456.apps.googleusercontent.com';

beforeAll(() => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = WEB;
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = IOS;
});

beforeEach(() => {
  jest.clearAllMocks();
  auth.signInWithIdToken.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  nameWrite.mockResolvedValue(null);
});

/** google.ts loaded afresh, unconfigured, with its own mocks to inspect. */
function freshGoogle() {
  let fresh!: typeof import('./google') & {
    GoogleSignin: MockGoogle;
    supabase: { auth: { signInWithIdToken: jest.Mock } };
  };
  jest.isolateModules(() => {
    fresh = {
      ...jest.requireActual<typeof import('./google')>('./google'),
      GoogleSignin: jest.requireMock<{ GoogleSignin: MockGoogle }>('@react-native-google-signin/google-signin').GoogleSignin,
      supabase: jest.requireMock<{ supabase: { auth: { signInWithIdToken: jest.Mock } } }>('./supabase').supabase,
    };
  });
  return fresh;
}

const credential = (overrides: object = {}) => ({
  identityToken: 'apple-id-token',
  fullName: { givenName: 'Priya', middleName: null, familyName: 'Shah' },
  ...overrides,
});

describe('signInWithGoogle (iOS and Android)', () => {
  it("hands Google's ID token to Supabase", async () => {
    google.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } });
    await expect(signInWithGoogle()).resolves.toBe('signed-in');
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-id-token' });
  });

  it('configures Google once, however many times you sign in', async () => {
    const fresh = freshGoogle();
    fresh.GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } });
    fresh.supabase.auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    await fresh.signInWithGoogle();
    await fresh.signInWithGoogle();
    expect(fresh.GoogleSignin.configure).toHaveBeenCalledTimes(1);
    expect(fresh.GoogleSignin.configure).toHaveBeenCalledWith({ webClientId: WEB, iosClientId: IOS });
  });

  it('treats closing the sheet, or a second tap, as cancelled rather than failed', async () => {
    google.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    await expect(signInWithGoogle()).resolves.toBe('cancelled');
    google.signIn.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    await expect(signInWithGoogle()).resolves.toBe('cancelled');
    google.signIn.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'IN_PROGRESS' }));
    await expect(signInWithGoogle()).resolves.toBe('cancelled');
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('fails when Google, or Supabase, says no', async () => {
    google.signIn.mockRejectedValueOnce(Object.assign(new Error('no play services'), { code: 'PLAY_SERVICES_NOT_AVAILABLE' }));
    await expect(signInWithGoogle()).rejects.toThrow('no play services');

    google.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null } });
    await expect(signInWithGoogle()).rejects.toThrow('Google sent no ID token.');

    google.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'google-id-token' } });
    auth.signInWithIdToken.mockResolvedValueOnce({ data: {}, error: new Error('Unacceptable audience') });
    await expect(signInWithGoogle()).rejects.toThrow('Unacceptable audience');
  });

  it('says which setting is missing from a build without the client IDs', async () => {
    const os = Platform.OS;
    const saved = { web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID };
    try {
      delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      await expect(freshGoogle().signInWithGoogle()).rejects.toThrow('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');

      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = saved.web;
      delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
      Platform.OS = 'ios';
      await expect(freshGoogle().signInWithGoogle()).rejects.toThrow('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');

      // Android signs in with the web client alone.
      Platform.OS = 'android';
      const android = freshGoogle();
      android.GoogleSignin.signIn.mockResolvedValue({ type: 'cancelled', data: null });
      await expect(android.signInWithGoogle()).resolves.toBe('cancelled');
      expect(android.GoogleSignin.configure).toHaveBeenCalledWith({ webClientId: WEB, iosClientId: undefined });
    } finally {
      Platform.OS = os;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = saved.web;
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = saved.ios;
    }
  });
});

describe('signInWithApple', () => {
  it('gives Apple the hashed nonce and Supabase the raw one', async () => {
    apple.signInAsync.mockResolvedValue(credential());
    await expect(signInWithApple()).resolves.toBe('signed-in');
    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'hashed-nonce' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-id-token', nonce: 'raw-nonce' });
  });

  it('keeps the name Apple sends on the first sign-in', async () => {
    apple.signInAsync.mockResolvedValue(credential());
    await signInWithApple();
    expect(nameWrite).toHaveBeenCalledWith('set_my_name', { name: 'Priya Shah' });
  });

  it("leaves the name alone when Apple doesn't send one", async () => {
    apple.signInAsync.mockResolvedValue(credential({ fullName: null }));
    await signInWithApple();
    apple.signInAsync.mockResolvedValue(credential({ fullName: { givenName: null, middleName: null, familyName: null } }));
    await signInWithApple();
    expect(nameWrite).not.toHaveBeenCalled();
  });

  it('still signs you in when the name cannot be kept', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    apple.signInAsync.mockResolvedValue(credential());
    nameWrite.mockRejectedValueOnce(new Error('offline'));
    await expect(signInWithApple()).resolves.toBe('signed-in');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats closing the sheet as cancelled', async () => {
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(signInWithApple()).resolves.toBe('cancelled');
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('fails without a token, or when Supabase refuses it', async () => {
    apple.signInAsync.mockResolvedValueOnce(credential({ identityToken: null }));
    await expect(signInWithApple()).rejects.toThrow('Apple sent no identity token.');
    apple.signInAsync.mockResolvedValueOnce(credential());
    auth.signInWithIdToken.mockResolvedValueOnce({ data: {}, error: new Error('Nonces mismatch') });
    await expect(signInWithApple()).rejects.toThrow('Nonces mismatch');
    expect(nameWrite).not.toHaveBeenCalled();
  });
});

describe('appleSignInAvailable', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
  });

  it('asks the device on iOS', async () => {
    Platform.OS = 'ios';
    apple.isAvailableAsync.mockResolvedValue(true);
    await expect(appleSignInAvailable()).resolves.toBe(true);
  });

  it('is never offered on Android or the web', async () => {
    for (const platform of ['android', 'web'] as const) {
      Platform.OS = platform;
      await expect(appleSignInAvailable()).resolves.toBe(false);
    }
    expect(apple.isAvailableAsync).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('ends the Supabase session and forgets the Google account', async () => {
    await signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(google.signOut).toHaveBeenCalled();
  });

  it('forgets the Google account even when Supabase reports an error, then says so', async () => {
    auth.signOut.mockResolvedValueOnce({ error: new Error('offline') });
    await expect(signOut()).rejects.toThrow('offline');
    expect(google.signOut).toHaveBeenCalled();
  });

  it("doesn't fail when there was no Google account to forget", async () => {
    google.signOut.mockRejectedValueOnce(new Error('not signed in'));
    await expect(signOut()).resolves.toBeUndefined();
  });
});
