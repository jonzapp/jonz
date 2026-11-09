// The database, reached the way PostgREST reaches it, but from our own server:
// each request runs in one transaction as the signed-in person (role
// `authenticated` plus their token's claims), so Row Level Security and can()
// decide exactly as they do for the app today. The API's own bookkeeping
// (audit rows, idempotency keys, rate limits) runs as the API's role, which
// people can never become.

import postgres from "postgres";

import type { Claims } from "./auth";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * One pool per instance. `prepare: false` because Supabase's transaction
 * pooler (Supavisor) hands each transaction to any server connection.
 */
export function connect(url: string, max = 10): Sql {
  return postgres(url, { prepare: false, max, idle_timeout: 20, connection: { application_name: "jonz-api" } });
}

/** Becomes the signed-in person for the rest of the transaction: role `authenticated` plus their claims. */
export async function becomePerson(tx: Tx, claims: Claims): Promise<void> {
  await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
}

/** Back to the API's own role, for its bookkeeping, later in the same transaction. */
export async function becomeApi(tx: Tx): Promise<void> {
  await tx`select set_config('role', 'none', true), set_config('request.jwt.claims', '', true)`;
}

/** What a database function takes and gives back, read once from the catalog (as PostgREST's schema cache does). */
export interface Signature {
  args: Record<string, string>;
  returnsSet: boolean;
  returnsVoid: boolean;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function signatures(sql: Sql) {
  const cache = new Map<string, Promise<Signature>>();
  return (name: string): Promise<Signature> => {
    if (!IDENT.test(name)) return Promise.reject(new Error(`Not a function name: ${name}`));
    let found = cache.get(name);
    if (!found) {
      found = (async () => {
        const rows = await sql<{ arg_names: string[] | null; arg_types: string[]; returns_set: boolean; return_type: string }[]>`
          select p.proargnames as arg_names,
                 array(select format_type(t, null) from unnest(p.proargtypes) t) as arg_types,
                 p.proretset as returns_set,
                 format_type(p.prorettype, null) as return_type
          from pg_proc p
          where p.proname = ${name} and p.pronamespace = 'public'::regnamespace`;
        if (rows.length !== 1) throw new Error(`Expected one public.${name}, found ${rows.length}`);
        const [row] = rows;
        const args = Object.fromEntries((row.arg_names ?? []).slice(0, row.arg_types.length).map((n, i) => [n, row.arg_types[i]]));
        return { args, returnsSet: row.returns_set, returnsVoid: row.return_type === "void" };
      })();
      found.catch(() => cache.delete(name));
      cache.set(name, found);
    }
    return found;
  };
}

/** How one argument is bound: as text, cast on the server to the function's own type. */
function bind(type: string, index: number): string {
  if (type.endsWith("[]")) return `array(select jsonb_array_elements_text($${index}::jsonb)::${type.slice(0, -2)})`;
  if (type === "json" || type === "jsonb") return `$${index}::${type}`;
  return `$${index}::${type}`;
}

/**
 * A JSON or array argument goes as the value itself: the driver sees the
 * parameter is jsonb (from its cast) and encodes it once. Anything else goes
 * as text.
 */
function value(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (type.endsWith("[]") || type === "json" || type === "jsonb") return v;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** Calls public.<name> with named arguments and returns its result as JSON. */
export async function callFunction(tx: Tx, signature: Signature, name: string, args: Record<string, unknown>): Promise<unknown> {
  const names = Object.keys(args).filter((a) => args[a] !== undefined);
  for (const a of names) {
    if (!(a in signature.args)) throw new Error(`public.${name} has no argument ${a}`);
  }
  const call = `public.${name}(${names.map((a, i) => `${a} => ${bind(signature.args[a], i + 1)}`).join(", ")})`;
  const params = names.map((a) => value(signature.args[a], args[a])) as postgres.ParameterOrJSON<never>[];
  const query = signature.returnsVoid
    ? `select null::jsonb as r from (select ${call}) _`
    : signature.returnsSet
      ? `select coalesce(jsonb_agg(t), '[]'::jsonb) as r from ${call} t`
      : `select to_jsonb(${call}) as r`;
  const [row] = await tx.unsafe<{ r: unknown }[]>(query, params);
  return row.r;
}
