import type { Database } from "@app/core";
import {
  callFunction,
  signatures,
  type Signature,
  type Sql,
  type Tx,
} from "@app/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Runs one statement. `contained`: a failure mustn't end the transaction it runs in. */
export type Run = (
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

interface ForeignKey {
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
const ident = (name: string): string => {
  if (!IDENT.test(name)) throw new Error(`Not a name we read: ${name}`);
  return `"${name}"`;
};
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

function asError(e: unknown): PgError {
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

// --- Selects ---------------------------------------------------------------

interface Column {
  kind: "column";
  key: string;
  expr: (alias: string) => string;
}
interface Star {
  kind: "star";
}
interface Embed {
  kind: "embed";
  key: string;
  name: string;
  hint: string | null;
  inner: boolean;
  items: Item[];
}
type Item = Column | Star | Embed;

/** Splits on commas outside parentheses and quotes. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth += 1;
    else if (!quoted && ch === ")") depth -= 1;
    else if (!quoted && depth === 0 && ch === ",") {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** `data->>away`, `name::text`: a column, a JSON path into it, a cast. */
function columnExpr(spec: string): {
  key: string;
  expr: (alias: string) => string;
} {
  const [path, cast] = spec.split("::");
  const parts = path.split(/(->>?)/);
  const column = parts[0].trim();
  ident(column);
  let key = column;
  const steps: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i + 1].trim();
    steps.push(`${parts[i]}${/^\d+$/.test(name) ? name : literal(name)}`);
    key = name;
  }
  if (cast) ident(cast.trim());
  return {
    key,
    expr: (alias) =>
      `${cast ? "(" : ""}${alias}.${ident(column)}${steps.join("")}${cast ? `)::${cast.trim()}` : ""}`,
  };
}

export function parseSelect(text: string): Item[] {
  return splitTop(text.replace(/\s+/g, " ")).map((part): Item => {
    if (part === "*") return { kind: "star" };
    const open = part.indexOf("(");
    const colon = part.search(/(?<!:):(?!:)/);
    const alias =
      colon >= 0 && (open < 0 || colon < open)
        ? part.slice(0, colon).trim()
        : null;
    const rest = alias ? part.slice(colon + 1).trim() : part;
    if (open >= 0) {
      const head = rest.slice(0, rest.indexOf("(")).trim();
      const inside = rest.slice(rest.indexOf("(") + 1, rest.lastIndexOf(")"));
      const [name, ...hints] = head.split("!").map((s) => s.trim());
      const inner = hints.includes("inner");
      const hint = hints.find((h) => h !== "inner" && h !== "left") ?? null;
      return {
        kind: "embed",
        key: alias ?? name,
        name,
        hint,
        inner,
        items: parseSelect(inside || "*"),
      };
    }
    const column = columnExpr(rest);
    return { kind: "column", key: alias ?? column.key, expr: column.expr };
  });
}

type Op =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "is"
  | "in"
  | "like"
  | "ilike";
const OPS: Record<Exclude<Op, "is" | "in">, string> = {
  eq: "=",
  neq: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  like: "like",
  ilike: "ilike",
};

interface Filter {
  /** The embedded table it is on (its key, or `a.b` for deeper), or "" for the table itself. */
  on: string;
  where: (alias: string, bind: (v: unknown) => string) => string;
}

/** Postgres's array literal for `in`, each value quoted. */
function arrayLiteral(values: readonly unknown[]): string {
  return `{${values.map((v) => (v === null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

function condition(
  column: string,
  op: string,
  value: unknown,
  negate = false,
): Filter["where"] {
  const { expr } = columnExpr(column);
  return (alias, bind) => {
    const left = expr(alias);
    let sql: string;
    if (op === "is") {
      const v =
        value === null || value === "null"
          ? "null"
          : value === true || value === "true"
            ? "true"
            : value === false || value === "false"
              ? "false"
              : "unknown";
      sql = `${left} is ${v}`;
    } else if (op === "in") {
      sql = `${left} = any(${bind(arrayLiteral(value as unknown[]))})`;
    } else {
      const sym = OPS[op as keyof typeof OPS];
      if (!sym) throw new Error(`Filter ${op} isn't one we read`);
      sql = `${left} ${sym} ${bind(value)}`;
    }
    return negate ? `not (${sql})` : sql;
  };
}

/** PostgREST's filter strings, for `or()`: `a.is.null,and(b.gt.1,c.eq.x)`. */
function parseLogic(text: string, joiner: "or" | "and"): Filter["where"] {
  const parts = splitTop(text).map((part): Filter["where"] => {
    const group = /^(not\.)?(and|or)\((.*)\)$/.exec(part);
    if (group) {
      const inner = parseLogic(group[3], group[2] as "and" | "or");
      return group[1] ? (a, b) => `not (${inner(a, b)})` : inner;
    }
    const match = /^([^.]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(part);
    if (!match) throw new Error(`A filter we can't read: ${part}`);
    const [, column, not, op, raw] = match;
    const unquote = (s: string) =>
      s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
    const value =
      op === "in"
        ? splitTop(raw.replace(/^\(|\)$/g, "")).map(unquote)
        : op === "like" || op === "ilike"
          ? unquote(raw).replace(/\*/g, "%")
          : unquote(raw);
    return condition(column, op, value, Boolean(not));
  });
  return (alias, bind) =>
    `(${parts.map((p) => p(alias, bind)).join(` ${joiner} `)})`;
}

interface Order {
  on: string;
  /** Ordered by a column of a to-one embedded table: `weeks(starts_on)`. */
  via?: string;
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

interface Resolved {
  key: ForeignKey;
  /** The key is on the table we embed into (many-to-one): an object. */
  toOne: boolean;
  table: string;
  join: (parent: string, child: string) => string;
}

function resolve(meta: Meta, from: string, embed: Embed): Resolved {
  const matches = (k: ForeignKey) =>
    !embed.hint || k.name === embed.hint || k.columns.includes(embed.hint);
  const candidates: Resolved[] = [];
  for (const k of meta.keys) {
    if (!matches(k)) continue;
    if (
      k.table === from &&
      (k.target === embed.name ||
        (k.columns.length === 1 && k.columns[0] === embed.name))
    ) {
      candidates.push({
        key: k,
        toOne: true,
        table: k.target,
        join: (p, c) =>
          k.columns
            .map(
              (col, i) =>
                `${c}.${ident(k.targetColumns[i])} = ${p}.${ident(col)}`,
            )
            .join(" and "),
      });
    } else if (k.target === from && k.table === embed.name) {
      const unique = (meta.unique.get(k.table) ?? []).some(
        (cols) =>
          cols.length === k.columns.length &&
          cols.every((c) => k.columns.includes(c)),
      );
      candidates.push({
        key: k,
        toOne: unique,
        table: k.table,
        join: (p, c) =>
          k.columns
            .map(
              (col, i) =>
                `${c}.${ident(col)} = ${p}.${ident(k.targetColumns[i])}`,
            )
            .join(" and "),
      });
    }
  }
  if (candidates.length !== 1) {
    throw Object.assign(
      new Error(
        `Could not embed ${embed.name} in ${from}: ${candidates.length === 0 ? "no relationship" : "more than one relationship"} found`,
      ),
      { code: candidates.length === 0 ? "PGRST200" : "PGRST201" },
    );
  }
  return candidates[0];
}

export class Builder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limits = new Map<string, number>();
  private items: Item[] | null = null;
  private countOnly = false;
  private write: {
    kind: "insert" | "update" | "upsert" | "delete";
    values?: unknown;
    onConflict?: string;
    ignoreDuplicates?: boolean;
  } | null = null;
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
    if (data.length === 1) return { data: data[0], error: null, count: null };
    if (data.length === 0 && this.shape === "maybe")
      return { data: null, error: null, count: null };
    return {
      data: null,
      error: {
        message: "JSON object requested, multiple (or no) rows returned",
        code: "PGRST116",
        details: `The result contains ${data.length} rows`,
        hint: null,
      },
      count: null,
    };
  }

  build(meta: Meta): { text: string; params: unknown[] } {
    const params: unknown[] = [];
    const bind = (v: unknown) => {
      params.push(
        v instanceof Date
          ? v.toISOString()
          : v === null || typeof v !== "object"
            ? v
            : JSON.stringify(v),
      );
      return `$${params.length}`;
    };
    const base = "t0";
    let counter = 0;
    const filtersOn = (on: string, alias: string) =>
      this.filters
        .filter((f) => f.on === on)
        .map((f) => f.where(alias, bind))
        .join(" and ");
    const ordersOn = (
      on: string,
      alias: string,
      table?: string,
      items?: Item[],
    ) =>
      this.orders
        .filter((o) => o.on === on)
        .map((o) => {
          let expr = columnExpr(o.column).expr(alias);
          if (o.via) {
            const embed = items?.find(
              (i): i is Embed => i.kind === "embed" && i.key === o.via,
            );
            if (!embed || !table)
              throw new Error(
                `Can't order by ${o.via}(${o.column}): it isn't embedded`,
              );
            const r = resolve(meta, table, embed);
            if (!r.toOne)
              throw new Error(
                `Can't order by ${o.via}(${o.column}): it's a list`,
              );
            expr = `(select o.${ident(o.column)} from public.${ident(r.table)} o where ${r.join(alias, "o")})`;
          }
          return `${expr} ${o.ascending ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`;
        })
        .join(", ");

    /** The JSON for one row of `table` (as `alias`), with its embedded tables. */
    const project = (
      table: string,
      alias: string,
      items: Item[],
      path: string,
    ): { json: string; inner: string[] } => {
      const inner: string[] = [];
      const pairs: string[] = [];
      let star = false;
      for (const item of items) {
        if (item.kind === "star") star = true;
        else if (item.kind === "column")
          pairs.push(`${literal(item.key)}, ${item.expr(alias)}`);
        else {
          const r = resolve(meta, table, item);
          counter += 1;
          const child = `t${counter}`;
          const here = path ? `${path}.${item.key}` : item.key;
          const sub = project(r.table, child, item.items, here);
          const where = [
            r.join(alias, child),
            filtersOn(here, child),
            ...sub.inner,
          ]
            .filter(Boolean)
            .join(" and ");
          const order = ordersOn(here, child);
          const limit = this.limits.get(here);
          const from = `from public.${ident(r.table)} ${child} where ${where}`;
          pairs.push(
            `${literal(item.key)}, ${
              r.toOne
                ? `(select ${sub.json} ${from} limit 1)`
                : `(select coalesce(jsonb_agg(e.j), '[]'::jsonb) from (select ${sub.json} as j ${from}${order ? ` order by ${order}` : ""}${limit === undefined ? "" : ` limit ${Number(limit)}`}) e)`
            }`,
          );
          if (item.inner) inner.push(`exists (select 1 ${from})`);
        }
      }
      const built = pairs.length
        ? `jsonb_build_object(${pairs.join(", ")})`
        : "'{}'::jsonb";
      return {
        json: star
          ? pairs.length
            ? `to_jsonb(${alias}) || ${built}`
            : `to_jsonb(${alias})`
          : built,
        inner,
      };
    };

    const table = `public.${ident(this.table)}`;
    if (!this.write) {
      const items = this.items ?? [{ kind: "star" } as Star];
      const { json, inner } = project(this.table, base, items, "");
      const where = [filtersOn("", base), ...inner]
        .filter(Boolean)
        .join(" and ");
      const order = ordersOn("", base, this.table, items);
      const limit = this.limits.get("");
      const tail = `from ${table} ${base}${where ? ` where ${where}` : ""}`;
      if (this.countOnly)
        return { text: `select count(*) as n ${tail}`, params };
      return {
        text: `select ${json} as j ${tail}${order ? ` order by ${order}` : ""}${limit === undefined ? "" : ` limit ${Number(limit)}`}`,
        params,
      };
    }

    const w = this.write;
    let statement: string;
    if (w.kind === "delete") {
      const where = filtersOn("", base);
      statement = `delete from ${table} ${base}${where ? ` where ${where}` : ""} returning ${base}.*`;
    } else if (w.kind === "update") {
      const values = w.values as Record<string, unknown>;
      const columns = Object.keys(values).filter(
        (k) => values[k] !== undefined,
      );
      const record = `jsonb_populate_record(null::${table}, ${bind(values)}::text::jsonb)`;
      const where = filtersOn("", base);
      statement =
        columns.length === 1
          ? `update ${table} ${base} set ${ident(columns[0])} = (select r.${ident(columns[0])} from ${record} r)`
          : `update ${table} ${base} set (${columns.map(ident).join(", ")}) = (select ${columns.map((c) => `r.${ident(c)}`).join(", ")} from ${record} r)`;
      statement += `${where ? ` where ${where}` : ""} returning ${base}.*`;
    } else {
      const rows = (Array.isArray(w.values) ? w.values : [w.values]) as Record<
        string,
        unknown
      >[];
      const columns = [
        ...new Set(
          rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)),
        ),
      ];
      const list = columns.map(ident).join(", ");
      statement = `insert into ${table} as ${base} (${list}) select ${list} from jsonb_populate_recordset(null::${table}, ${bind(rows)}::text::jsonb)`;
      if (w.kind === "upsert") {
        const target = w.onConflict
          ? w.onConflict.split(",").map((c) => c.trim())
          : (meta.unique.get(this.table) ?? [])[0];
        if (!target) throw new Error(`${this.table} has no key to upsert on`);
        const rest = columns.filter((c) => !target.includes(c));
        statement += ` on conflict (${target.map(ident).join(", ")}) ${
          w.ignoreDuplicates || rest.length === 0
            ? "do nothing"
            : `do update set ${rest.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`
        }`;
      }
      statement += ` returning ${base}.*`;
    }
    if (!this.items) return { text: statement, params };
    const { json } = project(this.table, base, this.items, "");
    return {
      text: `with ${base} as (${statement}) select ${json} as j from ${base}`,
      params,
    };
  }
}

export class RpcCall {
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
        if (data.length === 1)
          return { data: data[0], error: null, count: null };
        if (data.length === 0 && this.shape === "maybe")
          return { data: null, error: null, count: null };
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116",
            details: null,
            hint: null,
          },
          count: null,
        };
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
  const first = [
    contained ? tx.unsafe(`savepoint ${name}`) : null,
    before ? tx.unsafe(before) : null,
  ].filter(Boolean);
  const result = work();
  const last = [
    after ? tx.unsafe(after) : null,
    contained ? tx.unsafe(`release savepoint ${name}`) : null,
  ].filter(Boolean);
  try {
    await Promise.all(first);
    const value = await result;
    await Promise.all(last);
    return value;
  } catch (e) {
    await Promise.allSettled(last);
    if (contained) await tx.unsafe(`rollback to savepoint ${name}`);
    throw e;
  }
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
      run: (text, params, contained) =>
        inside(
          tx,
          contained,
          roles?.become ?? null,
          roles?.back ?? null,
          () =>
            tx.unsafe(text, params as never[]) as unknown as Promise<
              Record<string, unknown>[]
            >,
        ),
      signature: (name) =>
        cached(signatureCache, pool, () => signatures(pool))(name),
      call: (signature, name, args, contained) =>
        inside(tx, contained, roles?.become ?? null, roles?.back ?? null, () =>
          callFunction(tx, signature, name, args),
        ),
      meta: () => cached(metaCache, pool, () => readMeta(pool)),
    },
    services,
  );
}

/** The server's role, for one statement at a time from the pool: each its own transaction, sent in one go. */
export function poolClient(pool: Sql, become: string, services?: () => Db): Db {
  return restClient(
    {
      run: async (text, params) => {
        const [, rows] = (await pool.begin((tx) => [
          tx.unsafe(become),
          tx.unsafe(text, params as never[]),
        ])) as unknown as [unknown, Record<string, unknown>[]];
        return rows;
      },
      signature: (name) =>
        cached(signatureCache, pool, () => signatures(pool))(name),
      call: (signature, name, args) =>
        pool.begin(async (tx) => {
          await tx.unsafe(become);
          return callFunction(tx, signature, name, args);
        }) as Promise<unknown>,
      meta: () => cached(metaCache, pool, () => readMeta(pool)),
    },
    services,
  );
}
