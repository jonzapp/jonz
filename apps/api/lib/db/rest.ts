import type { Database } from "@app/core";
import {
  callFunction,
  functionCall,
  signatures,
  type Signature,
  type Sql,
  type Tx,
} from "@app/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asError, ident, oneRow, readMeta, type Backend, type Meta, type PgError } from "./rest-base";
import { condition, parseLogic, parseSelect, type Filter, type Item, type Order } from "./rest-select";
import { buildQuery, type Write } from "./rest-sql";

// The part of supabase-js's query builder the server uses (`from`, `select`
// with embedded tables, filters, writes, `rpc`), answered straight from
// Postgres instead of through Supabase's Data API (docs/specs/api.md, C4b).
// The Data API goes off in C5; the moves and the engine keep their code.
//
// Each query is one SQL statement that builds its rows as JSON in the
// database, the way PostgREST does, so timestamps, numbers and nulls come
// back in the same shape. Embedded tables are followed by foreign key, read
// once from the catalog: many-to-one is an object (or null), one-to-many an
// array, `!inner` drops the rows with nothing there. Errors come back as
// `{ message, code, details, hint }`, never thrown, as supabase-js does.

export type Db = SupabaseClient<Database>;

class Builder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limits = new Map<string, number>();
  private items: Item[] | null = null;
  private countOnly = false;
  private write: Write | null = null;
  private shape: "many" | "single" | "maybe" = "many";

  constructor(
    private readonly backend: Backend,
    private readonly table: string,
  ) {
    ident(table);
  }

  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}) {
    this.items = parseSelect(columns);
    if (options.head && options.count) this.countOnly = true;
    return this;
  }
  insert(values: unknown) {
    this.write = { kind: "insert", values };
    return this;
  }
  update(values: unknown) {
    this.write = { kind: "update", values };
    return this;
  }
  upsert(
    values: unknown,
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ) {
    this.write = { kind: "upsert", values, ...options };
    return this;
  }
  delete() {
    this.write = { kind: "delete" };
    return this;
  }

  private add(column: string, op: string, value: unknown, negate = false) {
    const dot = column.lastIndexOf(".");
    const on = dot >= 0 && !column.includes("->") ? column.slice(0, dot) : "";
    const name = on ? column.slice(dot + 1) : column;
    this.filters.push({ on, where: condition(name, op, value, negate) });
    return this;
  }
  eq(c: string, v: unknown) {
    return this.add(c, "eq", v);
  }
  neq(c: string, v: unknown) {
    return this.add(c, "neq", v);
  }
  lt(c: string, v: unknown) {
    return this.add(c, "lt", v);
  }
  lte(c: string, v: unknown) {
    return this.add(c, "lte", v);
  }
  gt(c: string, v: unknown) {
    return this.add(c, "gt", v);
  }
  gte(c: string, v: unknown) {
    return this.add(c, "gte", v);
  }
  like(c: string, v: string) {
    return this.add(c, "like", v);
  }
  ilike(c: string, v: string) {
    return this.add(c, "ilike", v);
  }
  is(c: string, v: null | boolean) {
    return this.add(c, "is", v);
  }
  in(c: string, v: readonly unknown[]) {
    return this.add(c, "in", v);
  }
  contains(c: string, v: unknown) {
    return this.add(c, "cs", v);
  }
  containedBy(c: string, v: unknown) {
    return this.add(c, "cd", v);
  }
  overlaps(c: string, v: unknown) {
    return this.add(c, "ov", v);
  }
  not(c: string, op: string, v: unknown) {
    return this.add(c, op, v, true);
  }
  filter(c: string, op: string, v: unknown) {
    return this.add(c, op, v);
  }
  match(values: Record<string, unknown>) {
    for (const [c, v] of Object.entries(values)) this.add(c, "eq", v);
    return this;
  }
  or(
    text: string,
    options: { referencedTable?: string; foreignTable?: string } = {},
  ) {
    this.filters.push({
      on: options.referencedTable ?? options.foreignTable ?? "",
      where: parseLogic(text, "or"),
    });
    return this;
  }
  order(
    column: string,
    options: {
      ascending?: boolean;
      nullsFirst?: boolean;
      referencedTable?: string;
      foreignTable?: string;
    } = {},
  ) {
    const via = /^([a-z_]+)\(([a-z_]+)\)$/.exec(column);
    this.orders.push({
      on: options.referencedTable ?? options.foreignTable ?? "",
      ...(via ? { via: via[1], column: via[2] } : { column }),
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }
  limit(
    n: number,
    options: { referencedTable?: string; foreignTable?: string } = {},
  ) {
    this.limits.set(options.referencedTable ?? options.foreignTable ?? "", n);
    return this;
  }
  single() {
    this.shape = "single";
    return this;
  }
  maybeSingle() {
    this.shape = "maybe";
    return this;
  }

  then<A, B = never>(
    ok?: (value: {
      data: unknown;
      error: PgError | null;
      count: number | null;
    }) => A | PromiseLike<A>,
    fail?: (reason: unknown) => B | PromiseLike<B>,
  ) {
    return this.execute().then(ok, fail);
  }

  private async execute(): Promise<{
    data: unknown;
    error: PgError | null;
    count: number | null;
  }> {
    let text: string;
    let params: unknown[];
    try {
      ({ text, params } = this.build(await this.backend.meta()));
    } catch (e) {
      return { data: null, error: asError(e), count: null };
    }
    let rows: Record<string, unknown>[];
    try {
      rows = await this.backend.run(text, params, this.write !== null);
    } catch (e) {
      return { data: null, error: asError(e), count: null };
    }
    if (this.countOnly)
      return { data: null, error: null, count: Number(rows[0]?.n ?? 0) };
    if (this.write && !this.items)
      return { data: null, error: null, count: null };
    const data = rows.map((r) => r.j);
    if (this.shape === "many") return { data, error: null, count: null };
    return oneRow(data, this.shape === "maybe", `The result contains ${data.length} rows`);
  }

  build(meta: Meta): { text: string; params: unknown[] } {
    const { table, filters, orders, limits, items, countOnly, write } = this;
    return buildQuery({ table, filters, orders, limits, items, countOnly, write }, meta);
  }
}

class RpcCall {
  private shape: "as-is" | "single" | "maybe" = "as-is";
  constructor(
    private readonly backend: Backend,
    private readonly name: string,
    private readonly args: Record<string, unknown>,
  ) {}
  single() {
    this.shape = "single";
    return this;
  }
  maybeSingle() {
    this.shape = "maybe";
    return this;
  }
  then<A, B = never>(
    ok?: (value: {
      data: unknown;
      error: PgError | null;
      count: null;
    }) => A | PromiseLike<A>,
    fail?: (reason: unknown) => B | PromiseLike<B>,
  ) {
    return this.execute().then(ok, fail);
  }
  private async execute(): Promise<{
    data: unknown;
    error: PgError | null;
    count: null;
  }> {
    try {
      const signature = await this.backend.signature(this.name);
      const data = await this.backend.call(
        signature,
        this.name,
        this.args,
        true,
      );
      if (this.shape !== "as-is" && Array.isArray(data)) {
        return oneRow(data, this.shape === "maybe", null);
      }
      return { data, error: null, count: null };
    } catch (e) {
      return { data: null, error: asError(e), count: null };
    }
  }
}

/** The client untyped by the app's schema: for this file's own tests. */
export interface LooseDb {
  from(table: string): Builder;
  rpc(name: string, args?: Record<string, unknown>): RpcCall;
}

/**
 * A supabase-js-shaped client over a backend; the Data API isn't involved.
 * Anything else (`auth`, `storage`) is `services`'s: Supabase Auth and
 * Storage stay where they are.
 */
export function restClient(backend: Backend, services?: () => Db): Db {
  const client = {
    from: (table: string) => new Builder(backend, table),
    rpc: (name: string, args: Record<string, unknown> = {}) =>
      new RpcCall(backend, name, args),
    get auth() {
      if (!services) throw new Error("This client reaches only the database");
      return services().auth;
    },
    get storage() {
      if (!services) throw new Error("This client reaches only the database");
      return services().storage;
    },
  };
  return client as unknown as Db;
}

// --- Backends --------------------------------------------------------------

const metaCache = new WeakMap<object, Promise<Meta>>();
const signatureCache = new WeakMap<
  object,
  (name: string) => Promise<Signature>
>();

function cached<T>(cache: WeakMap<object, T>, key: object, make: () => T): T {
  let found = cache.get(key);
  if (!found) {
    found = make();
    cache.set(key, found);
  }
  return found;
}

let savepoints = 0;

/**
 * What each transaction is running now. A transaction is one connection, and
 * each statement here comes with its own role switch and savepoint around it,
 * so two at once would interleave: one's query could run under the other's
 * role, or release the other's savepoint. They take turns instead.
 */
const turns = new WeakMap<object, Promise<unknown>>();

/** One statement inside `tx`, under a savepoint when a failure mustn't end the transaction. Pipelined: one round trip. */
function inside<T>(
  tx: Tx,
  contained: boolean,
  before: string | null,
  after: string | null,
  work: () => Promise<T>,
): Promise<T> {
  const previous = turns.get(tx) ?? Promise.resolve();
  const mine = previous.then(
    () => alone(tx, contained, before, after, work),
    () => alone(tx, contained, before, after, work),
  );
  turns.set(
    tx,
    mine.catch(() => undefined),
  );
  return mine;
}

async function alone<T>(
  tx: Tx,
  contained: boolean,
  before: string | null,
  after: string | null,
  work: () => Promise<T>,
): Promise<T> {
  savepoints += 1;
  const name = `rest_${savepoints}`;
  // postgres.js sends a query when it's first awaited, so each is sent
  // here, in order, before the next: the savepoint and role, then `work`'s
  // query (sent as `work` starts), then the way back.
  const send = (text: string) => tx.unsafe(text).execute();
  const sent: Promise<unknown>[] = [];
  if (contained) sent.push(send(`savepoint ${name}`));
  if (before) sent.push(send(before));
  let result: Promise<T>;
  try {
    result = work();
  } catch (e) {
    result = Promise.reject(e);
  }
  sent.push(result);
  if (after) sent.push(send(after));
  if (contained) sent.push(send(`release savepoint ${name}`));
  // Every statement settles before this returns, so none is left failing
  // with nobody listening, and the next turn starts on a quiet connection.
  const settled = await Promise.allSettled(sent);
  const failed = settled.find((s) => s.status === "rejected");
  if (!failed) return (settled[sent.indexOf(result)] as PromiseFulfilledResult<T>).value;
  // Back to before the savepoint: the role and claims too, as set_config(…, true) is undone with it.
  if (contained) await tx.unsafe(`rollback to savepoint ${name}`);
  throw (failed as PromiseRejectedResult).reason;
}

/**
 * Reads and writes inside a transaction that has already become someone:
 * the person, in a /v1 handler (RLS applies), or the server's role.
 * `pool` is the connection pool the transaction came from, for the catalog.
 */
export function txClient(
  tx: Tx,
  pool: Sql,
  roles?: { become: string; back: string },
  services?: () => Db,
): Db {
  return restClient(
    {
      // Reads too: a failed read must not end the operation's transaction,
      // as it didn't through supabase-js.
      run: (text, params) =>
        inside(
          tx,
          true,
          roles?.become ?? null,
          roles?.back ?? null,
          () =>
            tx.unsafe(text, params as never[]).execute() as unknown as Promise<
              Record<string, unknown>[]
            >,
        ),
      signature: (name) =>
        cached(signatureCache, pool, () => signatures(pool))(name),
      call: (signature, name, args) =>
        inside(tx, true, roles?.become ?? null, roles?.back ?? null, () =>
          // Sent now, not when awaited, so it goes before the way back.
          functionCall(tx, signature, name, args)
            .execute()
            .then(([row]) => row.r),
        ),
      meta: () => cached(metaCache, pool, () => readMeta(pool)),
    },
    services,
  );
}

/**
 * One statement at a time from the pool, each its own transaction, sent in
 * one go after `become`: the server's role, a visitor's, or a person's.
 * `become` may be worked out first (a person's token checked), once.
 */
export function poolClient(
  pool: Sql,
  become: string | (() => Promise<string>),
  services?: () => Db,
): Db {
  let ready: Promise<string> | null = null;
  const role = () =>
    typeof become === "string" ? Promise.resolve(become) : (ready ??= become());
  return restClient(
    {
      run: async (text, params) => {
        const first = await role();
        const [, rows] = (await pool.begin((tx) => [
          tx.unsafe(first),
          tx.unsafe(text, params as never[]),
        ])) as unknown as [unknown, Record<string, unknown>[]];
        return rows;
      },
      signature: (name) =>
        cached(signatureCache, pool, () => signatures(pool))(name),
      call: async (signature, name, args) => {
        const first = await role();
        return pool.begin(async (tx) => {
          await tx.unsafe(first);
          return callFunction(tx, signature, name, args);
        }) as Promise<unknown>;
      },
      meta: () => cached(metaCache, pool, () => readMeta(pool)),
    },
    services,
  );
}
