import { ident, literal, type Meta } from "./rest-base";
import { columnExpr, resolve, type Embed, type Filter, type Item, type Order, type Star } from "./rest-select";

// One query as one SQL statement, its rows built as JSON in the database
// the way PostgREST does.

/** A write, as the builder was told it. */
export interface Write {
  kind: "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

/** Everything the builder was told about one query. */
export interface Query {
  table: string;
  filters: readonly Filter[];
  orders: readonly Order[];
  /** Row limits by embedded table ("" for the table itself). */
  limits: ReadonlyMap<string, number>;
  /** What to read back; null for a write that reads nothing. */
  items: Item[] | null;
  countOnly: boolean;
  write: Write | null;
}

const BASE = "t0";

/** Where one row of a table is being written out: its table, its alias, and its path from the top. */
interface Place {
  table: string;
  alias: string;
  path: string;
}

/** The table an order can reach through: the query's own, with what it embeds. */
interface Top {
  table: string;
  items: Item[];
}

class Statement {
  readonly params: unknown[] = [];
  private counter = 0;

  constructor(
    private readonly q: Query,
    private readonly meta: Meta,
  ) {}

  private bind = (v: unknown) => {
    this.params.push(
      v instanceof Date
        ? v.toISOString()
        : v === null || typeof v !== "object"
          ? v
          : JSON.stringify(v),
    );
    return `$${this.params.length}`;
  };

  private filtersOn(on: string, alias: string) {
    return this.q.filters
      .filter((f) => f.on === on)
      .map((f) => f.where(alias, this.bind))
      .join(" and ");
  }

  /** One order's expression: a column, or a column of a to-one embedded table. */
  private orderExpr(o: Order, alias: string, top?: Top) {
    const own = columnExpr(o.column).expr(alias);
    if (!o.via) return own;
    const embed = top?.items.find(
      (i): i is Embed => i.kind === "embed" && i.key === o.via,
    );
    if (!embed || !top)
      throw new Error(`Can't order by ${o.via}(${o.column}): it isn't embedded`);
    const r = resolve(this.meta, top.table, embed);
    if (!r.toOne)
      throw new Error(`Can't order by ${o.via}(${o.column}): it's a list`);
    return `(select o.${ident(o.column)} from public.${ident(r.table)} o where ${r.join(alias, "o")})`;
  }

  private ordersOn(on: string, alias: string, top?: Top) {
    return this.q.orders
      .filter((o) => o.on === on)
      .map(
        (o) =>
          `${this.orderExpr(o, alias, top)} ${o.ascending ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`,
      )
      .join(", ");
  }

  /** An embedded table as one key of its parent's JSON, and what `!inner` asks of the parent. */
  private embed(item: Embed, at: Place): { pair: string; exists: string | null } {
    const r = resolve(this.meta, at.table, item);
    this.counter += 1;
    const child = `t${this.counter}`;
    const here = at.path ? `${at.path}.${item.key}` : item.key;
    const sub = this.project({ table: r.table, alias: child, path: here }, item.items);
    const where = [r.join(at.alias, child), this.filtersOn(here, child), ...sub.inner]
      .filter(Boolean)
      .join(" and ");
    const order = this.ordersOn(here, child);
    const limit = this.q.limits.get(here);
    const from = `from public.${ident(r.table)} ${child} where ${where}`;
    const value = r.toOne
      ? `(select ${sub.json} ${from} limit 1)`
      : `(select coalesce(jsonb_agg(e.j), '[]'::jsonb) from (select ${sub.json} as j ${from}${order ? ` order by ${order}` : ""}${limit === undefined ? "" : ` limit ${Number(limit)}`}) e)`;
    return {
      pair: `${literal(item.key)}, ${value}`,
      exists: item.inner ? `exists (select 1 ${from})` : null,
    };
  }

  /** The JSON for one row of a table, with its embedded tables. */
  private project(at: Place, items: Item[]): { json: string; inner: string[] } {
    const inner: string[] = [];
    const pairs: string[] = [];
    let star = false;
    for (const item of items) {
      if (item.kind === "star") star = true;
      else if (item.kind === "column")
        pairs.push(`${literal(item.key)}, ${item.expr(at.alias)}`);
      else {
        const { pair, exists } = this.embed(item, at);
        pairs.push(pair);
        if (exists) inner.push(exists);
      }
    }
    const built = pairs.length
      ? `jsonb_build_object(${pairs.join(", ")})`
      : "'{}'::jsonb";
    const whole = pairs.length
      ? `to_jsonb(${at.alias}) || ${built}`
      : `to_jsonb(${at.alias})`;
    return { json: star ? whole : built, inner };
  }

  private top(items: Item[]) {
    return this.project({ table: this.q.table, alias: BASE, path: "" }, items);
  }

  private read(table: string): string {
    const items = this.q.items ?? [{ kind: "star" } as Star];
    const { json, inner } = this.top(items);
    const where = [this.filtersOn("", BASE), ...inner].filter(Boolean).join(" and ");
    const order = this.ordersOn("", BASE, { table: this.q.table, items });
    const limit = this.q.limits.get("");
    const tail = `from ${table} ${BASE}${where ? ` where ${where}` : ""}`;
    if (this.q.countOnly) return `select count(*) as n ${tail}`;
    return `select ${json} as j ${tail}${order ? ` order by ${order}` : ""}${limit === undefined ? "" : ` limit ${Number(limit)}`}`;
  }

  private update(table: string, w: Write): string {
    const values = w.values as Record<string, unknown>;
    const columns = Object.keys(values).filter((k) => values[k] !== undefined);
    const record = `jsonb_populate_record(null::${table}, ${this.bind(values)}::text::jsonb)`;
    const where = this.filtersOn("", BASE);
    const set =
      columns.length === 1
        ? `update ${table} ${BASE} set ${ident(columns[0])} = (select r.${ident(columns[0])} from ${record} r)`
        : `update ${table} ${BASE} set (${columns.map(ident).join(", ")}) = (select ${columns.map((c) => `r.${ident(c)}`).join(", ")} from ${record} r)`;
    return `${set}${where ? ` where ${where}` : ""} returning ${BASE}.*`;
  }

  private insert(table: string, w: Write): string {
    const rows = (Array.isArray(w.values) ? w.values : [w.values]) as Record<string, unknown>[];
    const columns = [
      ...new Set(
        rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)),
      ),
    ];
    const list = columns.map(ident).join(", ");
    let statement = `insert into ${table} as ${BASE} (${list}) select ${list} from jsonb_populate_recordset(null::${table}, ${this.bind(rows)}::text::jsonb)`;
    if (w.kind === "upsert") {
      const target = w.onConflict
        ? w.onConflict.split(",").map((c) => c.trim())
        : (this.meta.unique.get(this.q.table) ?? [])[0];
      if (!target) throw new Error(`${this.q.table} has no key to upsert on`);
      const rest = columns.filter((c) => !target.includes(c));
      statement += ` on conflict (${target.map(ident).join(", ")}) ${
        w.ignoreDuplicates || rest.length === 0
          ? "do nothing"
          : `do update set ${rest.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`
      }`;
    }
    return `${statement} returning ${BASE}.*`;
  }

  private change(table: string, w: Write): string {
    if (w.kind === "update") return this.update(table, w);
    if (w.kind !== "delete") return this.insert(table, w);
    const where = this.filtersOn("", BASE);
    return `delete from ${table} ${BASE}${where ? ` where ${where}` : ""} returning ${BASE}.*`;
  }

  text(): string {
    const table = `public.${ident(this.q.table)}`;
    if (!this.q.write) return this.read(table);
    const statement = this.change(table, this.q.write);
    if (!this.q.items) return statement;
    const { json } = this.top(this.q.items);
    return `with ${BASE} as (${statement}) select ${json} as j from ${BASE}`;
  }
}

/** The statement for a query, and the values it binds. */
export function buildQuery(q: Query, meta: Meta): { text: string; params: unknown[] } {
  const statement = new Statement(q, meta);
  const text = statement.text();
  return { text, params: statement.params };
}
