// The House Pass column of the matrix, through /v1 and /mcp against the real
// database. Every operation the registry gates behind a Pass feature is
// called by a house admin, who holds every permission it needs, with the Pass
// enforced:
// - without a Pass it's refused with pass_required, on both;
// - with one it gets past the Pass check;
// - an operation that needs the Pass only for one input (a tick is free, a
//   tick with a photo isn't) is free without that input.
//
// The executor runs on a pretend clock, and tokens are signed with a test
// secret, as apps/v1's own database tests do. Whether the operation then
// succeeds (a tick outside the database's own week is refused) is tested where it lives;
// here only the Pass decides.

import { randomBytes, randomUUID } from "node:crypto";

import { OPERATIONS, weekWindow, type OperationName } from "@app/core";
import { connect, createExecutor, tokenVerifier, type Executor, type Sql } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildApp } from "v1";

import { buildMcpServer, mcpOperations } from "@/lib/mcp/server";
import { addJohns, deal, makeHouse, ZONE, type House } from "@/tests/support/factories";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const SECRET = randomBytes(32).toString("hex");
const NOW = new Date(Date.UTC(2027, 0, 6, 9, 30, 0)); // pretend clock, a Wednesday
const DAY = 86_400_000;

// Every operation the registry gates behind the Pass, as /mcp serves it (and so /v1: /mcp leaves out only first-party ones).
const GATED = mcpOperations().filter((o) => o.operation.entitlement);

interface Fixture {
  house: House;
  assignmentId: string;
  disputeId: string;
  photoPath: string;
}

/** Each gated operation's input in a house: with the input that turns its feature on, and without it where there's one. */
const INPUTS: Record<string, (f: Fixture) => { on: Record<string, unknown>; off?: Record<string, unknown> }> = {
  house_history: (f) => ({ on: { houseId: f.house.id } }),
  mark_done: (f) => ({ on: { assignmentId: f.assignmentId, photoPath: f.photoPath }, off: { assignmentId: f.assignmentId } }),
  roll_call: (f) => ({
    on: { assignmentId: f.assignmentId, crew: [f.house.admin.userId], photoPath: f.photoPath },
    off: { assignmentId: f.assignmentId, crew: [f.house.admin.userId] },
  }),
  answer_dispute: (f) => ({ on: { disputeId: f.disputeId, photoPath: f.photoPath } }),
  cover_john: (f) => ({ on: { assignmentId: f.assignmentId, photoPath: f.photoPath }, off: { assignmentId: f.assignmentId } }),
  confirm_payment: (f) => ({ on: { houseId: f.house.id, fromId: f.house.members[0].userId, amount: 500 } }),
};

let admin: Sql;
let pool: Sql;
let execute: Executor;
let app: FastifyInstance;

const token = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(NOW.getTime() / 1000))
    .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
    .sign(new TextEncoder().encode(SECRET));

/** A house with a dealt week, a John of the admin's, and a question about its tick. */
async function fixture(): Promise<Fixture> {
  const house = await makeHouse(["Ava", "Ben"]);
  const week = weekWindow(NOW, ZONE, 1);
  await addJohns(house.id, [{ name: "Bins" }, { name: "Bath" }], week);
  const { assignments } = await deal(house.id, week, NOW);
  const mine = assignments.find((a) => a.user_id === house.admin.userId) ?? assignments[0];
  const [dispute] = await admin<{ id: string }[]>`
    insert into public.disputes (assignment_id, house_id, raised_by, reason, tick_at, closes_at)
    values (${mine.id}::uuid, ${house.id}::uuid, ${house.members[0].userId}::uuid, 'Was it done?', ${NOW}, ${new Date(NOW.getTime() + DAY)})
    returning id`;
  return { house, assignmentId: mine.id, disputeId: dispute.id, photoPath: `${house.id}/${randomUUID()}.jpg` };
}

/** Pass or none, as of the pretend clock. */
async function setPass(houseId: string, has: boolean) {
  if (has) await admin`update public.houses set pass_plan = 'yearly', pass_ends_at = ${new Date(NOW.getTime() + 30 * DAY)} where id = ${houseId}::uuid`;
  else await admin`update public.houses set pass_plan = 'trial', pass_ends_at = ${new Date(NOW.getTime() - DAY)} where id = ${houseId}::uuid`;
}

/** The problem code /v1 answers with, or "ok". */
async function viaV1(bearer: string, name: string, input: Record<string, unknown>): Promise<string> {
  const op = GATED.find((o) => o.name === name)!;
  const { method, path } = op.http;
  const rest = { ...input };
  const url = path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = String(rest[key]);
    delete rest[key];
    return value;
  });
  const res =
    method === "GET"
      ? await app.inject({ method, url, query: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)])), headers: { authorization: bearer } })
      : await app.inject({ method, url, payload: rest, headers: { authorization: bearer, "idempotency-key": randomUUID() } });
  if (res.statusCode < 300) return "ok";
  return (res.json() as { title: string }).title;
}

/** The problem code /mcp answers with ("approval" when it asks the person first), or "ok". */
async function viaMcp(bearer: string, name: string, input: Record<string, unknown>): Promise<string> {
  const handler = createMcpHandler(() => buildMcpServer(execute, bearer, GATED));
  const res = await handler.fetch(
    new Request("https://api.jonz.app/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }),
    }),
  );
  const text = await res.text();
  const json = text.trimStart().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
  const message = JSON.parse(json) as { result?: { isError?: boolean; content: { text: string }[] }; error?: { code: number } };
  if (message.error) return message.error.code === -32042 ? "approval" : `error ${message.error.code}`;
  if (!message.result!.isError) return "ok";
  return message.result!.content[0].text.split(":")[0];
}

const transports = { "/v1": viaV1, "/mcp": viaMcp } as const;

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  pool = connect(url.toString(), 2);
  const verify = tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: SECRET, currentDate: NOW });
  execute = createExecutor({ sql: pool, verify, operations: GATED, now: () => NOW, passEnforced: true, limits: { read: 1000, write: 1000 } });
  app = buildApp({ execute, operations: GATED });
});

afterAll(async () => {
  await admin.unsafe(`alter role jonz_api password null`);
  await app.close();
  await pool.end();
  await admin.end();
});

it("covers every operation the registry gates behind the Pass, and each is served on /v1 and /mcp", () => {
  const gated = (Object.keys(OPERATIONS) as OperationName[]).filter((n) => (OPERATIONS[n] as { entitlement?: string }).entitlement).sort();
  expect(GATED.map((o) => o.name).sort()).toEqual(gated);
  expect(Object.keys(INPUTS).sort()).toEqual(gated);
  // Where the input that turns the feature on can be left out, there's a case without it.
  const f = { house: { id: randomUUID(), admin: { userId: randomUUID() }, members: [{ userId: randomUUID() }] }, assignmentId: randomUUID(), disputeId: randomUUID(), photoPath: "p" } as unknown as Fixture;
  for (const op of GATED) {
    const when = op.operation.entitlementWhen;
    const { on, off } = INPUTS[op.name](f);
    expect(op.input.safeParse(on).success, `${op.name} input`).toBe(true);
    if (when) expect(on[when], `${op.name} turns its feature on`).toBeTruthy();
    const optional = when ? op.input.safeParse({ ...on, [when]: undefined }).success : false;
    expect(off !== undefined, `${op.name} has a case without ${when ?? "its feature"}`).toBe(optional);
  }
});

for (const [transport, call] of Object.entries(transports)) {
  it(`${transport}: without a Pass, each gated operation is refused with pass_required`, async () => {
    const f = await fixture();
    await setPass(f.house.id, false);
    const bearer = `Bearer ${await token(f.house.admin.userId)}`;
    for (const op of GATED) {
      expect(await call(bearer, op.name, INPUTS[op.name](f).on), `${transport} ${op.name}`).toBe("pass_required");
    }
    // Refused before it asks: nothing waits for the person to approve.
    const [{ n }] = await admin`select count(*)::int as n from public.api_approvals where house_id = ${f.house.id}::uuid`;
    expect(n).toBe(0);
  });

  it(`${transport}: with a Pass, each gated operation gets past the Pass`, async () => {
    const f = await fixture();
    await setPass(f.house.id, true);
    const bearer = `Bearer ${await token(f.house.admin.userId)}`;
    for (const op of GATED) {
      // It reaches the operation itself: done, refused by its own rules (a tick outside its week), or held for the person to approve.
      expect(await call(bearer, op.name, INPUTS[op.name](f).on), `${transport} ${op.name}`).toMatch(/^(ok|rejected|approval)$/);
    }
    expect(await call(bearer, "house_history", { houseId: f.house.id })).toBe("ok");
  });

  it(`${transport}: without a Pass, an operation gated by one input is free without it`, async () => {
    const f = await fixture();
    await setPass(f.house.id, false);
    const bearer = `Bearer ${await token(f.house.admin.userId)}`;
    for (const op of GATED) {
      const { off } = INPUTS[op.name](f);
      if (!off) continue;
      expect(await call(bearer, op.name, off), `${transport} ${op.name}`).not.toBe("pass_required");
    }
  });
}

it("asks the person before money is marked paid through /mcp, once the Pass lets it through", async () => {
  const f = await fixture();
  await setPass(f.house.id, true);
  const bearer = `Bearer ${await token(f.house.admin.userId)}`;
  expect(await viaMcp(bearer, "confirm_payment", INPUTS.confirm_payment(f).on)).toBe("approval");
});
