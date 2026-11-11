import { humanError, OPERATION_IO, pathKeys, type OperationName } from '@app/core';
import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { z } from 'zod';

import { apiBase, ApiRequestError, apiWords, readerHeaders } from './base';
import { supabase } from './supabase';
import { markTooOld } from './too-old';

// The app's one way to the data: /v1 (docs/specs/api.md), one operation at a
// time, by its name in the registry. Method, path, input and answer all come
// from OPERATION_IO in @app/core, the same contract /v1 and MCP serve, so the
// app can't drift from the API. On the web the page's own origin passes /v1
// on to apps/api (vercel.json), as it does /api.

type Io = typeof OPERATION_IO;
export type V1Input<N extends OperationName> = z.input<Io[N]['input']>;
export type V1Output<N extends OperationName> = z.output<Io[N]['output']>;

/** What the API's problem says, as a sentence fit to show. */
export function problemSentence(problem: { title?: unknown; detail?: unknown } | null): string {
  const words = apiWords();
  const generic = words('errors.other');
  const detail = typeof problem?.detail === 'string' ? problem.detail : '';
  // A database function's refusal word ("vote_closed") has the app's own sentence.
  const known = humanError({ message: detail }, words);
  if (known !== generic) return known;
  if (problem?.title === 'forbidden') return words('errors.denied');
  // A word we have no sentence for, or the API's own "on our side": the general one.
  if (!detail || /^[a-z][a-z_]*$/.test(detail) || problem?.title === 'internal') return generic;
  return detail;
}

/** `ios/1.4.2 (57)`: which app this is, for the version gate. */
export function clientHeader(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? '0.0.0';
  const build = Platform.OS === 'ios' ? Number(config?.ios?.buildNumber) : Platform.OS === 'android' ? config?.android?.versionCode : undefined;
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  return Number.isFinite(build) ? `${platform}/${version} (${build})` : `${platform}/${version}`;
}

/** The operation's URL, method and body, from its route: path keys into the path, a GET's other set inputs into the query. */
export function v1Request(name: OperationName, input: Record<string, unknown>): { method: string; url: string; body?: string } {
  const route = OPERATION_IO[name].http;
  const [method, template] = route.split(' ') as [string, string];
  const rest = { ...input };
  for (const key of pathKeys(route)) delete rest[key];
  const path = template.replace(/\{([A-Za-z]+)\}/g, (_, key: string) => encodeURIComponent(String(input[key])));
  const fields = Object.entries(rest).filter(([, v]) => v !== undefined);
  if (method === 'GET') {
    // A query has no null: a filter left empty is left out, which its schema takes as none.
    const query = new URLSearchParams();
    for (const [key, value] of fields) {
      if (value === null) continue;
      for (const one of Array.isArray(value) ? value : [value]) query.append(key, String(one));
    }
    const qs = query.toString();
    return { method, url: `${apiBase()}${path}${qs ? `?${qs}` : ''}` };
  }
  return { method, url: `${apiBase()}${path}`, body: JSON.stringify(Object.fromEntries(fields)) };
}

/**
 * Runs one operation on /v1 as the signed-in person, and answers its output,
 * checked against the contract. A refusal throws ApiRequestError with a
 * sentence to show. Each write carries its own Idempotency-Key, so a retry
 * of the same call can't do it twice.
 */
export async function callV1<N extends OperationName>(name: N, input: V1Input<N>): Promise<V1Output<N>> {
  const io = OPERATION_IO[name];
  const checked = io.input.parse(input) as Record<string, unknown>;
  // The session straight from Supabase Auth, not auth.ts: a call needs no sign-in modules.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(apiWords()('errors.api.signInFirst'), 401);

  const { method, url, body } = v1Request(name, checked);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Jonz-Client': clientHeader(), ...readerHeaders() };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = randomUUID();
  }
  const response = await fetch(url, { method, headers, body });
  const payload: unknown = await response.json().catch(() => null);
  // 426: this phone's build is older than the API takes; the app turns to Update Jonz.
  if (response.status === 426) markTooOld();
  if (!response.ok) throw new ApiRequestError(problemSentence(payload as { title?: unknown; detail?: unknown } | null), response.status);
  return io.output.parse(payload) as V1Output<N>;
}
