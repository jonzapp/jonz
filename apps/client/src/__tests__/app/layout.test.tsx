import { DELETE_COPY, type DeletionStatus } from '@app/core';
import type { Session } from '@supabase/supabase-js';
import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { useState } from 'react';
import { Text } from 'react-native';

import HouseStack, { unstable_settings as houseStackSettings } from '@/app/(house)/house/_layout';
import RootLayout from '@/app/_layout';
import { useMembership } from '@/hooks/use-membership';

// The real root layout and its guard, with stand-in screens.
jest.mock('@/hooks/use-membership', () => ({
  MembershipProvider: ({ children }: { children: React.ReactNode }) => children,
  useMembership: jest.fn(),
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@/api/account', () => ({ keepAccount: jest.fn(), deletionStatus: jest.fn() }));
jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null } })) } } }));
// The router reads its options (the old links' redirects among them) from the
// app's config, which the expo-router plugin fills from app.json in a build.
// Jest's config has none, so hand it app.json's.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const app = jest.requireActual('../../../app.json');
  const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-router');
  const constants = new Proxy(actual.default, {
    get: (target, key) => (key === 'expoConfig' ? { ...target.expoConfig, extra: { router: plugin[1] } } : target[key]),
  });
  return { __esModule: true, ...actual, default: constants };
});

const routes = {
  _layout: RootLayout,
  index: () => <Text>Front door</Text>,
  signin: () => <Text>Sign in</Text>,
  welcome: () => <Text>Welcome</Text>,
  'house/new': () => <Text>New house</Text>,
  '(house)/_layout': () => <Slot />,
  '(house)/today': () => <Text>Today</Text>,
  '(house)/week': () => <Text>Week</Text>,
  // As the module is, so the anchor under a page opened from a link applies.
  '(house)/house/_layout': { default: HouseStack, unstable_settings: houseStackSettings },
  '(house)/house/index': () => <Text>House</Text>,
  '(house)/house/wall': () => <Text>Wall</Text>,
  '(house)/house/stake': () => <Text>Stake</Text>,
  '(house)/house/people/[userId]': () => <Text>Housemate</Text>,
  'join/[joinCode]': () => <Text>Join</Text>,
  privacy: () => <Text>Privacy</Text>,
  terms: () => <Text>Terms</Text>,
  delete: () => <Text>Delete</Text>,
  '+not-found': () => <Text>Nothing here</Text>,
};

const SESSION = { user: { id: 'user-1' } } as Session;
const FLAT = { id: 'h1', name: 'Flat 3' };
const refresh = jest.fn();

function as(
  session: Session | null,
  house: typeof FLAT | null = null,
  state: { loading?: boolean; failed?: boolean; deletion?: DeletionStatus } = {},
) {
  (useMembership as jest.Mock).mockReturnValue({ session, house, loading: false, failed: false, refresh, ...state });
}

async function open(url: string) {
  await renderRouter(routes, { initialUrl: url });
}

describe('signed out', () => {
  beforeEach(() => as(null));

  it('opens on the front door', async () => {
    await open('/');
    expect(screen.getByText('Front door')).toBeOnTheScreen();
  });

  it('sends every signed-in screen to sign-in', async () => {
    for (const url of ['/today', '/week', '/house', '/house/wall', '/house/people/user-2', '/wall', '/welcome', '/house/new']) {
      await open(url);
      expect(screen).toHavePathname('/signin');
    }
  });

  it('keeps a link to starting a house or the invite through sign-in, as the front door does', async () => {
    for (const [url, next] of [
      ['/house/new', '/house/new'],
      ['/welcome', '/welcome'],
    ]) {
      await open(url);
      expect(screen).toHavePathname('/signin');
      expect(screen).toHaveSearchParams({ next });
    }
    await open('/today');
    expect(screen).toHaveSearchParams({});
  });

  it('goes to plain sign-in after signing out, not back to the screen you left', async () => {
    (useMembership as jest.Mock).mockReturnValue({ session: null, signedOut: true, house: null, loading: false, failed: false, refresh });
    for (const url of ['/welcome', '/house/new', '/today']) {
      await open(url);
      expect(screen).toHavePathname('/signin');
      expect(screen).toHaveSearchParams({});
    }
  });

  it('still opens a join link, which signs you in itself', async () => {
    await open('/join/AB3DEF7H');
    expect(screen.getByText('Join')).toBeOnTheScreen();
  });

  it('opens jonz.app/delete, which says to sign in', async () => {
    await open('/delete');
    expect(screen).toHavePathname('/delete');
    expect(screen.getByText('Delete')).toBeOnTheScreen();
  });
});

describe('deleting an account', () => {
  it('comes back to jonz.app/delete from sign-in, house or not', async () => {
    for (const house of [null, FLAT]) {
      as(SESSION, house);
      await open('/signin?next=%2Fdelete');
      expect(screen).toHavePathname('/delete');
      expect(screen.getByText('Delete')).toBeOnTheScreen();
    }
  });

  it('shows an account waiting to be deleted only that, wherever it opens', async () => {
    as(SESSION, FLAT, { deletion: { deleteAfter: '2026-11-29T09:00:00Z', requestedBy: 'self' } });
    for (const url of ['/today', '/house', '/delete', '/join/AB3DEF7H']) {
      await open(url);
      expect(screen.getByTestId('being-deleted')).toBeOnTheScreen();
      expect(screen.getByText(DELETE_COPY.beingDeleted)).toBeOnTheScreen();
      expect(screen.getByText(/It goes for good on Sun 29 Nov\. Until then nothing is gone, and your house still sees you as away\./)).toBeOnTheScreen();
      expect(screen.queryByText('Today')).toBeNull();
    }
  });
});

describe('signed in, in no house', () => {
  beforeEach(() => as(SESSION));

  it('goes to starting or joining a house, from anywhere else', async () => {
    for (const url of ['/', '/signin', '/today', '/week', '/house', '/house/stake', '/stake']) {
      await open(url);
      expect(screen).toHavePathname('/welcome');
    }
  });

  it('can start a house', async () => {
    await open('/house/new');
    expect(screen.getByText('New house')).toBeOnTheScreen();
  });

  it("goes where sign-in's next was carrying you: naming the house, the invite, or a join link", async () => {
    for (const [url, to, text] of [
      ['/signin?next=%2Fhouse%2Fnew', '/house/new', 'New house'],
      ['/signin?next=%2Fwelcome', '/welcome', 'Welcome'],
      ['/signin?next=%2Fjoin%2FAB3DEF7H', '/join/AB3DEF7H', 'Join'],
    ]) {
      await open(url);
      expect(screen).toHavePathname(to);
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('goes to starting or joining a house when next leads anywhere else', async () => {
    for (const url of ['/signin?next=%2Ftoday', '/signin?next=%2Fhouse%2Fstake', '/signin?next=%2F%2Fevil.example']) {
      await open(url);
      expect(screen).toHavePathname('/welcome');
    }
  });

  it('follows next the moment signing in finishes, as it does on a phone', async () => {
    let signIn: () => void = () => undefined;
    (useMembership as jest.Mock).mockImplementation(() => {
      const [session, setSession] = useState<Session | null>(null);
      signIn = () => setSession(SESSION);
      return { session, house: null, loading: false, failed: false, refresh };
    });
    await open('/signin?next=%2Fhouse%2Fnew');
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
    await act(() => signIn());
    expect(screen).toHavePathname('/house/new');
    expect(screen.getByText('New house')).toBeOnTheScreen();
  });
});

describe('in a house', () => {
  beforeEach(() => as(SESSION, FLAT));

  it('goes to Today, from anywhere else', async () => {
    for (const url of ['/', '/signin', '/signin?next=%2Fhouse%2Fnew', '/welcome', '/house/new']) {
      await open(url);
      expect(screen).toHavePathname('/today');
    }
  });

  it("opens the house's other screens, and the pages House pushes", async () => {
    for (const [url, text] of [
      ['/week', 'Week'],
      ['/house', 'House'],
      ['/house/wall', 'Wall'],
      ['/house/people/user-2', 'Housemate'],
    ]) {
      await open(url);
      expect(screen).toHavePathname(url);
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('takes the old Wall, Stake and Table links to their places under House', async () => {
    for (const [url, to, text] of [
      ['/wall', '/house/wall', 'Wall'],
      ['/stake', '/house/stake', 'Stake'],
      ['/table', '/house', 'House'],
    ]) {
      await open(url);
      expect(screen).toHavePathname(to);
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('follows an old link from inside the app into the house already open, never a second one', async () => {
    const app = await renderRouter(routes, { initialUrl: '/today' });
    await act(() => router.push('/wall'));
    expect(screen).toHavePathname('/house/wall');
    expect(screen.getByText('Wall')).toBeOnTheScreen();
    const root = app.getRouterState()?.routes[0].state;
    expect(root?.routes.map((r) => r.name)).toEqual(['(house)']);
  });

  it('still opens a join link, which says you are in a house already', async () => {
    await open('/join/AB3DEF7H');
    expect(screen.getByText('Join')).toBeOnTheScreen();
  });
});

it('shows nothing until the session and its house have been read', async () => {
  as(null, null, { loading: true });
  await open('/today');
  for (const text of ['Front door', 'Sign in', 'Welcome', 'Today']) expect(screen.queryByText(text)).toBeNull();
});

it("offers to try again when the house can't be read", async () => {
  as(SESSION, null, { failed: true });
  await open('/today');
  expect(screen.queryByText('Welcome')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(refresh).toHaveBeenCalled();
});

describe('the pages anyone can open', () => {
  it('shows privacy and the terms signed out, signed in and in a house', async () => {
    for (const [session, house] of [
      [null, null],
      [SESSION, null],
      [SESSION, FLAT],
    ] as const) {
      for (const page of ['Privacy', 'Terms']) {
        as(session, house);
        await open(`/${page.toLowerCase()}`);
        expect(screen.getByText(page)).toBeOnTheScreen();
        expect(screen).toHavePathname(`/${page.toLowerCase()}`);
      }
    }
  });

  it('says there is nothing at a link to nowhere', async () => {
    as(null);
    await open('/nowhere/at-all');
    expect(screen.getByText('Nothing here')).toBeOnTheScreen();
  });
});
