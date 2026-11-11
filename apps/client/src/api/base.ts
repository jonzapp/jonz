import { wordsFor, type HouseKind, type Language, type Words } from '@app/core';
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

let reader: { language: Language; kind: HouseKind } = { language: 'en', kind: 'housemates' };

/**
 * Who's reading what the API says back: your language and your house's
 * kind, kept by MembershipProvider. A call sends the language as
 * Accept-Language, so a sentence the API writes is in it too.
 */
export function setApiReader(language: Language, kind: HouseKind): void {
  reader = { language, kind };
}

/** Your words, for a refusal's sentence outside a screen. */
export function apiWords(): Words {
  return wordsFor(reader.language, reader.kind);
}

/** The headers that tell the API who's reading. */
export function readerHeaders(): Record<string, string> {
  return { 'Accept-Language': reader.language };
}

/** A refusal from the API, with a sentence fit to show. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * /v1 names every key in camelCase, inside stored JSON too. A record whose
 * keys are its columns' own names (an audit diff, a History move's details)
 * gets them back with this: one level, the values left as they are.
 */
export const snakeKeys = (value: unknown): unknown =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]))
    : value;
