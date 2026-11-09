// The executor against a database built from the migrations: as the API's own
// role (jonz_api), becoming each person per request. Every check runs at both
// layers: the executor refuses first, and the database refuses the same call
// when the executor's check is taken away.
//
// Needs a stack: `npm run db:start && npm run db:reset`, then
// `npm run test:db -w @app/server`. DB_URL points at it as the superuser.

import { randomBytes, randomUUID } from "node:crypto";

import { OPERATIONS, type Operation } from "@app/core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Claims, TokenVerifier } from "../../src/auth";
import { connect, type Sql } from "../../src/db";
import { createExecutor, type ApiOperation, type ExecutorOptions } from "../../src/executor";
import { Problem } from "../../src/problem";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";

// A pretend clock: each test picks its own minute, so rate-limit windows never meet.
const minute = (n: number) => new Date(Date.UTC(2027, 0, 4, 9, n, 30));

let admin: Sql;
let api: Sql;
// alice runs a house, bob is outside it (later a plain member); the others
// start houses of their own (a person may be in one house at a time).
const people = { alice: randomUUID(), bob: randomUUID(), carol: randomUUID(), dan: randomUUID(), erin: randomUUID(), fred: randomUUID() };
const tokens: Record<string, Claims> = {};

/** Tokens are checked in the unit tests; here a header just names the person. */
const verify: TokenVerifier = async (authorization) => {
  const claims = authorization ? tokens[authorization] : undefined;
  if (!claims) throw new Problem("unauthenticated", "Sign in first.");
  return claims;
};
const as = (who: keyof typeof people) => ({ authorization: who, via: "api" as const });

const createHouse: ApiOperation = {
  name: "create_house",
  operation: OPERATIONS.create_house,
  input: z.object({ name: z.string().min(1), timezone: z.string(), currency: z.string(), weekStarts: z.number().int(), kind: z.enum(["housemates", "family"]) }),
  output: z.uuid(),
  http: { method: "POST", path: "/v1/houses" },
};
const myPermissions: ApiOperation = {
  name: "my_permissions",
  operation: OPERATIONS.my_permissions,
  input: z.object({ houseId: z.uuid() }),
  output: z.array(z.string()),
  http: { method: "GET", path: "/v1/houses/{houseId}/permissions" },
  rpcArgs: (i) => ({ h: i.houseId }),
};
const setHouseKind: ApiOperation = {
  name: "set_house_kind",
  operation: OPERATIONS.set_house_kind,
  input: z.object({ houseId: z.uuid(), kind: z.enum(["housemates", "family"]) }),
  output: z.unknown(),
  http: { method: "POST", path: "/v1/houses/{houseId}/kind" },
  rpcArgs: (i) => ({ p_house: i.houseId, p_kind: i.kind }),
};
const whoAmI: ApiOperation = {
  name: "who_am_i",
  operation: { about: "Who the handler runs as", scope: "account", effect: "write", guard: { by: "permission", permission: "account:write_own" }, rpc: { name: "who_am_i", server: true } } as Operation,
  input: z.object({}),
  output: z.object({ role: z.string(), uid: z.string() }),
  http: { method: "POST", path: "/v1/me/who" },
  handler: async ({ tx }) => (await tx<{ role: string; uid: string }[]>`select current_user as role, auth.uid()::text as uid`)[0],
};
const OPS = [createHouse, myPermissions, setHouseKind, whoAmI];

const executor = (o: Partial<ExecutorOptions> = {}) => createExecutor({ sql: api, verify, operations: OPS, now: () => minute(0), ...o });
const house = { name: "Test House", timezone: "Europe/London", currency: "GBP", weekStarts: 1, kind: "housemates" as const };
const housesBy = async (id: string) => Number((await admin`select count(*)::int as n from public.members where user_id = ${id}::uuid`)[0].n);

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 2, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 4);
  for (const [name, id] of Object.entries(people)) {
    await admin`insert into auth.users (id, email, raw_user_meta_data) values (${id}::uuid, ${`${name}-${id}@test.jonz.app`}, ${admin.json({ full_name: name })})`;
    tokens[name] = { sub: id, role: "authenticated", aud: "authenticated", aal: "aal1" };
  }
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id in ${admin(Object.values(people))})`;
  await admin`delete from auth.users where id in ${admin(Object.values(people))}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await api?.end();
  await admin?.end();
});

describe("the executor", () => {
  let houseId: string;

  it("runs a write as the person, and audits it as the API", async () => {
    const result = await executor()("create_house", { ...as("alice"), client: "ios/1.4.2 (57)", requestId: `req_${people.alice}` }, house);
    expect(result.status).toBe(201);
    houseId = result.body as string;
    const [member] = await admin`select role from public.members where house_id = ${houseId}::uuid and user_id = ${people.alice}::uuid`;
    expect(member.role).toBe("admin");
    const [audit] = await admin`select user_id, operation, via, client, request_id from public.api_audit_entries where request_id = ${`req_${people.alice}`}`;
    expect(audit).toMatchObject({ user_id: people.alice, operation: "create_house", via: "api", client: "ios/1.4.2 (57)" });
  });

  it("runs a server handler as the person too", async () => {
    const result = await executor()("who_am_i", as("alice"), {});
    expect(result.body).toEqual({ role: "authenticated", uid: people.alice });
  });

  it("answers a read with the person's own view", async () => {
    const mine = await executor()("my_permissions", as("alice"), { houseId });
    expect(mine.status).toBe(200);
    expect(mine.body).toContain("house:write");
    const theirs = await executor()("my_permissions", as("bob"), { houseId });
    expect(theirs.body).toEqual([]);
  });

  it("finds the house from the row an operation names, as the person sees it", async () => {
    const [john] = await admin`insert into public.johns (house_id, name, anchor_week) values (${houseId}::uuid, 'Bins', 0) returning id`;
    const raiseFlag: ApiOperation = {
      name: "raise_flag",
      operation: OPERATIONS.raise_flag,
      input: z.object({ johnId: z.uuid() }),
      output: z.unknown(),
      http: { method: "POST", path: "/v1/johns/{johnId}/flags" },
      rpcArgs: (i) => ({ p_john: i.johnId }),
    };
    const undoLatest: ApiOperation = {
      name: "undo_latest",
      operation: OPERATIONS.undo_latest,
      input: z.object({ kind: z.string() }),
      output: z.unknown(),
      http: { method: "POST", path: "/v1/me/actions/undo-latest" },
      rpcArgs: (i) => ({ p_kind: i.kind }),
    };
    const run = createExecutor({ sql: api, verify, operations: [raiseFlag, undoLatest], now: () => minute(8) });
    // Someone outside the house can't see the John, so it isn't there for them.
    await expect(run("raise_flag", as("bob"), { johnId: john.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(run("raise_flag", as("alice"), { johnId: randomUUID() })).rejects.toMatchObject({ code: "not_found" });
    // In the house, the permission is checked against that house and the database has its say.
    const answer = await run("raise_flag", as("alice"), { johnId: john.id }).catch((e: Problem) => e);
    expect(answer instanceof Problem ? answer.code : "ok").not.toMatch(/forbidden|invalid_input|not_found/);
    // No row to go by: the house the person is in, and none if they aren't in one.
    const undo = await run("undo_latest", as("alice"), { kind: "tick" }).catch((e: Problem) => e);
    expect(undo instanceof Problem ? undo.code : "ok").not.toMatch(/forbidden|invalid_input/);
    await expect(run("undo_latest", as("bob"), { kind: "tick" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("refuses a permission at the API, and the database refuses it too without the API's check", async () => {
    // Someone outside the house, then a member without house:write.
    await expect(executor()("set_house_kind", as("bob"), { houseId, kind: "family" })).rejects.toMatchObject({ code: "forbidden" });
    await admin`insert into public.members (house_id, user_id, role) values (${houseId}::uuid, ${people.bob}::uuid, 'member')`;
    await expect(executor()("set_house_kind", as("bob"), { houseId, kind: "family" })).rejects.toMatchObject({ code: "forbidden", message: "You need house:write in this house." });

    const unguarded: ApiOperation = { ...setHouseKind, operation: { ...setHouseKind.operation, guard: { by: "check" } } as Operation };
    const bare = createExecutor({ sql: api, verify, operations: [unguarded], now: () => minute(1) });
    await expect(bare("set_house_kind", as("bob"), { houseId, kind: "family" })).rejects.toBeInstanceOf(Problem);
    const [h] = await admin`select kind from public.houses where id = ${houseId}::uuid`;
    expect(h.kind).toBe("housemates");
  });

  it("refuses bad input before touching the database", async () => {
    await expect(executor({ now: () => minute(2) })("set_house_kind", as("alice"), { houseId: "not-a-uuid", kind: "family" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(executor({ now: () => minute(2) })("nope", as("alice"), {})).rejects.toMatchObject({ code: "not_found" });
    await expect(executor({ now: () => minute(2) })("create_house", { authorization: "nobody" }, house)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(executor({ now: () => minute(2), minimumBuilds: { ios: 60 } })("create_house", { ...as("alice"), client: "ios/1.4.2 (57)" }, house)).rejects.toMatchObject({ code: "client_too_old" });
  });

  it("rolls a write back when its answer breaks the contract", async () => {
    const broken = createExecutor({ sql: api, verify, operations: [{ ...createHouse, output: z.number() }], now: () => minute(3) });
    await expect(broken("create_house", as("carol"), house)).rejects.toMatchObject({ code: "internal" });
    expect(await housesBy(people.carol)).toBe(0);
    const [audit] = await admin`select count(*)::int as n from public.api_audit_entries where user_id = ${people.carol}::uuid`;
    expect(audit.n).toBe(0);
  });

  it("answers a repeated Idempotency-Key once, on any instance, even at the same moment", async () => {
    const [one, two] = [executor({ now: () => minute(4) }), executor({ now: () => minute(4) })];
    const key = `key-${randomUUID()}`;
    const [a, b] = await Promise.all([
      one("create_house", { ...as("dan"), idempotencyKey: key }, house),
      two("create_house", { ...as("dan"), idempotencyKey: key }, house),
    ]);
    expect(a.body).toBe(b.body);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    await expect(one("create_house", { ...as("dan"), idempotencyKey: key }, house)).resolves.toMatchObject({ replayed: true, body: a.body, status: 201 });
    expect(await housesBy(people.dan)).toBe(1);
    await expect(two("create_house", { ...as("dan"), idempotencyKey: key }, { ...house, name: "Another" })).rejects.toMatchObject({ code: "idempotency_mismatch" });
    // Another person's same key is theirs alone.
    await expect(two("create_house", { ...as("erin"), idempotencyKey: key }, house)).resolves.toMatchObject({ status: 201 });
    // A day later the key is free again: the request runs (and the database says no, Dan has a house).
    const later = executor({ now: () => new Date(minute(4).getTime() + 86_400_000 + 1000) });
    await expect(later("create_house", { ...as("dan"), idempotencyKey: key }, house)).rejects.toMatchObject({ code: "rejected" });
    // Reads ignore the key.
    const read = await one("my_permissions", { ...as("dan"), idempotencyKey: key }, { houseId: a.body });
    expect(read.replayed).toBeUndefined();
  });

  it("limits requests per person per minute, across instances", async () => {
    const limits = { read: 2, write: 1 };
    const [one, two] = [executor({ limits, now: () => minute(5) }), executor({ limits, now: () => minute(5) })];
    await one("my_permissions", as("alice"), { houseId });
    await two("my_permissions", as("alice"), { houseId });
    const refused = await one("my_permissions", as("alice"), { houseId }).catch((e) => e);
    expect(refused).toMatchObject({ code: "rate_limited", headers: { "Retry-After": "30" } });
    // Bob has his own count; the next minute starts again.
    await expect(one("my_permissions", as("bob"), { houseId })).resolves.toMatchObject({ status: 200 });
    await expect(executor({ limits, now: () => minute(6) })("my_permissions", as("alice"), { houseId })).resolves.toMatchObject({ status: 200 });
  });

  it("asks for the House Pass when it's enforced and the house has none", async () => {
    const gated: ApiOperation = { ...myPermissions, operation: { ...myPermissions.operation, entitlement: "history" } as Operation };
    await admin`update public.houses set pass_plan = 'trial', pass_ends_at = ${minute(0)} where id = ${houseId}::uuid`;
    const run = (enforced: boolean, at: Date) => createExecutor({ sql: api, verify, operations: [gated], now: () => at, passEnforced: enforced })("my_permissions", as("alice"), { houseId });
    await expect(run(true, minute(7))).rejects.toMatchObject({ code: "pass_required", status: 402 });
    await expect(run(false, minute(7))).resolves.toMatchObject({ status: 200 });
    await expect(run(true, new Date(minute(0).getTime() - 60_000))).resolves.toMatchObject({ status: 200 });
  });

  it("asks for the Pass only when the feature it covers is used", async () => {
    const op: ApiOperation = {
      ...myPermissions,
      name: "my_permissions",
      input: z.object({ houseId: z.uuid(), photoPath: z.string().optional() }),
      rpcArgs: (i) => ({ h: i.houseId }),
      operation: { ...myPermissions.operation, entitlement: "photos", entitlementWhen: "photoPath" },
    };
    const run = (input: Record<string, unknown>) => createExecutor({ sql: api, verify, operations: [op], now: () => minute(9), passEnforced: true })("my_permissions", as("alice"), input);
    await expect(run({ houseId })).resolves.toMatchObject({ status: 200 });
    await expect(run({ houseId, photoPath: "h/a.jpg" })).rejects.toMatchObject({ code: "pass_required" });
  });

  it("keeps its bookkeeping out of people's reach", async () => {
    for (const table of ["api_audit_entries", "api_idempotency_keys", "api_rate_limits"]) {
      const refused = await api
        .begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify(tokens.alice)}, true)`;
          return tx.unsafe(`select * from public.${table} limit 1`);
        })
        .catch((e) => e);
      expect(refused).toMatchObject({ code: "42501" });
    }
    // And the API's role has no rights of its own on people's tables.
    await expect(api`select * from public.houses limit 1`).rejects.toMatchObject({ code: "42501" });
  });
});
