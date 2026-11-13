import type { Signature, Sql, Tx } from "@app/server";

// What the rest client is built on: a backend to run statements, the
// catalog it reads once, and how names, text and errors are written.

/** Runs one statement. `contained`: a failure mustn't end the transaction it runs in. */
type Run = (
  text: string,
  params: unknown[],
  contained: boolean,
) => Promise<Record<string, unknown>[]>;

export interface Backend {
  run: Run;
  /** A database function's arguments and result, from the catalog. */
  signature: (name: string) => Promise<Signature>;
  /** Calls a database function as `run` would. */
  call: (
    signature: Signature,
    name: string,
    args: Record<string, unknown>,
    contained: boolean,
  ) => Promise<unknown>;
  meta: () => Promise<Meta>;
}

export interface ForeignKey {
  name: string;
  table: string;
  columns: string[];
  target: string;
  targetColumns: string[];
}

export interface Meta {
  keys: ForeignKey[];
  /** Each table's unique column sets (its primary key first). */
  unique: Map<string, string[][]>;
}

export interface PgError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
export const ident = (name: string): string => {
  if (!IDENT.test(name)) throw new Error(`Not a name we read: ${name}`);
  return `"${name}"`;
};
export const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The answer when one row was asked for: the row, nothing (if that's allowed), or PostgREST's own refusal. */
export function oneRow(data: unknown[], maybe: boolean, details: string | null) {
  if (data.length === 1) return { data: data[0], error: null, count: null };
  if (data.length === 0 && maybe) return { data: null, error: null, count: null };
  const error = { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details, hint: null };
  return { data: null, error, count: null };
}

export function asError(e: unknown): PgError {
  const err = e as {
    message?: string;
    code?: string;
    detail?: string;
    hint?: string;
  };
  return {
    message: err.message ?? String(e),
    code: err.code ?? "",
    details: err.detail ?? null,
    hint: err.hint ?? null,
  };
}

// --- The catalog -----------------------------------------------------------

export async function readMeta(sql: Sql | Tx): Promise<Meta> {
  const keys = await sql<ForeignKey[]>`
    select c.conname as name, t.relname as table, f.relname as target,
           array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as columns,
           array(select a.attname::text from unnest(c.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.o) as "targetColumns"
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class f on f.oid = c.confrelid
    where c.contype = 'f' and t.relnamespace = 'public'::regnamespace and f.relnamespace = 'public'::regnamespace`;
  const indexes = await sql<{ table: string; columns: string[] }[]>`
    select t.relname as table,
           array(select a.attname::text from unnest(i.indkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o) as columns
    from pg_index i join pg_class t on t.oid = i.indrelid
    where i.indisunique and i.indpred is null and t.relnamespace = 'public'::regnamespace
    order by i.indisprimary desc`;
  const unique = new Map<string, string[][]>();
  for (const { table, columns } of indexes)
    unique.set(table, [...(unique.get(table) ?? []), columns]);
  return { keys: [...keys], unique };
}
