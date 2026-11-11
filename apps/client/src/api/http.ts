import { ApiError } from '@app/core';

import { getAccessToken } from './auth';
import { apiBase, ApiRequestError, apiWords, readerHeaders } from './base';

export { apiBase, ApiRequestError };

// Calls to apps/api, for the few moves that need a server (AGENTS.md lists
// them). Everything else goes straight to Supabase through RLS.

/**
 * POSTs to apps/api as the signed-in user (their Supabase access token as a
 * bearer token), and checks the answer against the response's schema from
 * @app/core.
 */
export async function apiPost<T>(path: string, body: unknown, schema: { parse: (value: unknown) => T }): Promise<T> {
  const base = apiBase();
  const token = await getAccessToken();
  if (!token) throw new ApiRequestError(apiWords()('errors.api.signInFirst'), 401);

  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...readerHeaders() },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = ApiError.safeParse(payload);
    throw new ApiRequestError(refusal.success ? refusal.data.error : apiWords()('errors.other'), response.status);
  }
  return schema.parse(payload);
}
