import { ident, literal, type ForeignKey, type Meta } from "./rest-base";

// Reading a query the way PostgREST does: the select list with its embedded
// tables, filters, orders, and which foreign key an embedded table follows.

interface Column {
  kind: "column";
  key: string;
  expr: (alias: string) => string;
}
export interface Star {
  kind: "star";
}
export interface Embed {
  kind: "embed";
  key: string;
  name: string;
  hint: string | null;
  inner: boolean;
  items: Item[];
}
export type Item = Column | Star | Embed;

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
export function columnExpr(spec: string): {
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

export interface Filter {
  /** The embedded table it is on (its key, or `a.b` for deeper), or "" for the table itself. */
  on: string;
  where: (alias: string, bind: (v: unknown) => string) => string;
}

/** Postgres's array literal for `in`, each value quoted. */
function arrayLiteral(values: readonly unknown[]): string {
  return `{${values.map((v) => (v === null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

export function condition(
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
    } else if (op === "cs" || op === "cd" || op === "ov") {
      // An array column takes Postgres's array literal; an object is JSON.
      const sym = op === "cs" ? "@>" : op === "cd" ? "<@" : "&&";
      sql = Array.isArray(value)
        ? `${left} ${sym} ${bind(arrayLiteral(value))}`
        : value !== null && typeof value === "object"
          ? `${left} ${sym} ${bind(value)}::text::jsonb`
          : `${left} ${sym} ${bind(value)}`;
    } else {
      const sym = OPS[op as keyof typeof OPS];
      if (!sym) throw new Error(`Filter ${op} isn't one we read`);
      sql = `${left} ${sym} ${bind(value)}`;
    }
    return negate ? `not (${sql})` : sql;
  };
}

/** PostgREST's filter strings, for `or()`: `a.is.null,and(b.gt.1,c.eq.x)`. */
export function parseLogic(text: string, joiner: "or" | "and"): Filter["where"] {
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

export interface Order {
  on: string;
  /** Ordered by a column of a to-one embedded table: `weeks(starts_on)`. */
  via?: string;
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface Resolved {
  key: ForeignKey;
  /** The key is on the table we embed into (many-to-one): an object. */
  toOne: boolean;
  table: string;
  join: (parent: string, child: string) => string;
}

export function resolve(meta: Meta, from: string, embed: Embed): Resolved {
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
