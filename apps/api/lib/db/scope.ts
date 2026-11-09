import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { connect, type Claims, type Sql, type Tx } from "@app/server";

import { poolClient, txClient, type Db } from "./rest";

// Where the moves' and the engine's queries go (docs/specs/api.md, C4b).
// Inside a /v1 operation, both the person's client and the server's run in
// that operation's own transaction: the person's as them (RLS applies), the
// server's under Supabase's service role for one statement at a time, then
// back. So everything an operation does commits, or rolls back, together.
// Outside one (the cron tick, Stripe's webhook), the server's client takes
// statements one at a time from its own small pool.

interface Scope {
  tx: Tx;
  pool: Sql;
  claims: Claims;
  person?: Db;
  server?: Db;
}

const scope = new AsyncLocalStorage<Scope>();

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The server's role: past RLS, as the service-role key was. */
export const BECOME_SERVER =
  "select set_config('role', 'service_role', true), set_config('request.jwt.claims', '', true)";
const becomePerson = (claims: Claims) =>
  `select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${quote(JSON.stringify(claims))}, true)`;

/** Runs `work` with the operation's transaction as where the clients' queries go. */
export function inOperation<T>(
  tx: Tx,
  pool: Sql,
  claims: Claims,
  work: () => Promise<T>,
): Promise<T> {
  return scope.run({ tx, pool, claims }, work);
}

/** The person's client inside an operation, or null outside one. */
export function personDb(services?: () => Db): Db | null {
  const s = scope.getStore();
  if (!s) return null;
  s.person ??= txClient(s.tx, s.pool, undefined, services);
  return s.person;
}

/** The server's client inside an operation (same transaction), or null outside one. */
export function serverDbInOperation(services?: () => Db): Db | null {
  const s = scope.getStore();
  if (!s) return null;
  s.server ??= txClient(
    s.tx,
    s.pool,
    { become: BECOME_SERVER, back: becomePerson(s.claims) },
    services,
  );
  return s.server;
}

let pool: Sql | null = null;

/** The server's client outside an operation, from API_DATABASE_URL; null when that isn't set. */
export function serverDbFromPool(services?: () => Db): Db | null {
  const url = process.env.API_DATABASE_URL;
  if (!url) return null;
  pool ??= connect(url, 3);
  return poolClient(pool, BECOME_SERVER, services);
}
