// The owner's reads and chats over /v1 (migration 20261224090000), each its
// database function run as the owner. Only an owner who has passed their
// second factor gets them: the API refuses anyone else, and so does the
// database.

import { randomBytes, randomUUID } from "node:crypto";

import { auditRowWords, chatTitle, type AuditEntry, type SavedTurn, wordsFor } from "@app/core";
import { connect, createExecutor, type Claims, type Sql, type TokenVerifier } from "@app/server";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app";
import { V1_OPERATIONS } from "../../src/operations";

const words = wordsFor("en", "housemates");

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0)); // pretend clock for the API's own bookkeeping

let admin: Sql;
let api: Sql;
let app: FastifyInstance;
const owner = randomUUID();
const person = randomUUID();
const claims: Record<string, Claims> = {
  owner: { sub: owner, role: "authenticated", aud: "authenticated", aal: "aal2" },
  ownerNoCode: { sub: owner, role: "authenticated", aud: "authenticated", aal: "aal1" },
  person: { sub: person, role: "authenticated", aud: "authenticated", aal: "aal2" },
};
const verify: TokenVerifier = async (h) => {
  const c = h ? claims[h.replace(/^Bearer /, "")] : undefined;
  if (!c) throw new Error("no");
  return c;
};
type Who = keyof typeof claims;
const call = (who: Who, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown>, headers: { authorization: `Bearer ${who}` } });

// Words only this run's rows have, so other runs' notices and entries don't count.
const tag = `zq${randomBytes(4).toString("hex")}`;
let notices: string[];
let entries: number[];

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  api = connect(url.toString(), 2);
  for (const id of [owner, person]) await admin`insert into auth.users (id, email) values (${id}::uuid, ${`o-${id}@test.jonz.app`})`;
  await admin`insert into public.app_owners (user_id, role) values (${owner}::uuid, 'owner')`;
  app = buildApp({ execute: createExecutor({ sql: api, verify, operations: V1_OPERATIONS, now: () => NOW, limits: { read: 1000, write: 1000 } }), operations: V1_OPERATIONS });

  notices = [];
  // Ended, on now, and starting in ten years: one of each state, whatever today is.
  for (const [i, kind, starts, ends] of [
    [0, "news", "2020-01-01T00:00:00Z", "2020-02-01T00:00:00Z"],
    [1, "status", "2020-03-01T00:00:00Z", null],
    [2, "offer", "2099-01-01T00:00:00Z", null],
  ] as const) {
    const [n] = await admin`insert into public.notices (kind, title, body, starts_at, ends_at) values (${kind}, ${`${tag} notice ${i}`}, 'Body', ${starts}, ${ends}) returning id`;
    notices.push(n.id);
  }
  entries = [];
  for (const [i, actor, action] of [
    [0, owner, "notice.save"],
    [1, null, "account.delete"],
    [2, person, "account.restore"],
  ] as const) {
    const [e] = await admin`insert into public.admin_audit (created_at, actor, action, target_kind, target_id, reason)
                            values (${new Date(Date.UTC(2027, 0, 1, 12, i))}, ${actor}, ${action}, 'account', ${`${tag}-${i}`}, 'Because')
                            returning id`;
    entries.push(Number(e.id));
  }
});

afterAll(async () => {
  await admin`delete from public.notices where title like ${`${tag}%`}`;
  // The audit log only grows (audit_append_only): this run's entries stay, under their own words.
  await admin`delete from public.app_owners where user_id = ${owner}::uuid`;
  await admin`delete from auth.users where id in ${admin([owner, person])}`;
  await admin.unsafe(`alter role jonz_api password null`);
  await app.close();
  await api.end();
  await admin.end();
});

describe("the owner's reads on /v1", () => {
  it("narrows and pages every notice", async () => {
    const all = await call("owner", "GET", `/v1/admin/notices?q=${tag}`);
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data.map((n: { id: string }) => n.id)).toEqual([notices[2], notices[1], notices[0]]);
    expect((await call("owner", "GET", `/v1/admin/notices/count?q=${tag}`)).json()).toBe(3);
    for (const [state, i] of [["ended", 0], ["live", 1], ["scheduled", 2]] as const) {
      expect((await call("owner", "GET", `/v1/admin/notices?q=${tag}&state=${state}`)).json().data.map((n: { id: string }) => n.id)).toEqual([notices[i]]);
    }
    expect((await call("owner", "GET", `/v1/admin/notices?q=${tag}&kind=offer`)).json().data).toHaveLength(1);
    const first = (await call("owner", "GET", `/v1/admin/notices?q=${tag}&limit=2`)).json();
    expect(first.hasMore).toBe(true);
    const next = (await call("owner", "GET", `/v1/admin/notices?q=${tag}&limit=2&startingAfter=${first.startingAfter}`)).json();
    expect(next.data.map((n: { id: string }) => n.id)).toEqual([notices[0]]);
  });

  it("narrows and pages the audit log, by who, what and words", async () => {
    const all = await call("owner", "GET", `/v1/admin/audit?q=${tag}`);
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data.map((e: { id: number }) => e.id)).toEqual([entries[2], entries[1], entries[0]]);
    expect((await call("owner", "GET", `/v1/admin/audit/count?q=${tag}`)).json()).toBe(3);
    const ids = async (query: string) => (await call("owner", "GET", `/v1/admin/audit?q=${tag}&${query}`)).json().data.map((e: { id: number }) => e.id);
    expect(await ids("who=you")).toEqual([entries[0]]);
    expect(await ids("who=others")).toEqual([entries[2]]);
    expect(await ids("who=jonz")).toEqual([entries[1]]);
    expect(await ids("what=notices")).toEqual([entries[0]]);
    expect(await ids("what=accounts")).toEqual([entries[2], entries[1]]);
    // An entry number finds that entry.
    expect((await call("owner", "GET", `/v1/admin/audit?q=%23${entries[1]}`)).json().data.map((e: { id: number }) => e.id)).toContain(entries[1]);
    const first = (await call("owner", "GET", `/v1/admin/audit?q=${tag}&limit=2`)).json();
    const next = (await call("owner", "GET", `/v1/admin/audit?q=${tag}&limit=2&startingAfter=${first.startingAfter}`)).json();
    expect(next.data.map((e: { id: number }) => e.id)).toEqual([entries[0]]);
  });

  it("finds the words each row shows, in any order, as core says them", async () => {
    // One entry of every kind the log names in words, and one it doesn't. Each
    // account id starts with words only these entries have.
    const rows = `zr${randomBytes(4).toString("hex")}`;
    const kinds: [string, string | null, unknown, unknown][] = [
      ["notice.save", owner, null, { kind: "news", title: "Bins day moved" }],
      ["notice.save", person, { title: "Old" }, { kind: "offer", title: "Founding pass" }],
      ["notice.end", owner, null, { kind: "status", title: "Ticks slow" }],
      ["account.delete_request", null, null, { requested_by: "self" }],
      ["account.delete_request", owner, null, { requested_by: "owner" }],
      ["account.delete_keep", person, null, null],
      ["account.delete_stop", owner, null, null],
      ["account.delete_now", owner, null, null],
      ["account.delete_done", null, null, null],
      ["house.open", null, null, null],
    ];
    const made: AuditEntry[] = [];
    for (const [i, [action, actor, before, after]] of kinds.entries()) {
      const [e] = await admin`insert into public.admin_audit (created_at, actor, action, target_kind, target_id, before, after)
                              values (${new Date(Date.UTC(2027, 0, 2, 12, i))}, ${actor}, ${action}, 'account', ${`${rows}${i}`},
                                      ${before === null ? null : admin.json(before as never)}, ${after === null ? null : admin.json(after as never)})
                              returning id`;
      made.push({ id: Number(e.id), at: "", actor, action, targetKind: "account", targetId: `${rows}${i}`, reason: null, before, after } as AuditEntry);
    }
    for (const entry of made) {
      const [{ words }] = await admin`select public.audit_row_words(a, ${owner}::uuid) as words from public.admin_audit a where a.id = ${entry.id}`;
      expect(words).toBe(auditRowWords(entry, owner));
    }
    const found = async (q: string) =>
      (await call("owner", "GET", `/v1/admin/audit?q=${encodeURIComponent(`${rows} ${q}`)}`)).json().data.map((e: { id: number }) => e.id);
    const id = (i: number) => made[i].id;
    // What the row says, in any order and any case.
    expect(await found("deleted")).toEqual([id(8), id(7)]);
    expect(await found("ACCOUNT deleted")).toEqual([id(8), id(7)]);
    expect(await found("changed an offer")).toEqual([id(1)]);
    expect(await found("you ended")).toEqual([id(2)]);
    expect(await found("the owner")).toEqual([id(1)]);
    expect(await found("someone")).toEqual([id(5), id(3)]);
    expect(await found("bins moved")).toEqual([id(0)]);
    expect(await found("house.open")).toEqual([id(9)]);
    // Every word has to be there.
    expect(await found("deleted offer")).toEqual([]);
  });

  it("reads one entry, or null", async () => {
    expect((await call("owner", "GET", `/v1/admin/audit/${entries[1]}`)).json()).toMatchObject({ id: entries[1], action: "account.delete", actor: null });
    expect((await call("owner", "GET", `/v1/admin/audit/999999999999`)).json()).toBeNull();
  });

  it("refuses an owner without their code, and anyone else, in the API and the database", async () => {
    for (const who of ["ownerNoCode", "person"] as const) {
      expect((await call(who, "GET", `/v1/admin/audit?q=${tag}`)).json().title).toBe("forbidden");
    }
    // Taken away the API's check, the database refuses them too.
    for (const who of ["ownerNoCode", "person"] as const) {
      const refused = await admin
        .begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify(claims[who])}, true)`;
          await tx`select count(*) from public.owner_audit_page(${tag})`;
        })
        .then(() => null, (e: Error) => e.message);
      expect(refused).toBe("owner_only");
    }
  });
});

describe("the owner's Ask Jonz chats on /v1", () => {
  const turns: SavedTurn[] = [
    { role: "user", text: "Which houses haven't dealt a week this month and why not?" },
    { role: "assistant", text: "Two.", ask: null, hadCard: false },
  ];

  it("keeps, reads, updates and deletes a chat, titled as core titles it", async () => {
    const kept = await call("owner", "POST", "/v1/admin/ask-chats", { turns });
    expect(kept.statusCode, kept.body).toBe(201);
    const chatId: string = kept.json();
    expect((await call("owner", "GET", "/v1/admin/ask-chats")).json()).toEqual([expect.objectContaining({ id: chatId, title: chatTitle(turns, words) })]);
    expect((await call("owner", "GET", `/v1/admin/ask-chats/${chatId}`)).json()).toEqual({ id: chatId, title: chatTitle(turns, words), turns });
    const more = [...turns, { role: "user" as const, text: "And last month?" }];
    const patched = await call("owner", "PATCH", `/v1/admin/ask-chats/${chatId}`, { turns: more });
    expect(patched.statusCode, patched.body).toBe(201);
    expect((await call("owner", "GET", `/v1/admin/ask-chats/${chatId}`)).json().turns).toHaveLength(3);
    expect((await call("person", "GET", `/v1/admin/ask-chats/${chatId}`)).json().title).toBe("forbidden");
    expect((await call("owner", "DELETE", `/v1/admin/ask-chats/${chatId}`)).statusCode).toBe(201);
    expect((await call("owner", "GET", "/v1/admin/ask-chats")).json()).toEqual([]);
  });
});
