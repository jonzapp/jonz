import type { User } from "@supabase/supabase-js";

import { error, wordsOf } from "@/lib/respond";
import { userClient, type UserClient } from "@/lib/supabase/user";

// The native app signs in with Supabase and sends its access token on every
// call; there are no cookies on a phone. (The web's pages keep their cookie
// sessions: proxy.ts.)

/** The token from an `Authorization: Bearer <token>` header. */
export function getBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Checks the caller's Supabase access token with Supabase itself. Returns the
 * user and a client that acts as them, or a 401 to return as it is.
 */
export async function requireUser(
  request: Request,
): Promise<{ user: User; supabase: UserClient } | { response: Response }> {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) return { response: error(request, 401, wordsOf(request)("errors.api.signInFirst")) };

  const supabase = userClient(token);
  const { data, error: authError } = await supabase.auth.getUser(token);
  if (authError || !data.user) return { response: error(request, 401, wordsOf(request)("errors.api.signInExpired")) };

  return { user: data.user, supabase };
}
