import "server-only";

import type { Database } from "@app/core";
import { createClient } from "@supabase/supabase-js";

import { serverDbFromPool, serverDbInOperation } from "@/lib/db/scope";

/** Supabase Auth's admin API and Storage, which stay Supabase's (only the Data API goes). */
function services() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The service role. It bypasses RLS, so it is for the engine (lib/engine)
 * and nothing that a request can steer: every caller decides which house it
 * is working on from a row it has already read through the user's own
 * session, or from the cron tick.
 *
 * Its tables and functions are reached straight in Postgres
 * (lib/db/scope.ts): in a /v1 operation's own transaction, or else from the
 * API's pool. Only with no API_DATABASE_URL (a local setup without one) does
 * it go through the Data API.
 */
export function createAdminClient() {
  return (
    serverDbInOperation(services) ?? serverDbFromPool(services) ?? services()
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;
