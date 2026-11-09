import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { callV1 } from './v1';

// Microsoft hands Supabase no photo, as Google does, so right after a
// Microsoft sign-in, while the session still carries Microsoft's token, the
// app asks Microsoft Graph for it and keeps a copy in the public `avatars`
// bucket, under your own folder. set_my_photo points your profile at it,
// and housemates see it wherever your initials would be. An account with no
// photo, or a token Graph won't take, leaves the initials.

const GRAPH = 'https://graph.microsoft.com/v1.0/me';
/** 240 is plenty for a 32 plate at 3x; not every account has the sizes, so then the original. */
const SOURCES = [`${GRAPH}/photos/240x240/$value`, `${GRAPH}/photo/$value`];

/** Tokens already used, so a session announced twice fetches once. */
const tried = new Set<string>();

/** Signed in with Microsoft and with no other account that brings a photo along. */
export function wantsMicrosoftPhoto(session: Session): boolean {
  const identities = session.user.identities ?? [];
  if (!identities.some((identity) => identity.provider === 'azure')) return false;
  return !identities.some((identity) => identity.identity_data?.avatar_url || identity.identity_data?.picture);
}

/**
 * Copy the Microsoft account's photo to your profile. `token` is Microsoft's
 * access token: the session's own on the web, from the return address on
 * iOS and Android. Never throws: a photo is a nicety, never a reason a
 * sign-in fails.
 */
export async function keepMicrosoftPhoto(session: Session, token = session.provider_token): Promise<void> {
  if (!token || tried.has(token) || !wantsMicrosoftPhoto(session)) return;
  tried.add(token);
  try {
    let photo: Response | null = null;
    for (const source of SOURCES) {
      const response = await fetch(source, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) {
        photo = response;
        break;
      }
    }
    if (!photo) return;

    const png = photo.headers.get('content-type')?.includes('png') ?? false;
    const path = `${session.user.id}/microsoft.${png ? 'png' : 'jpg'}`;
    const bytes = await photo.arrayBuffer();
    const bucket = supabase.storage.from('avatars');
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: png ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    if (uploadError) throw uploadError;
    // A new address each time, so nobody is shown the old photo from a cache.
    const address = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    await callV1('set_my_photo', { photo: address });
  } catch (reason) {
    console.warn('Keeping the Microsoft photo failed', reason);
  }
}

/**
 * The web comes back from Microsoft to a page that signs itself in, so the
 * photo follows the sign-in as Supabase announces it. Returns an
 * unsubscribe function.
 */
export function followMicrosoftSignIns(): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) void keepMicrosoftPhoto(session);
  });
  return () => data.subscription.unsubscribe();
}
