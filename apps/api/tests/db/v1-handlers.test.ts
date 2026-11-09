// The /v1 operations whose logic lives in apps/api (lib/v1/handlers.ts), run
// through the executor against the real stack: the executor's checks come
// first (a housemate can't deal, a stranger can't read the house), then the
// move runs as the person, as its /api route did.
//
// Tokens are signed with the local stack's secret, so PostgREST takes them
// too: a handler's move reads through the person's own session. The clock is
// a pretend one. PostgREST checks the token by the real clock, so it is
// issued in 2020 and lasts to 2100: good for both, whatever day the tests run.

import { randomBytes, randomUUID } from "node:crypto";

import { connect, createExecutor, Problem, tokenVerifier, type Executor, type Sql } from "@app/server";
import { SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiOperation, withHandlers } from "v1";

import { V1_HANDLERS } from "@/lib/v1/handlers";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const STACK_SECRET = process.env.SUPABASE_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0));
const ISSUED = Date.UTC(2020, 0, 1) / 1000;
const EXPIRES = Date.UTC(2100, 0, 1) / 1000;

let admin: Sql;
let api: Sql;
let execute: Executor;
let houseId: string;
const parent = randomUUID();
const housemate = randomUUID();
const stranger = randomUUID();

const bearer = async (sub: string) =>
  `Bearer ${await new SignJWT({ sub, role: "authenticated", aud: "authenticated", email: `h-${sub}@test.jonz.app` })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(ISSUED)
    .setExpirationTime(EXPIRES)
    .sign(new TextEncoder().encode(STACK_SECRET))}`;

const run = async (who: string, name: string, input: Record<string, unknown>) =>
  execute(name, { authorization: await bearer(who), via: "api" }, input).then(
    (r) => ({ ok: true as const, body: r.body as Record<string, unknown> }),
    (e: unknown) => ({ ok: false as const, problem: e as Problem }),
  );

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 2);
  for (const id of [parent, housemate, stranger]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`h-${id}@test.jonz.app`})`;
  const operations = [apiOperation("create_house"), ...withHandlers(V1_HANDLERS).filter((o) => o.handler)];
  execute = createExecutor({
    sql: api,
    verify: tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: STACK_SECRET, currentDate: NOW }),
    operations,
    now: () => NOW,
    limits: { read: 1000, write: 1000 },
  });
  const made = await run(parent, "create_house", { name: "Handlers house", timezone: "Europe/London", currency: "GBP", weekStarts: 1 });
  if (!made.ok) throw made.problem;
  houseId = made.body as unknown as string;
  await admin`insert into public.members (house_id, user_id) values (${houseId}::uuid, ${housemate}::uuid)`;
});

afterAll(async () => {
  await admin`delete from public.houses where id = ${houseId}::uuid`;
  await admin`delete from auth.users where id in ${admin([parent, housemate, stranger])}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await api.end();
  await admin.end();
});

describe("/v1 server operations", () => {
  it("reads the house's Ask Jonz week for anyone in it, and nobody else", async () => {
    const mine = await run(housemate, "ask_usage", { houseId });
    expect(mine.ok, mine.ok ? "" : mine.problem.message).toBe(true);
    if (mine.ok) expect(mine.body).toMatchObject({ pass: expect.any(Boolean) });
    const theirs = await run(stranger, "ask_usage", { houseId });
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(["forbidden", "not_found"]).toContain(theirs.problem.code);
  });

  it("catches the house up for someone in it", async () => {
    const caught = await run(housemate, "catch_up", { houseId });
    expect(caught.ok, caught.ok ? "" : caught.problem.message).toBe(true);
    if (caught.ok) expect(caught.body).toEqual({ ticked: expect.any(Boolean) });
  });

  it("deals only for an admin, then runs the move as them", async () => {
    const theirs = await run(housemate, "deal_week", { houseId });
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.problem.code).toBe("forbidden");
    // Past the executor's check, the move runs: it deals, or (no Johns yet) says why not in its own words.
    const mine = await run(parent, "deal_week", { houseId });
    if (mine.ok) expect(mine.body).toEqual({ ok: true });
    else expect(mine.problem.code, mine.problem.message).toBe("rejected");
  });

  it("lets only the owner retry a promotion", async () => {
    const refused = await run(parent, "retry_promotion", { promotionId: randomUUID() });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.problem.code).toBe("forbidden");
  });
});
