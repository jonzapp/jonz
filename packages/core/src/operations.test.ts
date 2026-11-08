import { describe, expect, it } from "vitest";

import { OPERATIONS, OPERATION_NAMES, registrySql, SYSTEM_ROUTES, TABLES, type Operation, unnamedGuards } from "./operations";
import { OWNER_PERMISSION_NAMES } from "./owner-moves";
import { PERMISSION_NAMES } from "./permissions";

const all = OPERATION_NAMES.map((name) => [name, OPERATIONS[name] as Operation] as const);

describe("the operation registry", () => {
  it("guards house operations with house permissions, and admin page ones with app permissions", () => {
    for (const [name, o] of all) {
      if (o.guard.by !== "permission") continue;
      const names: readonly string[] = o.scope === "app" ? OWNER_PERMISSION_NAMES : PERMISSION_NAMES;
      expect(names, name).toContain(o.guard.permission);
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

  it("runs every operation somewhere: a database function, a route or both", () => {
    for (const [name, o] of all) expect(o.rpc ?? o.route, name).toBeDefined();
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

  // Step 3 of the plan names a permission for each of these; this list only shrinks.
  it("knows which operations still check membership or ownership instead of a named permission", () => {
    expect(unnamedGuards()).toHaveLength(30);
  });

  it("is what the database standards check reads", async () => {
    await expect(registrySql()).toMatchFileSnapshot("../../../supabase/checks/registry.sql");
  });
});
