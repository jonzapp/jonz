import { camelKeys, fromPage, OPERATION_IO, OPERATION_NAMES, OPERATIONS, argName, type Operation, type OperationIo, type OperationName } from "@app/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { adminClient } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { passSecondFactor } from "@/tests/support/mfa";
import { aHouse, functionArgs, valueFor, type Arg } from "@/tests/support/operations";

/**
 * Each operation's contract (packages/core/src/operation-io.ts) held to the
 * database. An operation that runs a database function straight takes
 * exactly that function's arguments, by name, type and whether they can be
 * left out, as PostgREST describes it. And what each function answers, called for
 * real by someone who may, fits the operation's output. (An operation
 * behind an API route is held to its route's request and response schemas
 * where the route parses them.)
 */

/** What a value is, as JSON Schema or Postgres describes it, in words both can be compared in. */
type Kind = "uuid" | "text" | "integer" | "number" | "boolean" | "date" | "datetime" | "json" | `${string}[]`;

function zodKind(schema: z.ZodType): Kind {
  const describe = (s: Record<string, unknown>): Kind => {
    if (Array.isArray(s.type)) {
      const types = s.type.filter((t) => t !== "null");
      return types.length === 1 ? describe({ ...s, type: types[0] }) : "json";
    }
    const any = (s.anyOf ?? s.oneOf) as Record<string, unknown>[] | undefined;
    if (any) {
      const kinds = [...new Set(any.filter((x) => x.type !== "null").map(describe))];
      return kinds.length === 1 ? kinds[0] : "json";
    }
    if (s.type === "array") {
      // A list of objects goes as one json value (jsonb), not a Postgres array.
      const item = describe(s.items as Record<string, unknown>);
      return item === "json" ? "json" : `${item}[]`;
    }
    if (s.format === "uuid") return "uuid";
    if (s.format === "date") return "date";
    if (s.format === "date-time") return "datetime";
    if (s.type === "string") return "text";
    if (s.type === "integer") return "integer";
    // A choice of whole numbers (z.literal([1, 2, 3])) is an integer to the database.
    if (s.type === "number" && Array.isArray(s.enum) && s.enum.every(Number.isInteger)) return "integer";
    if (s.type === "number") return "number";
    if (s.type === "boolean") return "boolean";
    return "json";
  };
  return describe(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>);
}

function pgKind(type: string): Kind {
  if (type.endsWith("[]")) return `${pgKind(type.slice(0, -2))}[]`;
  if (type === "uuid") return "uuid";
  if (/^(integer|smallint|bigint|int\d)/.test(type)) return "integer";
  if (type === "numeric") return "number";
  if (type === "boolean") return "boolean";
  if (type === "date") return "date";
  if (type.startsWith("timestamp")) return "datetime";
  if (type === "json" || type === "jsonb") return "json";
  return "text";
}

/** Operations that run their database function straight, as the caller (not through a route or the service role). */
const direct = OPERATION_NAMES.filter((n) => {
  const o: Operation = OPERATIONS[n];
  return o.rpc && !o.rpc.server && !o.route;
});

const fnOf = (name: OperationName) => (OPERATIONS[name] as Operation).rpc!.name;

describe("every operation's contract, against the database", () => {
  it("takes exactly its function's arguments, by name, type and whether they can be left out", async () => {
    const { house } = await aHouse();
    const fns = await functionArgs(house.admin);
    const wrong: string[] = [];
    for (const name of direct) {
      const io: OperationIo = OPERATION_IO[name];
      const args = fns[fnOf(name)];
      const expected: Record<string, Arg & { from: string }> = {};
      for (const [key, schema] of Object.entries(io.input.shape)) {
        if (io.page && (key === "limit" || key === "startingAfter")) continue;
        const s = schema as z.ZodType;
        expected[argName(name, key)] = { type: zodKind(s), required: !s.safeParse(undefined).success, from: key };
      }
      if (io.page) {
        expected.p_limit = { type: "integer", required: false, from: "limit" };
        expected[io.page.atArg ?? "(no cursor argument)"] = { type: "datetime", required: false, from: "startingAfter" };
        expected[io.page.idArg ?? "(no cursor argument)"] = { type: "uuid", required: false, from: "startingAfter" };
      }
      for (const arg of new Set([...Object.keys(args), ...Object.keys(expected)])) {
        const want = expected[arg];
        const got = args[arg];
        if (!want) wrong.push(`${name}: ${arg} isn't in its input`);
        else if (!got) wrong.push(`${name}: ${want.from} goes to ${arg}, which the function doesn't take`);
        else if (want.type !== pgKind(got.type)) wrong.push(`${name}: ${want.from} is ${want.type}, ${arg} is ${got.type}`);
        else if (want.required !== got.required) wrong.push(`${name}: ${want.from} ${want.required ? "must be given" : "can be left out"}, ${arg} ${got.required ? "can't" : "can"}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("answers what its output says, called for real", async () => {
    const { house, ids } = await aHouse();
    const owner = house.admin;
    expectOk(await adminClient().from("app_owners").insert({ user_id: owner.userId, role: "owner" }));
    await passSecondFactor(owner);
    // Something in the Inbox, so its reads have rows to describe.
    expectOk(await house.members[0].db.rpc("send_report", { p_kind: "problem", p_words: "The bins page is blank" }));
    const fns = await functionArgs(owner);

    const misfits: string[] = [];
    const answered: string[] = [];
    // Reads first, while the house is as it was made; then writes, whatever they leave.
    const order = [...direct].sort((a, b) => Number(OPERATIONS[a].effect === "write") - Number(OPERATIONS[b].effect === "write"));
    for (const name of order) {
      const io: OperationIo = OPERATION_IO[name];
      // Only what must be given, so a list reads everything, as its page does on first open.
      const body = Object.fromEntries(
        Object.entries(fns[fnOf(name)])
          .filter(([, a]) => a.required)
          .map(([arg, a]) => [arg, valueFor(arg, a.type, ids)]),
      );
      const res = await owner.db.rpc(fnOf(name) as never, body as never);
      if (res.error) {
        // A read someone may make must work; a write here may well be refused (made-up ids, the wrong state).
        if (OPERATIONS[name].effect === "read") misfits.push(`${name}: ${res.error.message}`);
        continue;
      }
      const data: unknown = res.data;
      const answer = io.page ? fromPage(name, {}, data as unknown[]) : camelKeys(data);
      const fit = io.output.safeParse(answer);
      if (fit.success) answered.push(name);
      else {
        const at = (path: PropertyKey[]) => path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown> | null)?.[k], answer);
        misfits.push(`${name}: ${fit.error.issues.map((i) => `${i.path.join(".")} ${i.message} (${JSON.stringify(at(i.path))})`).join("; ")}`);
      }
    }
    expect(misfits).toEqual([]);
    // Every read answered, and the writes that don't hang on where the week is went through.
    expect(answered).toEqual(expect.arrayContaining(direct.filter((n) => OPERATIONS[n].effect === "read")));
    expect(answered).toEqual(
      expect.arrayContaining(["request_account_deletion", "keep_account", "see_report", "save_group", "delete_group", "reset_join_code", "remove_member", "claim_owner_ask", "finish_owner_ask"]),
    );
  });
});
