// The house's own writes over /v1 (migration 20261222090000): reactions,
// the John list and the house rules, each its database function run as the
// person, so the permission is checked by the API and again by the database.

import { randomBytes, randomUUID } from "node:crypto";

import { nextStartsOn, startMonths, weekIndex, weekWindow, type IsoDow } from "@app/core";
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
const boss = randomUUID();
const mate = randomUUID();
const claims: Record<string, Claims> = {
  boss: { sub: boss, role: "authenticated", aud: "authenticated" },
  mate: { sub: mate, role: "authenticated", aud: "authenticated" },
};
const verify: TokenVerifier = async (h) => {
  const c = h ? claims[h.replace(/^Bearer /, "")] : undefined;
  if (!c) throw new Error("no");
  return c;
};
const call = (who: "boss" | "mate", method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown>, headers: { authorization: `Bearer ${who}` } });

const JOHN = {
  name: "Bins",
  category: "kitchen",
  points: 2,
  everyWeeks: 2,
  dueDow: 7,
  dueTime: "21:00",
  needsPhoto: false,
  groupId: null,
};

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 2);
  for (const id of [boss, mate]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`h-${id}@test.jonz.app`})`;
  app = buildApp({ execute: createExecutor({ sql: api, verify, operations: V1_OPERATIONS, now: () => NOW, limits: { read: 1000, write: 1000 } }), operations: V1_OPERATIONS });
});

afterAll(async () => {
  await admin`delete from public.houses where id in (select house_id from public.members where user_id in ${admin([boss, mate])})`;
  await admin`delete from auth.users where id in ${admin([boss, mate])}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await app.close();
  await api.end();
  await admin.end();
});

describe("a John's timing in SQL matches core", () => {
  // Fixed moments either side of midnight, a month's end and a clock change.
  const moments = [
    "2027-01-04T09:30:00Z",
    "2027-01-03T23:30:00Z",
    "2027-03-28T00:30:00Z",
    "2027-10-31T23:59:00Z",
    "2027-12-31T22:00:00Z",
    "2028-02-29T12:00:00Z",
    "2026-11-09T05:00:00Z",
  ];
  const zones = ["Europe/London", "America/Regina", "Pacific/Auckland", "UTC"];

  it("finds the same week", async () => {
    for (const at of moments)
      for (const zone of zones)
        for (const weekStarts of [1, 3, 7] as IsoDow[]) {
          const [row] = await admin`select public.week_index_at(${at}::timestamptz, ${zone}, ${weekStarts}::smallint) as w`;
          expect(row.w, `${at} ${zone} ${weekStarts}`).toBe(weekIndex(weekWindow(new Date(at), zone, weekStarts).startsOn));
        }
  });

  it("finds the same first month", async () => {
    for (const at of moments)
      for (const zone of zones)
        for (const weekStarts of [1, 7] as IsoDow[])
          for (const weekOfMonth of [1, 2, 4, 5])
            for (const dueDow of [1, 5, 7] as IsoDow[]) {
              const [row] = await admin`select public.first_john_month(${at}::timestamptz, ${zone}, ${weekStarts}::smallint, ${weekOfMonth}::smallint, ${dueDow}::smallint) as m`;
              const want = startMonths({ everyMonths: 3, weekOfMonth, dueDow }, nextStartsOn(new Date(at), zone, weekStarts), weekStarts)[0]?.month ?? null;
              expect(row.m, `${at} ${zone} ${weekStarts} ${weekOfMonth} ${dueDow}`).toBe(want);
            }
  });
});

describe("the house's writes on /v1", () => {
  let houseId: string;
  let johnId: string;

  it("lets an admin add a John, counting from this week", async () => {
    houseId = (await call("boss", "POST", "/v1/houses", { name: "Flat 9", timezone: "America/Regina", currency: "CAD", weekStarts: 1 })).json();
    await admin`insert into public.members (house_id, user_id) values (${houseId}::uuid, ${mate}::uuid)`;
    const made = await call("boss", "POST", `/v1/houses/${houseId}/johns`, JOHN);
    expect(made.statusCode).toBe(201);
    johnId = made.json();
    const [row] = await admin`
      select name, every_weeks, anchor_week, anchor_month, crew, pay_minor, kind,
             anchor_week = public.week_index_at(created_at, 'America/Regina', 1::smallint) as this_week
      from public.johns where id = ${johnId}::uuid`;
    expect(row).toMatchObject({ name: "Bins", every_weeks: 2, anchor_month: null, crew: 1, pay_minor: 0, kind: "day", this_week: true });
  });

  it("refuses a housemate, in the API and in the database", async () => {
    expect((await call("mate", "POST", `/v1/houses/${houseId}/johns`, JOHN)).json().title).toBe("forbidden");
    // Taken away the API's check, the database still refuses.
    const refused = await admin
      .begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify(claims.mate)}, true)`;
        await tx`select public.remove_john(${johnId}::uuid)`;
      })
      .then(() => null, (e: Error) => e.message);
    expect(refused).toBe("admins_only");
  });

  it("adds several at once, all or none", async () => {
    const many = await call("boss", "POST", `/v1/houses/${houseId}/johns/batch`, {
      johns: [
        { ...JOHN, name: "Hoover" },
        { ...JOHN, name: "Deep clean", everyMonths: 3, weekOfMonth: 5, dueDow: 6, when: "on_call", crew: 3, keepDay: true },
      ],
    });
    expect(many.statusCode).toBe(201);
    const ids: string[] = many.json();
    expect(ids).toHaveLength(2);
    const rows = await admin`select name, every_weeks, every_months, week_of_month, anchor_month is not null as has_month, crew, keep_day from public.johns where id in ${admin(ids)} order by name`;
    expect(rows).toEqual([
      { name: "Deep clean", every_weeks: 1, every_months: 3, week_of_month: 5, has_month: true, crew: 1, keep_day: false },
      { name: "Hoover", every_weeks: 2, every_months: null, week_of_month: null, has_month: false, crew: 1, keep_day: false },
    ]);
    const before = await admin`select count(*)::int as n from public.johns where house_id = ${houseId}::uuid`;
    const bad = await call("boss", "POST", `/v1/houses/${houseId}/johns/batch`, { johns: [{ ...JOHN, name: "Ok" }, { ...JOHN, name: "Broken", groupId: randomUUID() }] });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    const after = await admin`select count(*)::int as n from public.johns where house_id = ${houseId}::uuid`;
    expect(after[0].n).toBe(before[0].n);
  });

  it("changes a John, keeping its week and its pay", async () => {
    await admin`update public.johns set pay_minor = 150 where id = ${johnId}::uuid`;
    const [was] = await admin`select anchor_week from public.johns where id = ${johnId}::uuid`;
    expect((await call("boss", "PATCH", `/v1/johns/${johnId}`, { ...JOHN, name: "Bins out", points: 3 })).statusCode).toBe(201);
    const [row] = await admin`select name, points, anchor_week, pay_minor from public.johns where id = ${johnId}::uuid`;
    expect(row).toEqual({ name: "Bins out", points: 3, anchor_week: was.anchor_week, pay_minor: 150 });
  });

  it("takes a John off the list", async () => {
    expect((await call("boss", "DELETE", `/v1/johns/${johnId}`)).statusCode).toBe(201);
    const [row] = await admin`select archived_at is not null as gone from public.johns where id = ${johnId}::uuid`;
    expect(row.gone).toBe(true);
    expect((await call("boss", "DELETE", `/v1/johns/${johnId}`)).json().title).toBe("forbidden");
  });

  it("saves the house rules, leaving out what a form doesn't show", async () => {
    await admin`update public.houses set late_hours = 6 where id = ${houseId}::uuid`;
    const rules = { name: "Flat 9b", timezone: "America/Regina", currency: "CAD", weekStarts: 7, stakeMinor: 500, lateForfeitMinor: 100, missedForfeitMinor: 200, disputeHours: 24, awayMakeup: 0 };
    expect((await call("boss", "PATCH", `/v1/houses/${houseId}/rules`, rules)).statusCode).toBe(201);
    const [row] = await admin`select name, week_starts, stake_minor, late_hours from public.houses where id = ${houseId}::uuid`;
    expect(row).toEqual({ name: "Flat 9b", week_starts: 7, stake_minor: 500, late_hours: 6 });
    expect((await call("mate", "PATCH", `/v1/houses/${houseId}/rules`, rules)).json().title).toBe("forbidden");
  });

  it("sets the deal mode", async () => {
    expect((await call("boss", "PATCH", `/v1/houses/${houseId}/deal-mode`, { mode: "classic" })).statusCode).toBe(201);
    const [row] = await admin`select deal_mode from public.houses where id = ${houseId}::uuid`;
    expect(row.deal_mode).toBe("classic");
  });

  it("reacts on the Wall, once, and takes it back", async () => {
    const [event] = await admin`insert into public.events (house_id, kind, user_id) values (${houseId}::uuid, 'done', ${boss}::uuid) returning id`;
    for (let i = 0; i < 2; i++) expect((await call("mate", "POST", `/v1/events/${event.id}/reactions`, { kind: "fire" })).statusCode).toBe(201);
    expect((await admin`select count(*)::int as n from public.reactions where event_id = ${event.id}::uuid`)[0].n).toBe(1);
    expect((await call("mate", "DELETE", `/v1/events/${event.id}/reactions/fire`)).statusCode).toBe(201);
    expect((await admin`select count(*)::int as n from public.reactions where event_id = ${event.id}::uuid`)[0].n).toBe(0);
  });
});
