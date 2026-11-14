import { z } from "zod";

import { argName, OPERATION_IO, pathKeys, type OperationIo } from "./operation-io";
import { OPERATIONS, OPERATION_NAMES, type Operation, type OperationName } from "./operations";

// The registry as plain JSON (packages/core/generated/operations.json), for
// anything that isn't TypeScript: a service in another language generates
// its types and routes from it, as the TypeScript code reads OPERATIONS and
// OPERATION_IO themselves. operations-json.test.ts keeps the committed file
// equal to this.

/** One operation, as the JSON file says it. */
export interface OperationJson {
  name: OperationName;
  about: string;
  scope: Operation["scope"];
  effect: Operation["effect"];
  /** Who may run it: a named permission, or a check of its own ("check", "member", "own"). */
  guard: Operation["guard"];
  /** The House Pass feature it needs. */
  entitlement: string | null;
  /** The input key that turns the entitlement on; null: always. */
  entitlementWhen: string | null;
  /** It can't be taken back, or reaches people outside the caller's screen: an outside client needs the person's approval. */
  destructive: boolean;
  method: string;
  /** "/v1/…", with `{key}` for each input key the path holds. */
  path: string;
  pathKeys: string[];
  /** The database function it runs, and which argument each input key goes to; null when it runs elsewhere (a route, or the tables themselves). */
  rpc: { name: string; server: boolean; args: Record<string, string> } | null;
  /** The tables it reads or changes straight, under each table's own rules. */
  tables: string[];
  /** A read a page at a time: the row fields its cursor holds, and the function arguments they go to. */
  page: { at: string; id: string; atArg: string | null; idArg: string | null } | null;
  input: unknown;
  output: unknown;
}

/** JSON Schema 2020-12 (named once, at the top of the file); a uuid says so by its format alone, without Zod's long pattern. */
const schema = (s: z.ZodType) => {
  const json: Record<string, unknown> = z.toJSONSchema(s, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
    override: ({ jsonSchema }) => {
      if (jsonSchema.format === "uuid") delete jsonSchema.pattern;
    },
  });
  delete json.$schema;
  return json;
};

function entry(name: OperationName): OperationJson {
  const o: Operation = OPERATIONS[name];
  const io: OperationIo = OPERATION_IO[name];
  const [method, path] = io.http.split(" ");
  const keys = Object.keys(io.input.shape);
  return {
    name,
    about: o.about,
    scope: o.scope,
    effect: o.effect,
    guard: o.guard,
    entitlement: o.entitlement ?? null,
    entitlementWhen: o.entitlementWhen ?? null,
    destructive: o.destructive === true,
    method,
    path,
    pathKeys: pathKeys(io.http),
    rpc: o.rpc
      ? {
          name: o.rpc.name,
          server: o.rpc.server === true,
          args: Object.fromEntries(keys.filter((k) => !(io.page && (k === "limit" || k === "startingAfter"))).map((k) => [k, argName(name, k)])),
        }
      : null,
    tables: [...(o.tables ?? [])],
    page: io.page ? { at: io.page.at, id: io.page.id, atArg: io.page.atArg ?? null, idArg: io.page.idArg ?? null } : null,
    input: schema(io.input),
    output: schema(io.output),
  };
}

/** Every operation, in the registry's order, as the committed JSON file holds it. */
export function operationsJson(): string {
  return `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", version: 1, operations: OPERATION_NAMES.map(entry) }, null, 2)}\n`;
}
