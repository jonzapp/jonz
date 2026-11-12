import { humanError, type AppAccess } from '@app/core';
import type { OAuthAuthorizationDetails, OAuthGrant } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';

import { supabase } from './supabase';
import { callV1 } from './v1';

// Apps people connect to Jonz over MCP, signed in through Supabase's OAuth
// server (docs/specs/operation-registry.md, "MCP"): its consent page here,
// and the list of apps you've let in, each one you can disconnect.

/** What an app is asking, or where to send you back to when you've already said yes. */
export type ConsentAsk = { kind: 'ask'; details: OAuthAuthorizationDetails } | { kind: 'back'; url: string };

export async function readConsent(authorizationId: string): Promise<ConsentAsk> {
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) throw new Error(humanError(error));
  return 'authorization_id' in data ? { kind: 'ask', details: data } : { kind: 'back', url: data.redirect_url };
}

/**
 * Allow (with what the app may do, saved first, so its first call is already
 * held to it) or don't (null): either way, the app's own page to go back to.
 */
export async function answerConsent(authorizationId: string, allow: { clientId: string; access: AppAccess } | null): Promise<string> {
  const options = { skipBrowserRedirect: true };
  if (allow) await setAppAccess(allow.clientId, allow.access);
  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId, options);
  if (error) throw new Error(humanError(error));
  return data.redirect_url;
}

/** The apps you've let in. */
export async function connectedApps(): Promise<OAuthGrant[]> {
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error) throw new Error(humanError(error));
  return data;
}

/** What each app you've let in may do, by its client id; one you never picked for is read only. */
export async function appAccess(): Promise<Record<string, AppAccess>> {
  const rows = await callV1('my_app_access', {});
  return Object.fromEntries(rows.map((r) => [r.clientId, r.access]));
}

/** Changes what an app may do, from its next call. */
export async function setAppAccess(clientId: string, access: AppAccess): Promise<void> {
  await callV1('set_app_access', { clientId, access });
}

/** Signs the app out at once; it has to ask again to come back. */
export async function disconnectApp(clientId: string): Promise<void> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) throw new Error(humanError(error));
}

/** Back to the app that asked: its own page, with Supabase's answer on it. */
export function goBack(url: string): void {
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
}
