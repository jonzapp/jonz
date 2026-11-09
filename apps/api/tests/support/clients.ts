import type { Database } from "@app/core";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

import { poolClient } from "@/lib/db/rest";
import { BECOME_SERVER } from "@/lib/db/scope";

import { ANON_KEY, SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";
import { track } from "./scope";

export type Db = SupabaseClient<Database>;

export interface Actor {
  /** Carries this user's JWT, so every query through it is RLS-constrained. */
  db: Db;
  userId: string;
  name: string;
  /** What they're signed in with. */
  email: string;
}

/** Local-only, and never a real credential: these users live for one test. */
const PASSWORD = "db-tests-not-a-secret";

/**
 * Bypasses RLS. Seeding, driving the engine, reading a row back to check an
 * attack was really blocked, teardown. Never the subject of a test.
 */
export function adminClient(): Db {
  pool ??= postgres(DB_URL, {
    prepare: false,
    max: 2,
    idle_timeout: 1,
    onnotice: () => {},
  });
  return poolClient(pool, BECOME_SERVER, serviceRole);
}

/**
 * The service role as the engine reaches it in production: straight in
 * Postgres, past the Data API (lib/db/rest.ts), so every test that drives the
 * engine checks those queries too. Auth's admin API is still Supabase's.
 */
const DB_URL =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
let pool: postgres.Sql | null = null;

function serviceRole(): Db {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A signed-in housemate. Production sign-in is Google-only and a consent
 * screen cannot be driven from a test, so the session is minted out of band:
 * a confirmed user from the admin API, then a real password sign-in. The JWT
 * that comes back is the same shape RLS sees in production.
 */
export async function signedInUser(name: string): Promise<Actor> {
  const email = `db-${randomUUID()}@test.local`;
  const { data, error } = await serviceRole().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  const userId = data.user.id;
  track.user(userId);

  const db = freshClient();
  const { error: signInError } = await db.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { db, userId, name, email };
}

/** Signed out: the `anon` role, no auth.uid() at all. */
export function visitor(): Db {
  return freshClient();
}

function freshClient(): Db {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `db-test-${randomUUID()}`,
    },
  });
}
