// Two /v1 instances, each with its own database pool, taking turns with one
// person's requests, as a load balancer would hand them out. Anything kept in
// one instance's memory would show here: an Idempotency-Key answered twice,
// or a rate limit that resets when the next request lands elsewhere.
//
// Needs a stack built from the migrations; DB_URL is its superuser.

import { randomBytes, randomUUID } from "node:crypto";

import { connect, createExecutor, tokenVerifier, type ApiOperation, type Sql } from "@app/server";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";

import { buildApp } from "../../src/app";
import { apiOperation } from "../../src/operations";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const SECRET = randomBytes(32).toString("hex");
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0)); // pretend clock

// The registry's own operations, as /v1 serves them.
const ops: ApiOperation[] = [apiOperation("create_house"), apiOperation("my_permissions"), apiOperation("can")];

let admin: Sql;
const pools: Sql[] = [];
const instances: FastifyInstance[] = [];
const person = randomUUID();
let bearer: string;
let turn = 0;
const next = () => instances[turn++ % instances.length];

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  await admin`insert into auth.users (id, email) values (${person}::uuid, ${`p-${person}@test.jonz.app`})`;
  bearer = `Bearer ${await new SignJWT({ sub: person, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(NOW.getTime() / 1000))
    .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
    .sign(new TextEncoder().encode(SECRET))}`;
  for (let i = 0; i < 2; i++) {
    const sql = connect(url.toString(), 2);
    pools.push(sql);
    const verify = tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: SECRET, currentDate: NOW });
    const execute = createExecutor({ sql, verify, operations: ops, now: () => NOW, limits: { read: 3, write: 10 } });
    instances.push(buildApp({ execute, operations: ops }));
  }
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id = ${person}::uuid)`;
  await admin`delete from auth.users where id = ${person}::uuid`;
  await admin.unsafe(`alter role jonz_api password null`);
  await Promise.all(instances.map((a) => a.close()));
  await Promise.all(pools.map((p) => p.end()));
  await admin.end();
});

it("gives the same answers whichever instance takes each request", async () => {
  const body = { name: "Round Robin", timezone: "Europe/London", currency: "GBP", weekStarts: 1, kind: "housemates" };
  const headers = { authorization: bearer, "idempotency-key": `rr-${person}` };
  const first = await next().inject({ method: "POST", url: "/v1/houses", payload: body, headers });
  const again = await next().inject({ method: "POST", url: "/v1/houses", payload: body, headers });
  expect(first.statusCode).toBe(201);
  expect(again.statusCode).toBe(201);
  expect(again.headers["idempotent-replayed"]).toBe("true");
  expect(again.json()).toBe(first.json());
  const [{ n }] = await admin`select count(*)::int as n from public.members where user_id = ${person}::uuid`;
  expect(n).toBe(1);

  // Three reads a minute, counted across both instances: the fourth is refused wherever it lands.
  const houseId = first.json();
  const reads = [];
  for (let i = 0; i < 4; i++) reads.push(await next().inject({ method: "GET", url: `/v1/houses/${houseId}/permissions`, headers: { authorization: bearer } }));
  expect(reads.map((r) => r.statusCode)).toEqual([200, 200, 200, 429]);
  expect(reads[0].json()).toContain("house:write");
  expect(reads[3].headers["retry-after"]).toBe("60");
});

it("reads a GET's query by its contract", async () => {
  const houseId = (await admin`select house_id from public.members where user_id = ${person}::uuid`)[0].house_id;
  // This minute's reads were spent above, so this runs in the next minute.
  const at = new Date(NOW.getTime() + 60_000);
  const sql = pools[0];
  const verify = tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: SECRET, currentDate: at });
  const app = buildApp({ execute: createExecutor({ sql, verify, operations: ops, now: () => at }), operations: ops });
  const yes = await app.inject({ method: "GET", url: `/v1/houses/${houseId}/can?permission=house:write`, headers: { authorization: bearer } });
  expect(yes.statusCode).toBe(200);
  expect(yes.json()).toBe(true);
  const no = await app.inject({ method: "GET", url: `/v1/houses/${houseId}/can?permission=nothing:write`, headers: { authorization: bearer } });
  expect(no.json()).toBe(false);
  await app.close();
});

it("turns away a token signed with anything else, on every instance", async () => {
  for (const app of instances) {
    const res = await app.inject({ method: "GET", url: `/v1/houses/${randomUUID()}/permissions`, headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad" } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  }
});
