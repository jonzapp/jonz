// The house's reads over /v1 (migration 20261223090000), each its database
// function run as the person. The executor checks every answer against the
// operation's output contract, so a 200 here is also a contract that holds.

import { randomBytes, randomUUID } from "node:crypto";

import { connect, createExecutor, type Claims, type Sql, type TokenVerifier } from "@app/server";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app";
import { V1_OPERATIONS } from "../../src/operations";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0)); // pretend clock for the API's own bookkeeping

let admin: Sql;
let api: Sql;
let app: FastifyInstance;
const boss = randomUUID();
const mate = randomUUID();
const stranger = randomUUID();
const claims: Record<string, Claims> = Object.fromEntries(
  Object.entries({ boss, mate, stranger }).map(([k, sub]) => [k, { sub, role: "authenticated", aud: "authenticated" }]),
);
const verify: TokenVerifier = async (h) => {
  const c = h ? claims[h.replace(/^Bearer /, "")] : undefined;
  if (!c) throw new Error("no");
  return c;
};
type Who = "boss" | "mate" | "stranger";
const get = (who: Who, url: string) => app.inject({ method: "GET", url, headers: { authorization: `Bearer ${who}` } });

let houseId: string;
let weekId: string;
let assignmentId: string;
let eventIds: string[];

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 2);
  for (const id of [boss, mate, stranger]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`r-${id}@test.jonz.app`})`;
  app = buildApp({ execute: createExecutor({ sql: api, verify, operations: V1_OPERATIONS, now: () => NOW, limits: { read: 1000, write: 1000 } }), operations: V1_OPERATIONS });

  houseId = (await app.inject({ method: "POST", url: "/v1/houses", payload: { name: "Flat 12", timezone: "Europe/London", currency: "GBP", weekStarts: 1 }, headers: { authorization: "Bearer boss" } })).json();
  await admin`insert into public.members (house_id, user_id) values (${houseId}::uuid, ${mate}::uuid)`;
  // The week the database is in now, as the deal would make it.
  const [week] = await admin`
    insert into public.weeks (house_id, starts_on, starts_at, ends_at)
    select ${houseId}::uuid, d, d::timestamp at time zone 'Europe/London', (d + 7)::timestamp at time zone 'Europe/London'
    from (select public.week_starts_on(now(), 'Europe/London', 1::smallint) as d) w
    returning id, starts_at`;
  weekId = week.id;
  const [john] = await admin`insert into public.johns (house_id, name, anchor_week) values (${houseId}::uuid, 'Bins', 0) returning id`;
  const [a] = await admin`
    insert into public.assignments (week_id, house_id, user_id, john_id, name, category, points, due_at)
    values (${weekId}::uuid, ${houseId}::uuid, ${mate}::uuid, ${john.id}::uuid, 'Bins', 'other', 2, ${week.starts_at}::timestamptz + interval '2 days')
    returning id`;
  assignmentId = a.id;
  await admin`insert into public.crew_members (house_id, job_id, assignment_id, user_id, helper, points)
              select house_id, job_id, id, user_id, false, points from public.assignments where id = ${assignmentId}::uuid`.catch(() => {});
  eventIds = [];
  for (let i = 0; i < 5; i++) {
    const [e] = await admin`insert into public.events (house_id, kind, user_id, assignment_id, data, created_at)
                            values (${houseId}::uuid, 'done', ${mate}::uuid, ${assignmentId}::uuid, ${admin.json({ john_name: "Bins" })}, ${new Date(Date.UTC(2027, 0, 1, 12, i))})
                            returning id`;
    eventIds.push(e.id);
  }
  await admin`insert into public.events (house_id, kind, created_at) values (${houseId}::uuid, 'week_dealt', ${new Date(Date.UTC(2027, 0, 1, 13))})`;
  await admin`insert into public.reactions (event_id, user_id, kind) values (${eventIds[4]}::uuid, ${boss}::uuid, 'fire')`;
  await admin`insert into public.away_periods (house_id, user_id, starts_on, ends_on) values (${houseId}::uuid, ${mate}::uuid, '2027-01-10', '2027-01-12'), (${houseId}::uuid, ${mate}::uuid, '2026-01-10', '2026-01-12')`;
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id in ${admin([boss, mate, stranger])})`;
  await admin`delete from auth.users where id in ${admin([boss, mate, stranger])}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await app.close();
  await api.end();
  await admin.end();
});

describe("the house's reads on /v1", () => {
  it("reads Today in one call", async () => {
    const res = await get("mate", `/v1/houses/${houseId}/today`);
    expect(res.statusCode, res.body).toBe(200);
    const today = res.json();
    expect(today.house).toMatchObject({ id: houseId, name: "Flat 12", weekStarts: 1 });
    expect(today.members.map((m: { userId: string }) => m.userId)).toEqual([boss, mate]);
    expect(today.week).toMatchObject({ id: weekId });
    expect(today.assignments).toHaveLength(1);
    expect(today.assignments[0]).toMatchObject({ id: assignmentId, name: "Bins", everyWeeks: 1, everyMonths: null });
    expect(today).toMatchObject({ disputes: [], onCall: [], offers: [], moves: { lastMovedOut: null, lastJoined: expect.any(String) } });
  });

  it("is not_found to someone outside the house", async () => {
    expect((await get("stranger", `/v1/houses/${houseId}/today`)).json().title).toMatch(/forbidden|not_found/);
  });

  it("reads the John list", async () => {
    const res = await get("mate", `/v1/houses/${houseId}/johns`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ johns: [{ name: "Bins", everyWeeks: 1, dueTime: expect.any(String) }], groups: [] });
  });

  it("pages the Wall, newest first, without the deal's own posts", async () => {
    // Starting the house posted "joined" at the real time, before these 2027 posts: the oldest.
    const [joined] = await admin`select id from public.events where house_id = ${houseId}::uuid and kind = 'joined'`;
    eventIds.unshift(joined.id);
    const first = await get("mate", `/v1/houses/${houseId}/wall?limit=3`);
    expect(first.statusCode, first.body).toBe(200);
    const page = first.json();
    expect(page.data.map((e: { id: string }) => e.id)).toEqual([eventIds[5], eventIds[4], eventIds[3]]);
    expect(page.data[0].reactions).toEqual([{ userId: boss, kind: "fire" }]);
    expect(page.hasMore).toBe(true);
    const next = (await get("mate", `/v1/houses/${houseId}/wall?limit=4&startingAfter=${page.startingAfter}`)).json();
    expect(next.data.map((e: { id: string }) => e.id)).toEqual([eventIds[2], eventIds[1], eventIds[0]]);
    expect(next.hasMore).toBe(false);
  });

  it("reads time away from a day on", async () => {
    const res = await get("mate", `/v1/houses/${houseId}/away?from=2027-01-01`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual([expect.objectContaining({ userId: mate, startsOn: "2027-01-10", endsOn: "2027-01-12" })]);
  });

  it("reads a month's table, the track record, the money and pocket money", async () => {
    for (const path of ["month/2027-01", "record", "stake", "pocket-money"]) {
      const res = await get("boss", `/v1/houses/${houseId}/${path}`);
      expect(res.statusCode, `${path}: ${res.body}`).toBe(200);
    }
    const record = (await get("boss", `/v1/houses/${houseId}/record`)).json();
    expect(record.weeks.map((w: { id: string }) => w.id)).toEqual([weekId]);
    expect(record.assignments.map((a: { id: string }) => a.id)).toEqual([assignmentId]);
    expect(record.away).toHaveLength(2);
  });
});
