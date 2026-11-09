// Your account's operations over /v1, each its database function run as
// you (migration 20261220090000): what the app's own table queries did.

import { randomBytes, randomUUID } from "node:crypto";

import { chatTitle, type SavedTurn } from "@app/core";
import { connect, createExecutor, type Claims, type Sql, type TokenVerifier } from "@app/server";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app";
import { V1_OPERATIONS } from "../../src/operations";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0)); // pretend clock

let admin: Sql;
let api: Sql;
let app: FastifyInstance;
const me = randomUUID();
const other = randomUUID();
const claims: Record<string, Claims> = {
  me: { sub: me, role: "authenticated", aud: "authenticated" },
  other: { sub: other, role: "authenticated", aud: "authenticated" },
};
const verify: TokenVerifier = async (h) => {
  const c = h ? claims[h.replace(/^Bearer /, "")] : undefined;
  if (!c) throw new Error("no");
  return c;
};
const call = (who: "me" | "other", method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown>, headers: { authorization: `Bearer ${who}` } });

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 2);
  for (const id of [me, other]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`a-${id}@test.jonz.app`})`;
  app = buildApp({ execute: createExecutor({ sql: api, verify, operations: V1_OPERATIONS, now: () => NOW, limits: { read: 1000, write: 1000 } }), operations: V1_OPERATIONS });
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id in ${admin([me, other])})`;
  await admin`delete from auth.users where id in ${admin([me, other])}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await app.close();
  await api.end();
  await admin.end();
});

describe("your account on /v1", () => {
  let houseId: string;

  it("says you're in no house, then the one you start", async () => {
    expect((await call("me", "GET", "/v1/me/house")).json()).toBeNull();
    const made = await call("me", "POST", "/v1/houses", { name: "Flat 4", timezone: "Europe/London", currency: "GBP", weekStarts: 1 });
    expect(made.statusCode).toBe(201);
    houseId = made.json();
    expect((await call("me", "GET", "/v1/me/house")).json()).toEqual({ houseId, name: "Flat 4", kind: "housemates" });
  });

  it("renames you, and only you", async () => {
    expect((await call("me", "PATCH", "/v1/me/name", { name: "Sam" })).statusCode).toBe(201);
    const [row] = await admin`select display_name from public.profiles where id = ${me}::uuid`;
    expect(row.display_name).toBe("Sam");
    expect((await call("me", "PATCH", "/v1/me/name", { name: "" })).json().title).toBe("invalid_input");
  });

  it("keeps your notification settings", async () => {
    expect((await call("me", "GET", "/v1/me/notifications")).json()).toBeNull();
    const prefs = { reminders: true, checks: false, flags: true, deal: false, quietFrom: 22, quietUntil: 7, timezone: "Europe/London" };
    expect((await call("me", "PATCH", "/v1/me/notifications", prefs)).statusCode).toBe(201);
    expect((await call("me", "GET", "/v1/me/notifications")).json()).toEqual(prefs);
    expect((await call("me", "PATCH", "/v1/me/notifications", { ...prefs, quietUntil: null })).json().title).toBe("invalid_input");
    expect((await call("other", "GET", "/v1/me/notifications")).json()).toBeNull();
  });

  it("adds and removes a push device, replacing one that subscribes again", async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    for (let i = 0; i < 2; i++) expect((await call("me", "POST", "/v1/me/push-devices", { endpoint, p256dh: `k${i}`, auth: "a" })).statusCode).toBe(201);
    expect((await admin`select p256dh from public.push_subscriptions where endpoint = ${endpoint}`).map((r) => r.p256dh)).toEqual(["k1"]);
    // Someone else can't take it over.
    expect((await call("other", "POST", "/v1/me/push-devices", { endpoint, p256dh: "x", auth: "a" })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await call("me", "DELETE", "/v1/me/push-devices", { endpoint })).statusCode).toBe(201);
    expect(await admin`select 1 from public.push_subscriptions where endpoint = ${endpoint}`).toHaveLength(0);
  });

  it("keeps Ask Jonz chats titled as the app titles them", async () => {
    const long: SavedTurn[] = [
      { role: "user", text: "  Can   you add a weekly John for the bins, recycling and the garden waste please?" },
      { role: "assistant", text: "Sure.", ask: null, hadCard: false },
    ] as SavedTurn[];
    const kept = await call("me", "POST", `/v1/houses/${houseId}/me/ask-chats`, { turns: long });
    expect(kept.statusCode).toBe(201);
    const chatId = kept.json();
    let list = (await call("me", "GET", `/v1/houses/${houseId}/me/ask-chats`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: chatId, title: chatTitle(long) });
    for (const turns of [[{ role: "user", text: "Short one" }], [], [{ role: "user", text: "x".repeat(80) }]] as SavedTurn[][]) {
      expect((await call("me", "PATCH", `/v1/me/ask-chats/${chatId}`, { turns })).statusCode).toBe(201);
      expect((await call("me", "GET", `/v1/me/ask-chats/${chatId}`)).json()).toMatchObject({ id: chatId, title: chatTitle(turns) });
    }
    // Not someone else's to read: to them there's no such chat.
    const theirs = await call("other", "GET", `/v1/me/ask-chats/${chatId}`);
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json()).toBeNull();
    expect((await call("me", "DELETE", `/v1/me/ask-chats/${chatId}`)).statusCode).toBe(201);
    list = (await call("me", "GET", `/v1/houses/${houseId}/me/ask-chats`)).json();
    expect(list).toEqual([]);
  });

  it("shows the notices on now", async () => {
    const res = await call("me", "GET", "/v1/notices");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
