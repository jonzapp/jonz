import { Platform } from 'react-native';

// Kept apart from http.ts, which signs requests in, so a call that needs no
// sign-in (the notices) doesn't load the sign-in modules.

/**
 * Where apps/api answers. Unset on the web, it's the page's own origin:
 * jonz.app passes /api/* and /v1/* on to apps/api (apps/client/vercel.json), so
 * the browser needs no CORS. A phone has no origin, so there it must be set.
 */
export function apiBase(): string {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (base) return base;
  if (Platform.OS === 'web') return '';
  throw new Error('Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env.local and fill it in.');
}
