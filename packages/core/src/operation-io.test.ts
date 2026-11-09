import { describe, expect, it } from "vitest";
import { z } from "zod";

import { argName, camelKeys, fromPage, OPERATION_IO, pathKeys, rpcArgs, type OperationIo } from "./operation-io";
import { OPERATION_NAMES, OPERATIONS, type Operation, type OperationName } from "./operations";

const each = OPERATION_NAMES.map((n) => [n, OPERATIONS[n] as Operation, OPERATION_IO[n] as OperationIo] as const);

describe("every operation's contract", () => {
  it("turns its Pass feature on by a key of its own input, and only with a feature", () => {
    for (const [n, o, io] of each) {
      if (!o.entitlementWhen) continue;
      expect(o.entitlement, n).toBeDefined();
      expect(Object.keys(io.input.shape), n).toContain(o.entitlementWhen);
    }
    // A tick is free; a tick with a photo needs the Pass.
    expect(OPERATIONS.mark_done).toMatchObject({ entitlement: "photos", entitlementWhen: "photoPath" });
    expect((OPERATIONS.confirm_payment as Operation).entitlementWhen).toBeUndefined();
  });

  it("has one /v1 route each", () => {
    const routes = each.map(([, , io]) => io.http);
    expect(routes.filter((r, i) => routes.indexOf(r) !== i)).toEqual([]);
  });

  it("reads with GET and changes with POST, PATCH or DELETE", () => {
    const wrong = each.filter(([, o, io]) => (io.http.startsWith("GET ") ? o.effect !== "read" : o.effect === "read" && !o.route)).map(([n]) => n);
    expect(wrong).toEqual([]);
  });

  it("takes every id its path names", () => {
    const missing = each.flatMap(([n, , io]) => pathKeys(io.http).filter((k) => !(k in io.input.shape)).map((k) => `${n}: ${k}`));
    expect(missing).toEqual([]);
  });

  it("puts the admin pages under /v1/admin and only them", () => {
    const wrong = each.filter(([, o, io]) => (o.scope === "app") !== io.http.includes(" /v1/admin")).map(([n]) => n);
    expect(wrong).toEqual([]);
  });

  it("names ids as what they are", () => {
    const isId = (s: unknown) => (z.toJSONSchema(s as z.ZodType, { unrepresentable: "any" }) as { format?: string }).format === "uuid";
    expect(isId(OPERATION_IO.mark_done.input.shape.assignmentId)).toBe(true);
    // An id ends in Id, apart from a swap's two Johns.
    const wrong = each.flatMap(([n, , io]) =>
      Object.entries(io.input.shape)
        .filter(([k, s]) => isId(s) && !/Id$|^(mine|theirs)$/.test(k))
        .map(([k]) => `${n}: ${k}`),
    );
    expect(wrong).toEqual([]);
  });

  it("can be described as JSON Schema, for the API's document and MCP's tools", () => {
    for (const [, , io] of each) {
      expect(() => z.toJSONSchema(io.input, { io: "input", unrepresentable: "any" })).not.toThrow();
      expect(() => z.toJSONSchema(io.output, { io: "output", unrepresentable: "any" })).not.toThrow();
    }
  });

  it("pages a list with limit and startingAfter, and answers data, hasMore and startingAfter", () => {
    for (const [n, , io] of each.filter(([, , io]) => io.page)) {
      expect(Object.keys(io.input.shape), n).toEqual(expect.arrayContaining(["limit", "startingAfter"]));
      expect(Object.keys((io.output as z.ZodObject).shape), n).toEqual(["data", "hasMore", "startingAfter"]);
    }
  });
});

describe("turning an input into a database call", () => {
  it("passes keys as p_ and snake_case, without Id, unless told otherwise", () => {
    expect(argName("save_prefs", "bestTime")).toBe("p_best_time");
    expect(argName("mark_done", "assignmentId")).toBe("p_assignment");
    expect(argName("can", "houseId")).toBe("h");
    expect(rpcArgs("confirm_payment", { houseId: "h1", fromId: "u1", amount: 500, via: undefined })).toEqual({ p_house: "h1", p_from: "u1", p_amount: 500 });
  });

  it("reads a page from its cursor, one row more than asked to see if there are more", () => {
    const name: OperationName = "owner_messages_page";
    const rows = [
      { id: "m3", sent_at: "2026-11-03T00:00:00Z" },
      { id: "m2", sent_at: "2026-11-02T00:00:00Z" },
      { id: "m1", sent_at: "2026-11-01T00:00:00Z" },
    ];
    const first = fromPage(name, { limit: 2 }, rows);
    expect(first.data).toEqual([
      { id: "m3", sentAt: "2026-11-03T00:00:00Z" },
      { id: "m2", sentAt: "2026-11-02T00:00:00Z" },
    ]);
    expect(first.hasMore).toBe(true);
    expect(rpcArgs(name, { q: "bins", limit: 2, startingAfter: first.startingAfter! })).toEqual({
      p_q: "bins",
      p_limit: 3,
      p_cursor_at: "2026-11-02T00:00:00Z",
      p_cursor_id: "m2",
    });
    expect(fromPage(name, { limit: 5 }, rows)).toMatchObject({ hasMore: false, startingAfter: null });
    // A cursor that isn't one of ours is the first page.
    expect(rpcArgs(name, { startingAfter: "nonsense" })).toEqual({ p_limit: 51 });
  });

  it("answers in camelCase all the way down", () => {
    expect(camelKeys([{ done_by: "u1", data: { john_name: "Bins" }, tags: ["a_b"] }])).toEqual([{ doneBy: "u1", data: { johnName: "Bins" }, tags: ["a_b"] }]);
  });
});
