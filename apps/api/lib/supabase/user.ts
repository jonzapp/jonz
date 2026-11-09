import type { Database } from "@app/core";
import { createClient } from "@supabase/supabase-js";

import { personDb } from "@/lib/db/scope";
import { env } from "@/lib/env";

/**
 * Acts as the person whose access token a request carries, so Row Level
 * Security applies exactly as it does in the app: what the API reads or
 * writes through this, they could have read or written themselves.
 *
 * Inside a /v1 operation its tables and functions are reached straight in
 * Postgres, in the operation's own transaction as that person
 * (lib/db/scope.ts); Supabase Auth and Storage are still Supabase's.
 */
export function userClient(accessToken: string) {
  const services = () =>
    createClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  return personDb(services) ?? services();
}

export type UserClient = ReturnType<typeof userClient>;
