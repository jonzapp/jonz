import { randomUUID } from "node:crypto";

import { OPERATIONS, OPERATION_NAMES, OWNER_ROLE_PERMISSIONS, type Operation } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, thisWeek } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";
import { ANON_KEY, SUPABASE_URL } from "@/tests/support/env";

/**
 * Every operation in the registry (packages/core/src/operations.ts), called
 * against a real house by people who mustn't be able to do it. A house
 * operation guarded by anything but `signed_in` refuses someone outside the
 * house (a read may instead show them nothing); an admin page operation refuses a housemate, an owner who hasn't
 * given their code, and a support person when support doesn't hold its
 * permission. Arguments come from the database's own description of each
 * function (PostgREST's OpenAPI document), filled with the house's real ids,
 * so a refusal is the guard and not a missing row. Which roles may do each
 * one is tested in the permission matrix (permission-matrix.test.ts).
 */

type Schema = { properties?: Record<string, { format?: string; type?: string }>; required?: string[] };
type Ids = Record<string, string>;

type Param = { in: string; name: string; format?: string; type?: string; schema?: Schema; $ref?: string };
type OpenApi = { paths: Record<string, { get?: { parameters?: Param[] }; post?: { parameters?: Param[] } }>; parameters: Record<string, Param> };

/**
 * Each function a signed-in person may call, with its arguments by name and
 * Postgres type, as PostgREST describes it to them: a write's arguments are
 * its body, a read's are query parameters.
 */
async function signatures(who: Actor): Promise<Record<string, Record<string, string>>> {
  const { data } = await who.db.auth.getSession();
  const token = data.session!.access_token;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` } });
  const doc = (await res.json()) as OpenApi;
  const argsOf = (item: OpenApi["paths"][string]): [string, string][] => {
    const body = item.post?.parameters?.find((p) => p.in === "body")?.schema;
    if (body) return Object.entries(body.properties ?? {}).map(([name, p]) => [name, p.format ?? p.type ?? "text"]);
    return (item.get?.parameters ?? [])
      .map((p) => (p.$ref ? doc.parameters[p.$ref.split("/").pop()!] : p))
      .filter((p) => p?.in === "query" && !/^(select|order|limit|offset|on_conflict|columns)$/.test(p.name))
      .map((p) => [p.name, p.format ?? p.type ?? "text"]);
  };
  return Object.fromEntries(
    Object.entries(doc.paths)
      .filter(([path]) => path.startsWith("/rpc/"))
      .map(([path, item]) => [path.slice("/rpc/".length), Object.fromEntries(argsOf(item))]),
  );
}

/** A value for one argument: the house's real row for an id it names, else something well formed. */
function valueFor(name: string, type: string, ids: Ids): unknown {
  if (type === "uuid") return ids[name] ?? randomUUID();
  if (type.endsWith("[]")) return type === "uuid[]" ? [ids.p_user] : [];
  if (type === "boolean") return true;
  if (/^(int|integer|smallint|bigint|numeric)/.test(type)) return 1;
  if (type === "date") return "2030-01-07";
  if (type.startsWith("timestamp")) return "2030-01-07T09:00:00.000Z";
  if (type === "jsonb" || type === "json") return {};
  return name === "p_month" ? "2030-01" : "x";
}

async function aHouse() {
  const house = await makeHouse(["Ava", "Ben"]);
  const week = thisWeek();
  const [john] = await addJohns(house.id, [{ name: "Bins" }], week);
  const { assignments } = await deal(house.id, week, new Date(week.startsOn));
  const assignment = assignments[0].id;
  const group = (await house.admin.db.rpc("save_group", { p_house: house.id, p_group: null as unknown as string, p_name: "Upstairs", p_members: [house.admin.userId] })).data as string;
  const ben = house.members[0].userId;
  const ids: Ids = {
    h: house.id, p_house: house.id, p_from: house.id,
    p_john: john.id, p_assignment: assignment, p_mine: assignment, p_theirs: assignment,
    p_group: group, p_user: ben, p_kid: ben, p_to: ben, other: ben,
  };
  return { house, ids };
}

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
});
