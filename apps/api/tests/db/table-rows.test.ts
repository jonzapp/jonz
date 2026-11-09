import { TABLES } from "@app/core";
import { describe, expect, it } from "vitest";

import { SERVICE_ROLE_KEY, SUPABASE_URL } from "@/tests/support/env";

/**
 * packages/core/src/table-rows.ts: a Zod schema for a row of each table in
 * the registry (TABLES), camelCase, written from the database's own
 * description of its columns (PostgREST's OpenAPI document: type, and
 * whether it can be null). The registry's outputs are made from these rows,
 * so a column that changes changes them. This test keeps the file equal to
 * the database; after a migration, refresh it with
 * `npx vitest run --project db tests/db/table-rows.test.ts -u` in apps/api.
 */

type Column = { format?: string; type?: string };
type OpenApi = { definitions: Record<string, { properties: Record<string, Column>; required?: string[] }> };

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function zodOf(column: Column): string {
  switch (column.format) {
    case "uuid":
      return "id";
    case "text":
      return "text";
    case "int32":
    case "int64":
      return "int";
    case "numeric":
      return "num";
    case "boolean":
      return "bool";
    case "date":
      return "day";
    case "time without time zone":
      return "time";
    case "timestamp with time zone":
      return "at";
    case "jsonb":
      return "json";
    case "smallint[]":
      return "z.array(int)";
    case "text[]":
      return "z.array(text)";
    case "uuid[]":
      return "z.array(id)";
    default:
      throw new Error(`No Zod for a column of ${column.format ?? column.type}`);
  }
}

function tableRowsSource(doc: OpenApi): string {
  const tables = Object.keys(TABLES).sort();
  const rows = tables.map((table) => {
    const def = doc.definitions[table];
    if (!def) throw new Error(`${table} isn't in the database`);
    const required = new Set(def.required ?? []);
    const fields = Object.entries(def.properties).map(([name, column]) => {
      const key = camel(name);
      const value = `${zodOf(column)}${required.has(name) ? "" : ".nullable()"}`;
      return key === value ? `    ${key},` : `    ${key}: ${value},`;
    });
    return [`  ${table}: z.object({`, ...fields, "  }),"].join("\n");
  });
  return [
    "// Written by apps/api/tests/db/table-rows.test.ts from the database's own",
    "// description of its tables: don't edit it by hand. After a migration,",
    "// refresh it with `npx vitest run --project db tests/db/table-rows.test.ts -u`",
    "// in apps/api.",
    "",
    'import { z } from "zod";',
    "",
    "const id = z.uuid();",
    "const text = z.string();",
    "const int = z.int();",
    "const num = z.number();",
    "const bool = z.boolean();",
    "const day = z.iso.date();",
    "const time = z.iso.time();",
    "const at = z.iso.datetime({ offset: true });",
    "const json = z.json();",
    "",
    "/** A row of each table in the registry (TABLES), camelCase, each column as the database has it. */",
    "export const TABLE_ROWS = {",
    ...rows,
    "} as const;",
    "",
  ].join("\n");
}

describe("each table's row", () => {
  it("is what packages/core/src/table-rows.ts says", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
    await expect(tableRowsSource((await res.json()) as OpenApi)).toMatchFileSnapshot("../../../../packages/core/src/table-rows.ts");
  });
});
