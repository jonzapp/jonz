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
  it('signs in through the API, keeping the session under the name Supabase gave it', () => {
    const { supabase, AUTH_STORAGE_KEY } = load({ EXPO_PUBLIC_API_URL: 'https://api.jonz.app/' });
    expect(authUrl(supabase)).toBe('https://api.jonz.app/auth/v1');
    expect(AUTH_STORAGE_KEY).toBe('sb-abcdefgh-auth-token');
    expect(storageKey(supabase)).toBe('sb-abcdefgh-auth-token');
  });

  it('falls back to Supabase itself on a phone with no API named', () => {
    const { supabase } = load({ EXPO_PUBLIC_API_URL: '' });
    expect(authUrl(supabase)).toBe(`${SUPABASE}/auth/v1`);
  });
});
