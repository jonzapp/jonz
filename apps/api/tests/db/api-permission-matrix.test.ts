// Who /v1 lets do what, asked of every operation as every kind of person,
// through the executor that serves /v1 and /mcp (with this app's server
// handlers), against the real stack.
//
// The server's own steps run as Supabase's service role, past Row Level
// Security, so the API's permission check is the only thing in front of
// them. This file holds that check to the answer key (HOUSE_MATRIX and
// OWNER_MATRIX in @app/core), cell by cell:
//
// - every house operation, as a house admin and a member, a family's Parent
//   and Kid, and someone outside the house;
// - every admin page operation, as the owner and a support helper (with
//   their code this session), the owner without it, and anyone else;
// - every operation, with no sign-in at all.
//
// A refusal must be the API's own (`You need <permission>…`), so it is known
// to have come before anything ran, and it must leave the database exactly as
// it was. An allowed call may still fail for its own reasons (the sample
// input is made up); it just mustn't be refused for the permission.
//
// The clock is a pretend one; tokens are signed with the stack's secret and
// last from 2020 to 2100, so they hold whatever day this runs.

import { randomUUID } from "node:crypto";

import {
  ASK_REFS,
  HOUSE_MATRIX,
  OPERATION_IO,
  OPERATIONS,
  OWNER_MATRIX,
  type Operation,
  type OperationName,
  type OwnerPermission,
  type Permission,
} from "@app/core";
import { connect, createExecutor, Problem, tokenVerifier, type Executor, type Sql } from "@app/server";
import { SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withHandlers } from "v1";
import { z } from "zod";

import { V1_HANDLERS } from "@/lib/v1/handlers";
import { restoreApiRole } from "../support/api-role";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const STACK_SECRET = process.env.SUPABASE_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const NOW = new Date(Date.UTC(2027, 0, 4, 9, 30, 0));
const WEEK_START = "2027-01-04";
const ISSUED = Date.UTC(2020, 0, 1) / 1000;
const EXPIRES = Date.UTC(2100, 0, 1) / 1000;

const OPERATIONS_SERVED = withHandlers(V1_HANDLERS);
const NAMES = OPERATIONS_SERVED.map((o) => o.name as OperationName);
const op = (name: OperationName): Operation => OPERATIONS[name];
const houseOps = NAMES.filter((n) => op(n).scope === "house" && op(n).guard.by === "permission");
const appOps = NAMES.filter((n) => op(n).scope === "app" && op(n).guard.by === "permission");
const permissionOf = (name: OperationName) => {
  const g = op(name).guard;
  if (g.by !== "permission") throw new Error(`${name} names no permission`);
  return g.permission;
};

let admin: Sql;
let api: Sql;
let execute: Executor;

// --- People, houses and rows to point at -----------------------------------

interface Person {
  id: string;
  aal?: "aal1" | "aal2";
}

const token = async (who: Person) =>
  `Bearer ${await new SignJWT({ sub: who.id, role: "authenticated", aud: "authenticated", aal: who.aal ?? "aal1", email: `m-${who.id}@test.jonz.app` })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(ISSUED)
    .setExpirationTime(EXPIRES)
    .sign(new TextEncoder().encode(STACK_SECRET))}`;

const made: { users: string[]; houses: string[] } = { users: [], houses: [] };

async function person(aal?: Person["aal"]): Promise<Person> {
  const id = randomUUID();
  await admin`insert into auth.users (id, email) values (${id}::uuid, ${`m-${id}@test.jonz.app`})`;
  made.users.push(id);
  return { id, aal };
}

/** The ids an operation's input can point at: rows in one house, so the API finds the house from any of them. */
interface Rows {
  houseId: string;
  weekId: string;
  johnId: string;
  groupId: string;
  /** Two of the house's kinds of John: one to change or delete, one for its Johns to move to. */
  kindId: string;
  moveToId: string;
  /** The admin's John and the member's. */
  adminsJohn: string;
  membersJohn: string;
  disputeId: string;
  offerId: string;
  actionId: string;
  eventId: string;
  adminId: string;
  memberId: string;
}

/** A house with an admin and a member, and one of every row an operation may name. */
async function house(kind: "housemates" | "family"): Promise<{ rows: Rows; admin: Person; member: Person }> {
  const boss = await person();
  const mate = await person();
  const made_ = await execute("create_house", { authorization: await token(boss), via: "api" }, { name: `Matrix ${kind}`, timezone: "Europe/London", currency: "GBP", weekStarts: 1, kind });
  const houseId = made_.body as string;
  made.houses.push(houseId);
  await admin`insert into public.members (house_id, user_id, role, joined_at) values (${houseId}::uuid, ${mate.id}::uuid, 'member', '2020-01-01')`;
  await admin`update public.members set joined_at = '2020-01-01' where house_id = ${houseId}::uuid`;
  const [week] = await admin<{ id: string }[]>`
    insert into public.weeks (house_id, starts_on, starts_at, ends_at)
    values (${houseId}::uuid, ${WEEK_START}, ${new Date(Date.UTC(2027, 0, 4))}, ${new Date(Date.UTC(2027, 0, 11))}) returning id`;
  const [group] = await admin<{ id: string }[]>`insert into public.groups (house_id, name) values (${houseId}::uuid, 'Upstairs') returning id`;
  const kinds = await admin<{ id: string; preset: string | null }[]>`select id, preset from public.john_kinds where house_id = ${houseId}::uuid`;
  const kindOf = (preset: string) => kinds.find((k) => k.preset === preset)!.id;
  const [john] = await admin<{ id: string }[]>`
    insert into public.johns (house_id, name, john_kind_id, points, anchor_week, group_id)
    values (${houseId}::uuid, 'Dishes', ${kindOf("kitchen")}::uuid, 2, 0, ${group.id}::uuid) returning id`;
  const assign = async (who: Person, done: boolean) => {
    const [row] = await admin<{ id: string }[]>`
      insert into public.assignments (week_id, house_id, john_id, user_id, name, points, due_at, done_at)
      values (${week.id}::uuid, ${houseId}::uuid, ${john.id}::uuid, ${who.id}::uuid, 'Dishes', 2,
              ${new Date(Date.UTC(2027, 0, 6, 18))}, ${done ? new Date(Date.UTC(2027, 0, 4, 8)) : null}) returning id`;
    return row.id;
  };
  const adminsJohn = await assign(boss, true);
  const membersJohn = await assign(mate, false);
  const [dispute] = await admin<{ id: string }[]>`
    insert into public.disputes (assignment_id, house_id, raised_by, reason, tick_at, closes_at)
    values (${adminsJohn}::uuid, ${houseId}::uuid, ${mate.id}::uuid, 'Not done', ${new Date(Date.UTC(2027, 0, 4, 8))}, ${new Date(Date.UTC(2027, 0, 5, 8))}) returning id`;
  const [offer] = await admin<{ id: string }[]>`
    insert into public.swap_offers (house_id, asker_assignment_id, asked_assignment_id, asked_by, asked_user_id, expires_at)
    values (${houseId}::uuid, ${membersJohn}::uuid, ${adminsJohn}::uuid, ${mate.id}::uuid, ${boss.id}::uuid, ${new Date(Date.UTC(2027, 0, 4, 23))}) returning id`;
  const [action] = await admin<{ id: string }[]>`
    insert into public.house_actions (house_id, done_by, kind, assignment_id) values (${houseId}::uuid, ${boss.id}::uuid, 'tick', ${adminsJohn}::uuid) returning id`;
  const [event] = await admin<{ id: string }[]>`
    insert into public.events (house_id, kind, user_id, assignment_id) values (${houseId}::uuid, 'done', ${boss.id}::uuid, ${adminsJohn}::uuid) returning id`;
  return {
    admin: boss,
    member: mate,
    rows: {
      houseId,
      weekId: week.id,
      johnId: john.id,
      groupId: group.id,
      kindId: kindOf("kitchen"),
      moveToId: kindOf("other"),
      adminsJohn,
      membersJohn,
      disputeId: dispute.id,
      offerId: offer.id,
      actionId: action.id,
      eventId: event.id,
      adminId: boss.id,
      memberId: mate.id,
    },
  };
}

// --- A valid input for any operation, from its own schema ------------------

type Json = { [k: string]: unknown };

/** Values for the keys that name rows: the house's own, so the API finds the house from them. */
function refValue(key: string, rows: Rows, caller: string): string | undefined {
  const other = caller === rows.adminId ? rows.memberId : rows.adminId;
  const mineJohn = caller === rows.adminId ? rows.adminsJohn : rows.membersJohn;
  const theirJohn = caller === rows.adminId ? rows.membersJohn : rows.adminsJohn;
  const byKey: Record<string, string> = {
    houseId: rows.houseId,
    fromId: rows.houseId,
    weekId: rows.weekId,
    johnId: rows.johnId,
    groupId: rows.groupId,
    kindId: rows.kindId,
    moveToId: rows.moveToId,
    assignmentId: mineJohn,
    mine: mineJohn,
    theirs: theirJohn,
    disputeId: rows.disputeId,
    offerId: rows.offerId,
    actionId: rows.actionId,
    eventId: rows.eventId,
    userId: other,
    toId: other,
    kidId: rows.memberId,
  };
  return byKey[key];
}

function sample(schema: Json, key: string, rows: Rows, caller: string): unknown {
  const ref = refValue(key, rows, caller);
  if (schema.anyOf) return sample((schema.anyOf as Json[]).find((s) => s.type !== "null") ?? (schema.anyOf as Json[])[0], key, rows, caller);
  if (schema.oneOf) return sample((schema.oneOf as Json[])[0], key, rows, caller);
  if (schema.allOf) return sample(Object.assign({}, ...(schema.allOf as Json[])), key, rows, caller);
  if ("const" in schema) return schema.const;
  if (schema.enum) return (schema.enum as unknown[])[0];
  if ("default" in schema && schema.type !== "object") return schema.default;
  switch (schema.type) {
    case "object": {
      const props = (schema.properties ?? {}) as Record<string, Json>;
      const out: Json = {};
      for (const [k, s] of Object.entries(props)) out[k] = sample(s, k, rows, caller);
      return out;
    }
    case "array": {
      const min = Math.max(1, Number(schema.minItems ?? 1));
      const items = (schema.items ?? {}) as Json;
      if (key === "crew" || key === "userIds") return [rows.memberId].slice(0, min);
      return Array.from({ length: min }, () => sample(items, key.replace(/s$/, ""), rows, caller));
    }
    case "integer":
    case "number": {
      if (key === "quietUntil") return 7;
      const min = schema.minimum ?? (typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : undefined);
      const max = schema.maximum;
      // Zod writes "any safe integer" as a minimum of -2^53+1: start from 0.
      const bounded = typeof min === "number" && min > Number.MIN_SAFE_INTEGER;
      const v = bounded ? min : typeof min === "number" ? 0 : typeof max === "number" ? Math.min(1, max) : 1;
      return schema.type === "integer" ? Math.ceil(v as number) : v;
    }
    case "boolean":
      return false;
    case "null":
      return null;
    case "string": {
      if (ref) return ref;
      const format = schema.format as string | undefined;
      if (format === "uuid") return randomUUID();
      if (format === "email") return "someone@test.jonz.app";
      if (format === "date-time") return NOW.toISOString();
      if (format === "date") return WEEK_START;
      if (format === "uri" || format === "url") return "https://jonz.app/";
      if (schema.pattern) {
        const p = String(schema.pattern);
        if (p.includes(":")) return "18:00";
        if (p === "^\\d{4}-\\d{2}$") return WEEK_START.slice(0, 7);
        if (/\\d\{4\}-/.test(p)) return WEEK_START;
        if (p.startsWith("^[A-Z0-9]")) return "TEST1234";
        if (p.startsWith("^#")) return "#4f9a2e";
        throw new Error(`No sample for pattern ${p} at ${key}`);
      }
      // A code is upper-cased before its pattern, so the pattern isn't in the input schema.
      if (key === "code") return "TEST1234";
      const min = Number(schema.minLength ?? 1);
      return "x".repeat(Math.max(min, 1)).padEnd(Math.max(min, 1), "x");
    }
    default:
      return ref ?? null;
  }
}

/** A made-up input the operation's own schema takes, pointing at `rows`. */
function inputFor(name: OperationName, rows: Rows, caller: string): unknown {
  const schema = OPERATION_IO[name].input as z.ZodType;
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Json;
  const value = sample(json, "", rows, caller);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`No sample input for ${name}: ${z.prettifyError(parsed.error)}\n${JSON.stringify(value)}`);
  return value;
}

// --- Asking, and what the answer means -------------------------------------

type Outcome = { kind: "ok" } | { kind: "refused"; code: string; message: string };

async function ask(name: OperationName, who: Person | null, input: unknown): Promise<Outcome> {
  try {
    await execute(name, { authorization: who ? await token(who) : null, via: "api" }, input);
    return { kind: "ok" };
  } catch (e) {
    if (e instanceof Problem) return { kind: "refused", code: e.code, message: e.message };
    throw e;
  }
}

/** Refused by the API's own permission check (before anything ran), for exactly this permission. */
const refusedFor = (o: Outcome, permission: string) => o.kind === "refused" && o.code === "forbidden" && o.message.startsWith(`You need ${permission}`);

/** What the database holds, all of it but the request counters: a refusal mustn't change it. */
async function fingerprint(): Promise<string> {
  const tables = await admin<{ t: string }[]>`
    select c.relname as t from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('api_rate_limits')
    order by 1`;
  const parts: string[] = [];
  for (const { t } of tables) {
    const [row] = await admin.unsafe<{ h: string | null }[]>(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from public."${t}" x`);
    parts.push(`${t}:${row.h}`);
  }
  return parts.join("\n");
}

// --- Setup -----------------------------------------------------------------

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const url = new URL(process.env.API_DATABASE_URL ?? DB_URL);
  if (!process.env.API_DATABASE_URL) {
    const password = randomUUID().replace(/-/g, "");
    await admin.unsafe(`alter role jonz_api password '${password}'`);
    url.username = "jonz_api";
    url.password = password;
  }
  api = connect(url.toString(), 2);
  execute = createExecutor({
    sql: api,
    verify: tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: STACK_SECRET, currentDate: NOW }),
    operations: OPERATIONS_SERVED,
    now: () => NOW,
    limits: { read: 100_000, write: 100_000 },
  });
});

afterAll(async () => {
  if (made.houses.length) await admin`delete from public.houses where id in ${admin(made.houses)}`;
  if (made.users.length) {
    await admin`delete from public.app_owners where user_id in ${admin(made.users)}`;
    await admin`delete from auth.users where id in ${admin(made.users)}`;
  }
  await restoreApiRole(admin);
  await api.end();
  await admin.end();
});

// --- The registry agrees with the answer key -------------------------------

describe("every operation /v1 serves", () => {
  it("names a permission the answer key has, unless it's a check or about your own account", () => {
    for (const name of NAMES) {
      const o = op(name);
      if (o.guard.by === "check") continue;
      const p = permissionOf(name);
      if (o.scope === "house") expect(Object.keys(HOUSE_MATRIX), name).toContain(p);
      else if (o.scope === "app") expect(Object.keys(OWNER_MATRIX), name).toContain(p);
      else expect(p.startsWith("account:"), name).toBe(true);
    }
  });

  it("that runs as the server names a house or app permission, or only touches your own account", () => {
    const asServer = NAMES.filter((n) => n in V1_HANDLERS || op(n).rpc?.server);
    expect(asServer.length).toBeGreaterThan(0);
    for (const name of asServer) {
      const o = op(name);
      expect(o.guard.by, `${name} runs as the server, so it must name a permission`).toBe("permission");
      if (o.scope === "account") expect(permissionOf(name).startsWith("account:"), name).toBe(true);
    }
  });

  // The operations whose work runs as the server, past Row Level Security, and the
  // permission each asks for. Nothing in the database backs these up, so a new one,
  // or a change to what one asks for, must be made here as well, on purpose.
  // (Every other operation runs as the person, and the database checks it again.)
  const SERVER_RUN: Record<string, string> = {
    set_away: "account:write_own",
    file_upload: "account:write_own",
    file_links: "account:read",
    send_report: "account:write_own",
    write_back: "account:write_own",
    ask_usage: "house:read",
    list_pages: "account:read",
    read_page: "account:read",
    catch_up: "house:read",
    proof_upload: "ticks:write_own",
    roll_call: "ticks:write_own",
    offer_swap: "swaps:write_own",
    raise_flag: "flags:write_own",
    raise_dispute: "disputes:write_own",
    cast_vote: "disputes:write_own",
    ask_house: "house:read",
    pass_checkout: "billing:write_own",
    pass_billing: "billing:write_own",
    answer_tick: "ticks:write",
    deal_week: "weeks:write",
    reset_house: "history:write",
    add_kid: "members:write",
    ask_owner: "admin:read",
    owner_reply_report: "reports:write",
    owner_fix_report: "reports:write",
    claim_support_draft: "reports:write",
    write_notice_copy: "notices:write",
    owner_send_message: "messages:write",
    owner_make_promotion: "promotions:write",
    retry_promotion: "promotions:write",
    owner_stop_promotion: "promotions:write",
    owner_promotion_emails: "promotions:write",
    owner_delete_house: "houses:write",
  };

  it("that runs as the server asks for exactly the permission written down for it here", () => {
    const asServer = Object.fromEntries(NAMES.filter((n) => n in V1_HANDLERS || op(n).rpc?.server).map((n) => [n, permissionOf(n)]));
    expect(asServer).toEqual(SERVER_RUN);
  });

  it("whose function is the server's alone can't be called by a signed-in person straight", async () => {
    const fns = [...new Set(NAMES.map((n) => op(n).rpc).filter((r) => r?.server).map((r) => r!.name))];
    for (const fn of fns) {
      const rows = await admin<{ callable: boolean }[]>`
        select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as callable
        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = ${fn}`;
      expect(rows[0].callable, `authenticated may call public.${fn}`).toBe(false);
    }
  });

  it("refuses anyone not signed in", async () => {
    const world = await house("housemates");
    for (const name of NAMES) {
      const out = await ask(name, null, inputFor(name, world.rows, world.rows.adminId));
      expect(out, name).toMatchObject({ kind: "refused", code: "unauthenticated" });
    }
  });
});

// --- Houses ----------------------------------------------------------------

describe.each(["housemates", "family"] as const)("in a %s house, every house operation", (kind) => {
  const roles = kind === "family" ? { admin: "a Parent", member: "a Kid" } : { admin: "an admin", member: "a member" };

  it(`refuses someone outside the house, ${roles.member} and ${roles.admin} exactly where the answer key says, and a refusal changes nothing`, async () => {
    const world = await house(kind);
    const outsider = await person();
    const before = await fingerprint();
    const misses: string[] = [];
    for (const name of houseOps) {
      const permission = permissionOf(name) as Permission;
      const cell = HOUSE_MATRIX[permission];
      // Outside the house: refused, by the permission, or (for a row they can't see) as not there, or
      // (for an operation that finds the house from their own membership) asked which house.
      const out = await ask(name, outsider, inputFor(name, world.rows, outsider.id));
      if (!(refusedFor(out, permission) || (out.kind === "refused" && (out.code === "not_found" || out.message.startsWith("Which house?"))))) misses.push(`outsider ${name}: ${JSON.stringify(out)}`);
      for (const [role, who] of [["member", world.member], ["admin", world.admin]] as const) {
        if (cell[role]) continue;
        const answer = await ask(name, who, inputFor(name, world.rows, who.id));
        if (!refusedFor(answer, permission)) misses.push(`${role} ${name} should be refused for ${permission}: ${JSON.stringify(answer)}`);
      }
    }
    expect(misses).toEqual([]);
    expect(await fingerprint()).toBe(before);
  });

  it(`lets ${roles.member} and ${roles.admin} past the permission check exactly where the answer key says`, async () => {
    const misses: string[] = [];
    for (const name of houseOps) {
      const permission = permissionOf(name) as Permission;
      const cell = HOUSE_MATRIX[permission];
      // A house of its own for each operation: a write that goes through mustn't change what the next one sees.
      const world = await house(kind);
      // The member first, then the admin: an admin's delete mustn't hide the row from the member's try.
      for (const [role, who] of [["member", world.member], ["admin", world.admin]] as const) {
        if (!cell[role]) continue;
        const answer = await ask(name, who, inputFor(name, world.rows, who.id));
        if (answer.kind === "refused" && (refusedFor(answer, permission) || answer.code === "unauthenticated" || answer.code === "internal")) {
          misses.push(`${role} ${name} (${permission}): ${JSON.stringify(answer)}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });
});

// --- The admin pages -------------------------------------------------------

describe("every admin page operation", () => {
  async function staff(role: "owner" | "support", aal: Person["aal"]) {
    const who = await person(aal);
    await admin`insert into public.app_owners (user_id, role) values (${who.id}::uuid, ${role})`;
    return who;
  }

  it("refuses anyone who isn't staff, and the owner without their code this session, and a refusal changes nothing", async () => {
    const world = await house("housemates");
    const nobody = await person("aal2");
    const ownerNoCode = await staff("owner", "aal1");
    const before = await fingerprint();
    const misses: string[] = [];
    for (const name of appOps) {
      const permission = permissionOf(name);
      for (const [label, who] of [["someone signed in", nobody], ["the owner without their code", ownerNoCode], ["a house admin", world.admin]] as const) {
        const answer = await ask(name, who, inputFor(name, world.rows, who.id));
        if (!refusedFor(answer, permission)) misses.push(`${label} ${name}: ${JSON.stringify(answer)}`);
      }
    }
    expect(misses).toEqual([]);
    expect(await fingerprint()).toBe(before);
  });

  it("refuses a support helper exactly where the answer key says, and lets the owner and helper past where it allows", async () => {
    const misses: string[] = [];
    for (const name of appOps) {
      const permission = permissionOf(name) as OwnerPermission;
      const cell = OWNER_MATRIX[permission];
      const world = await house("housemates");
      const helper = await staff("support", "aal2");
      const owner = await staff("owner", "aal2");
      for (const [role, who] of [["support", helper], ["owner", owner]] as const) {
        const answer = await ask(name, who, inputFor(name, world.rows, who.id));
        if (cell[role]) {
          if (answer.kind === "refused" && (refusedFor(answer, permission) || answer.code === "unauthenticated" || answer.code === "internal")) misses.push(`${role} ${name} (${permission}): ${JSON.stringify(answer)}`);
        } else if (!refusedFor(answer, permission)) {
          misses.push(`${role} ${name} should be refused for ${permission}: ${JSON.stringify(answer)}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });
});

// Every row a refusal could point at is real (ASK_REFS), so a refusal is the permission's, not a missing row's.
it("has a row for every key an operation can name its house by", () => {
  const named = new Set(
    NAMES.flatMap((n) => Object.keys((OPERATION_IO[n].input as z.ZodObject).shape ?? {})).filter((k) => k in ASK_REFS && !ASK_REFS[k].many),
  );
  const fake: Rows = { houseId: "h", weekId: "w", johnId: "j", groupId: "g", kindId: "k", moveToId: "m", adminsJohn: "a", membersJohn: "b", disputeId: "d", offerId: "o", actionId: "x", eventId: "e", adminId: "A", memberId: "M" };
  for (const key of named) expect(refValue(key, fake, "A"), key).toBeDefined();
});
