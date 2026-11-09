// Sign-in on our own address (docs/specs/api.md, C3): the auth client talks
// to the API, which passes each request on to Supabase Auth, while the
// session stays under Supabase's own name so nobody is signed out.

jest.mock('./storage', () => ({ authStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

const SUPABASE = 'https://abcdefgh.supabase.co';

function load(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, { EXPO_PUBLIC_SUPABASE_URL: SUPABASE, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'anon', ...env });
  let mod: typeof import('./supabase') | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<typeof import('./supabase')>('./supabase');
  });
  process.env = saved;
  return mod!;
}

/** Where the auth client sends a request (GoTrueClient keeps it as `url`). */
const authUrl = (client: unknown) => (client as { auth: { url: string } }).auth.url;
const storageKey = (client: unknown) => (client as { auth: { storageKey: string } }).auth.storageKey;

describe('the Supabase client', () => {
  it("talks to Supabase itself until sign-in moves to the API, and live updates ride the same client", () => {
    const { supabase, live, authThroughApi } = load({ EXPO_PUBLIC_AUTH_THROUGH_API: '', EXPO_PUBLIC_API_URL: 'https://api.jonz.app' });
    expect(authThroughApi).toBe(false);
    expect(authUrl(supabase)).toBe(`${SUPABASE}/auth/v1`);
    expect(live).toBe(supabase);
  });

  it('signs in through the API once switched on, keeping the session where it was', () => {
    const before = load({ EXPO_PUBLIC_AUTH_THROUGH_API: '' });
    const { supabase, live, AUTH_STORAGE_KEY } = load({ EXPO_PUBLIC_AUTH_THROUGH_API: '1', EXPO_PUBLIC_API_URL: 'https://api.jonz.app/' });
    expect(authUrl(supabase)).toBe('https://api.jonz.app/auth/v1');
    expect(AUTH_STORAGE_KEY).toBe('sb-abcdefgh-auth-token');
    expect(storageKey(supabase)).toBe(storageKey(before.supabase));
    // Live updates stay on Supabase's Realtime, with the signed-in person's token.
    expect(live).not.toBe(supabase);
    expect((live as unknown as { realtimeUrl: URL | string }).realtimeUrl.toString()).toContain('abcdefgh.supabase.co');
  });
});
