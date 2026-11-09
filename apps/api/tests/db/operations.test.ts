import { HOUSE_MATRIX, OPERATIONS, OPERATION_NAMES, OWNER_ROLE_PERMISSIONS, TABLES, type Operation, type Permission, type TableAccess, type TableName } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { passSecondFactor } from "@/tests/support/mfa";
import { aHouse, signatures, valueFor, type Ids } from "@/tests/support/operations";

/**
 * Every operation in the registry (packages/core/src/operations.ts), called
 * against a real house by people who mustn't be able to do it. A house
 * operation guarded by anything but `signed_in` refuses someone outside the
 * house (a read may instead show them nothing); an admin page operation refuses a housemate, an owner who hasn't
 * given their code, and a support person when support doesn't hold its
 * permission. And each house operation asks its own permission: a member
 * without it (the admin-only ones, or one taken away from members for the
 * call) is refused. Arguments come from the database's own description of each
 * function (PostgREST's OpenAPI document), filled with the house's real ids,
 * so a refusal is the guard and not a missing row. Which roles may do each
 * one is tested in the permission matrix (permission-matrix.test.ts).
 */

/**
 * Operations this test can't bring to their permission check: with nothing
 * of Ben's to act on, they stop first. Each is tested where it lives.
 * - undo_latest finds the caller's latest move, then asks undo_action
 *   (history:write_own), which is on this list's other side.
 */
const UNREACHED: readonly string[] = ["undo_latest"];

const listed = OPERATION_NAMES.map((n) => [n, OPERATIONS[n] as Operation] as const).filter(([, o]) => o.rpc && !o.rpc.server);

async function call(who: Actor, fn: string, args: Record<string, string> | undefined, ids: Ids) {
  if (!args) throw new Error(`${fn} isn't callable by a signed-in person`);
  const body = Object.fromEntries(Object.entries(args).map(([name, type]) => [name, valueFor(name, type, ids)]));
  return who.db.rpc(fn as never, body as never);
}

describe("every operation refuses people it isn't for", () => {
  it("a house operation refuses someone outside the house", async () => {
    const { ids } = await aHouse();
    const stranger = await signedInUser("Nosy");
    const sigs = await signatures(stranger);
    const allowed: string[] = [];
    for (const [name, o] of listed) {
      if (o.scope !== "house" || o.guard.by === "check") continue;
      const res = await call(stranger, o.rpc!.name, sigs[o.rpc!.name], ids);
      // A read may refuse by showing nothing, as a table's rules do.
      const data: unknown = res.data;
      const shown = Array.isArray(data) ? data.length > 0 : data != null;
      if (!res.error && (o.effect === "write" || shown)) allowed.push(name);
    }
    expect(allowed).toEqual([]);
  });

  it("an admin page operation refuses a housemate, an owner without the code, and a role without its permission", async () => {
    const { house, ids } = await aHouse();
    const sigs = await signatures(house.admin);
    const housemate = house.admin;
    await passSecondFactor(housemate);
    const noCode = await signedInUser("Owner without a code");
    expectOk(await adminClient().from("app_owners").insert({ user_id: noCode.userId, role: "owner" }));
    const support = await signedInUser("Support");
    expectOk(await adminClient().from("app_owners").insert({ user_id: support.userId, role: "support" }));
    await passSecondFactor(support);

    const allowed: string[] = [];
    for (const [name, o] of listed) {
      if (o.scope !== "app" || o.guard.by !== "permission") continue;
      const fn = o.rpc!.name;
      for (const [who, label] of [[housemate, "housemate"], [noCode, "owner without a code"]] as const) {
        const res = await call(who, fn, sigs[fn], ids);
        if (res.error?.code !== "42501") allowed.push(`${label}: ${name}`);
      }
      if (!(OWNER_ROLE_PERMISSIONS.support as readonly string[]).includes(o.guard.permission)) {
        const res = await call(support, fn, sigs[fn], ids);
        if (res.error?.code !== "42501") allowed.push(`support: ${name}`);
      }
    }
    expect(allowed).toEqual([]);
  });

  it("a house operation asks its own permission: a member without it is refused", async () => {
    const { house, ids } = await aHouse();
    const ben = house.members[0];
    const sigs = await signatures(ben);
    const db = adminClient();
    const allowed: string[] = [];
    for (const [name, o] of listed) {
      if (o.scope !== "house" || o.guard.by !== "permission") continue;
      const permission = o.guard.permission as Permission;
      const held = HOUSE_MATRIX[permission].member;
      // Only migrations change the role list; the test takes the row away for one call, then puts it back.
      if (held) expectOk(await db.from("role_permissions").delete().eq("role", "member").eq("permission", permission));
      try {
        const res = await call(ben, o.rpc!.name, sigs[o.rpc!.name], ids);
        const data: unknown = res.data;
        const shown = Array.isArray(data) ? data.length > 0 : data != null;
        if (!res.error ? o.effect === "write" || shown : res.error.code !== "42501" && !UNREACHED.includes(name)) allowed.push(`${name} (${permission})`);
      } finally {
        if (held) expectOk(await db.from("role_permissions").insert({ role: "member", permission }));
      }
    }
    expect(allowed).toEqual([]);
  });

  it("a house table shows a member nothing without its read, and their house with it", async () => {
    const { house } = await aHouse();
    const ben = house.members[0];
    const db = adminClient();
    const leaks: string[] = [];
    const shownWith: string[] = [];
    for (const table of Object.keys(TABLES) as TableName[]) {
      const access: TableAccess = TABLES[table];
      if (access.read.by !== "permission" || !(access.read.permission in HOUSE_MATRIX)) continue;
      const permission = access.read.permission as Permission;
      const rows = async () => (await ben.db.from(table).select("*", { count: "exact", head: true })).count ?? 0;
      if ((await rows()) > 0) shownWith.push(table);
      expectOk(await db.from("role_permissions").delete().eq("role", "member").eq("permission", permission));
      try {
        if ((await rows()) > 0) leaks.push(`${table} (${permission})`);
      } finally {
        expectOk(await db.from("role_permissions").insert({ role: "member", permission }));
      }
    }
    expect(leaks).toEqual([]);
    // The house this test makes has rows in these, so their "nothing" above is the rule, not an empty table.
    expect(shownWith).toEqual(expect.arrayContaining(["houses", "johns", "assignments", "weeks", "members", "groups", "group_members"]));
  });
});
