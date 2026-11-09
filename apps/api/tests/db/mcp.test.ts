// /mcp against the real database: two instances, each with its own pool, as
// a load balancer hands one person's MCP requests out. A house made through
// one is theirs through the other, the executor's checks hold (a stranger's
// token reads nothing of it), and the audit row says it came by MCP. What
// can't be undone waits for the person to approve it in Jonz, and a connected
// app's token can't go around /mcp to the tables.
//
// Tokens are signed with a test secret on a pretend clock, as apps/v1's own
// database tests do.

import { randomBytes, randomUUID } from "node:crypto";

import { connect, createExecutor, tokenVerifier, type Executor, type Sql } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { apiOperation } from "v1";

import { buildMcpServer } from "@/lib/mcp/server";
import { ANON_KEY, SUPABASE_URL } from "@/tests/support/env";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const SECRET = randomBytes(32).toString("hex");
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0));
const ops = [apiOperation("create_house"), apiOperation("my_permissions"), apiOperation("set_house_kind")];
// The local stack's signing secret (the Supabase CLI's default), for a token PostgREST takes.
const STACK_SECRET = process.env.SUPABASE_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

let admin: Sql;
const pools: Sql[] = [];
const executors: Executor[] = [];
const person = randomUUID();
const stranger = randomUUID();

const token = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(NOW.getTime() / 1000))
    .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
    .sign(new TextEncoder().encode(SECRET));

async function call(execute: Executor, bearer: string, name: string, args: Record<string, unknown>) {
  const handler = createMcpHandler(() => buildMcpServer(execute, bearer, ops));
  const res = await handler.fetch(
    new Request("https://api.jonz.app/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  const text = await res.text();
  const json = text.trimStart().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
  const message = JSON.parse(json) as {
    result: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] };
    error?: { code: number; message: string; data?: { elicitations?: { mode: string; url: string; elicitationId: string }[] } };
  };
  return message.error ? { isError: true, error: message.error, content: [{ text: message.error.message }] } : message.result;
}

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  for (const id of [person, stranger]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`m-${id}@test.jonz.app`})`;
  for (let i = 0; i < 2; i++) {
    const sql = connect(url.toString(), 2);
    pools.push(sql);
    const verify = tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: SECRET, currentDate: NOW });
    executors.push(createExecutor({ sql, verify, operations: ops, now: () => NOW }));
  }
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id = ${person}::uuid)`;
  await admin`delete from auth.users where id in (${person}::uuid, ${stranger}::uuid)`;
  await admin.unsafe(`alter role jonz_api password null`);
  await Promise.all(pools.map((p) => p.end()));
  await admin.end();
});

it("makes a house through one instance that the other then reads as theirs, and nobody else's", async () => {
  const mine = `Bearer ${await token(person)}`;
  const made = await call(executors[0], mine, "create_house", { name: "MCP house", timezone: "Europe/London", currency: "GBP", weekStarts: 1 });
  expect(made.isError, made.content[0]?.text).toBeFalsy();
  const houseId = made.structuredContent?.result as string;
  expect(houseId).toMatch(/^[0-9a-f-]{36}$/);

  const held = await call(executors[1], mine, "my_permissions", { houseId });
  expect(held.isError, held.content[0]?.text).toBeFalsy();
  expect(held.content[0].text).toContain("johns:write");

  const theirs = await call(executors[1], `Bearer ${await token(stranger)}`, "my_permissions", { houseId });
  expect(theirs.isError).toBeFalsy();
  expect(theirs.structuredContent).toEqual({ result: [] });

  const [audit] = await admin<{ via: string }[]>`select via from public.api_audit_entries where user_id = ${person}::uuid and operation = 'create_house'`;
  expect(audit?.via).toBe("mcp");
});

it("holds a change that can't be undone until the person approves it in Jonz, then makes it", async () => {
  const mine = `Bearer ${await token(person)}`;
  const [{ house_id: houseId }] = await admin<{ house_id: string }[]>`select house_id from public.members where user_id = ${person}::uuid`;
  const ask = { houseId, kind: "family" };

  // MCP 2025: the urlElicitationRequired error, with the page to open.
  const held = await call(executors[0], mine, "set_house_kind", ask);
  expect(held.isError).toBe(true);
  const error = (held as { error?: { code: number; data?: { elicitations?: { mode: string; url: string; elicitationId: string }[] } } }).error;
  expect(error?.code).toBe(-32042);
  const [elicitation] = error?.data?.elicitations ?? [];
  expect(elicitation).toMatchObject({ mode: "url", url: expect.stringMatching(/^https:\/\/jonz\.app\/approve\/[0-9a-f-]{36}$/) });
  expect(elicitation.elicitationId).toBe(elicitation.url.split("/").pop());

  // The person approves it in Jonz; the client's retry, on the other instance, makes it.
  await admin.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify({ sub: person, role: "authenticated" })}, true)`;
    await tx`select public.answer_api_approval(${elicitation.elicitationId}::uuid, true)`;
  });
  const done = await call(executors[1], mine, "set_house_kind", ask);
  expect(done.isError, done.content[0]?.text).toBeFalsy();
  const [h] = await admin<{ kind: string }[]>`select coalesce(next_kind, kind) as kind from public.houses where id = ${houseId}::uuid`;
  expect(h.kind).toBe("family");
});

it("refuses a connected app's token anywhere but /mcp", async () => {
  const sign = (claims: Record<string, unknown>) =>
    new SignJWT({ sub: person, role: "authenticated", aud: "authenticated", ...claims }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(STACK_SECRET));
  const rest = async (claims: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/rest/v1/houses?select=id&limit=1`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${await sign(claims)}` } });
  expect((await rest({})).status).toBe(200);
  const refused = await rest({ client_id: randomUUID() });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "42501", message: "Connected apps reach Jonz through https://api.jonz.app/mcp." });
});

it("refuses a token signed with anything else", async () => {
  const forged = await new SignJWT({ sub: person, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
    .sign(new TextEncoder().encode("not the secret".padEnd(32, "x")));
  const res = await call(executors[0], `Bearer ${forged}`, "my_permissions", { houseId: randomUUID() });
  expect(res.isError).toBe(true);
  expect(res.content[0].text).toMatch(/^unauthenticated:/);
});
