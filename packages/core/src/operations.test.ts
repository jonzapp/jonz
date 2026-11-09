import { describe, expect, it } from "vitest";

import { OPERATIONS, OPERATION_NAMES, registrySql, SYSTEM_ROUTES, TABLES, type Operation } from "./operations";
import { OWNER_PERMISSION_NAMES } from "./owner-moves";
import { ACCOUNT_PERMISSIONS, PERMISSION_NAMES } from "./permissions";

const all = OPERATION_NAMES.map((name) => [name, OPERATIONS[name] as Operation] as const);

describe("the operation registry", () => {
  it("names a permission from its own scope's list on every operation that isn't a check", () => {
    const lists: Record<Operation["scope"], readonly string[]> = {
      house: PERMISSION_NAMES,
      app: OWNER_PERMISSION_NAMES,
      account: Object.keys(ACCOUNT_PERMISSIONS),
    };
    for (const [name, o] of all) {
      if (o.guard.by === "check") continue;
      expect(o.guard.by, name).toBe("permission");
      if (o.guard.by === "permission") expect(lists[o.scope], name).toContain(o.guard.permission);
    }
  });

  it("marks only writes as destructive, and keeps checks to reads the database answers", () => {
    for (const [name, o] of all) {
      if (o.destructive) expect(o.effect, name).toBe("write");
      if (o.guard.by === "check") {
        expect(o.effect, name).toBe("read");
        expect(o.rpc, name).toBeDefined();
        expect(o.route, name).toBeUndefined();
      }
    }
  });

  it("puts a route in front of every server-only function, since only the API may call it", () => {
    for (const [name, o] of all) if (o.rpc?.server) expect(o.route, name).toBeDefined();
  });

  it("runs every operation somewhere: a database function, a route, or straight on its tables", () => {
    for (const [name, o] of all) expect(o.rpc ?? o.route ?? o.tables, name).toBeDefined();
    // An operation on tables has nothing else to run.
    expect(all.filter(([, o]) => o.tables && (o.rpc || o.route)).map(([n]) => n)).toEqual([]);
  });

  it("marks only reads as a screen's", () => {
    expect(all.filter(([, o]) => o.screen && o.effect !== "read").map(([n]) => n)).toEqual([]);
  });

  it("lists each route once, as an operation's or a system one", () => {
    const routes = [...all.flatMap(([, o]) => (o.route ? [o.route] : [])), ...Object.keys(SYSTEM_ROUTES)];
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("guards every writable table with who may change it", () => {
    for (const [name, t] of Object.entries(TABLES)) {
      const writes = t.grants.some((g) => g !== "select");
      expect("write" in t, name).toBe(writes);
    }
  });

  it("is what the database standards check reads", async () => {
    await expect(registrySql()).toMatchFileSnapshot("../../../supabase/checks/registry.sql");
  });
});
