import 'react-native-url-polyfill/auto';

import type { Database } from '@app/core';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in.',
  );
}

/**
 * Sign-in on our own address (docs/specs/api.md, C3): the auth client talks
 * to apps/api's /auth/v1, which passes each request to Supabase Auth, so the
 * app never talks to Supabase. The API's address (EXPO_PUBLIC_API_URL), or on
 * the web the page's own origin, which passes /auth/v1 on.
 */
function authBase(): string {
  const api = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (api) return api;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return url!;
}

/**
 * Where the session is kept: Supabase's own name for it, from its address,
 * whichever address the client talks to, so nobody is signed out when sign-in
 * moves to ours.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

// Only the public URL and publishable key belong in the app. Row Level Security protects the data.
export const supabase = createClient<Database>(authBase(), publishableKey, {
  auth: {
    storage: authStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    // The web signs in through a redirect; PKCE keeps the tokens out of the URL.
    flowType: Platform.OS === 'web' ? 'pkce' : 'implicit',
  },
});

// On iOS and Android, only refresh the session while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
