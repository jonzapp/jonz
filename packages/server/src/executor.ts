// One way in for every caller (the /v1 API, MCP, Ask Jonz cards): the same
// checks, in the same order, for every operation in the registry.
//
//   client version → token → rate limit → input →
//   [one transaction] idempotency → [as the person] permission → House Pass →
//   [as the API] the person's approval, for a connected app's destructive write →
//   the database function (or the operation's server handler) →
//   output → [as the API] audit row + idempotency record
//
// The database checks again (RLS, can()), so a gap here is still refused there.
// Nothing is kept in this process between requests: any instance can serve any
// request, and two requests with one Idempotency-Key on two instances queue on
// a database lock, so the second gets the first one's answer.

import { createHash, randomUUID } from "node:crypto";

import { ASK_REFS, PASS_ENFORCED, passOf, passUnlocked, type Operation } from "@app/core";
import type postgres from "postgres";
import { z } from "zod";

import type { Claims, TokenVerifier } from "./auth";
import { checkClient, type ClientInfo, type MinimumBuilds } from "./client";
import { becomeApi, becomePerson, callFunction, signatures, type Sql, type Tx } from "./db";
import { Problem } from "./problem";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** What a server handler gets: the transaction (already the person), who they are, and the checked input. */
export interface HandlerContext {
  tx: Tx;
  claims: Claims;
  input: Record<string, unknown>;
  now: Date;
}

/** An operation as the API serves it: the registry entry plus its contract. */
export interface ApiOperation {
  name: string;
  operation: Operation;
  input: z.ZodType<Record<string, unknown>>;
  output: z.ZodType;
  http: { method: HttpMethod; path: string };
  /** The database function's arguments for an input. Default: camelCase keys as p_snake_case. */
  rpcArgs?: (input: Record<string, unknown>) => Record<string, unknown>;
  /**
   * For operations whose logic lives in TypeScript (`rpc.server`): runs in
   * place of the database function, after the same checks, as the person.
   */
  handler?: (context: HandlerContext) => Promise<unknown>;
  /** Turns the function's answer into the contract's shape (camelCase keys, a page). Default: as it comes. */
  fromResult?: (raw: unknown, input: Record<string, unknown>) => unknown;
  /**
   * Being retired: answered with Deprecation (RFC 9745) and Sunset (RFC 8594)
   * headers from `since`, and removed no sooner than `sunset`, at least six
   * months later. `link` is the page that says what to use instead.
   */
  deprecated?: { since: Date; sunset: Date; link?: string };
}

export interface RequestContext {
  authorization?: string | null;
  client?: string | null;
  idempotencyKey?: string | null;
  requestId?: string;
  /** Who is calling: "api", "mcp" or "ask". Written to the audit row. */
  via?: "api" | "mcp" | "ask";
}

export interface ExecutorOptions {
  sql: Sql;
  verify: TokenVerifier;
  operations: readonly ApiOperation[];
  minimumBuilds?: MinimumBuilds;
  /** Requests per person per minute: reads, and writes. */
  limits?: { read: number; write: number };
  /** The clock, for Pass checks, rate-limit windows and key expiry. Tests pass a pretend one. */
  now?: () => Date;
  passEnforced?: boolean;
  /** Where the person approves a connected app's request, by its id. */
  approvalUrl?: (id: string) => string;
}

export interface Result {
  status: 200 | 201;
  body: unknown;
  replayed?: boolean;
  requestId: string;
}

export const IDEMPOTENCY_TTL_MS = 86_400_000;
/** How long a connected app's request waits for the person's approval, and an approval for the app's retry. */
export const APPROVAL_TTL_MS = 15 * 60_000;
export const APPROVAL_URL = (id: string) => `https://jonz.app/approve/${id}`;

/**
 * Whether this request needs the person's own approval in Jonz first: a
 * write that can't be undone (`destructive`), asked by a connected app
 * (through /mcp, or with an OAuth client's token anywhere).
 */
export const needsApproval = (op: Operation, claims: Claims, via: RequestContext["via"]) =>
  op.destructive === true && (via === "mcp" || typeof claims.client_id === "string");
/** The least notice before a deprecated operation may go: six months (182 days). */
export const SUNSET_NOTICE_MS = 182 * 86_400_000;

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const defaultRpcArgs = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [`p_${snake(k)}`, v]));

/**
 * Input keys that name a row under a house, and where that row is: the
 * registry's own map (ASK_REFS), which Ask Jonz resolves ids by too.
 */
export const HOUSE_FROM: readonly (readonly [string, string, string])[] = Object.entries(ASK_REFS)
  .filter(([, ref]) => !ref.many)
  .map(([key, ref]) => [key, ref.table, ref.column] as const);

const PG_TO_PROBLEM: Record<string, [Problem["code"], string]> = {
  "42501": ["forbidden", "You can't do that in this house."],
  "23505": ["conflict", "That's already been done."],
  "40001": ["conflict", "Someone else changed this at the same moment. Try again."],
  "40P01": ["conflict", "Someone else changed this at the same moment. Try again."],
};

/** A database error as a Problem. Only errors a function raised on purpose pass their words on. */
export function fromDatabase(error: unknown): Problem {
  const e = error as { code?: string; message?: string };
  const known = e.code ? PG_TO_PROBLEM[e.code] : undefined;
  if (known) return new Problem(known[0], known[1]);
  // raise exception '…' (P0001), or a data or constraint error (classes 22, 23): its words are for people.
  if (e.code && (e.code === "P0001" || e.code.startsWith("22") || e.code.startsWith("23"))) {
    return new Problem("rejected", e.message ?? "That can't be done.");
  }
  return new Problem("internal", "Something went wrong on our side.");
}

/** The fingerprint an Idempotency-Key is tied to: the operation and its checked input. */
export function requestHash(name: string, input: unknown): string {
  return createHash("sha256").update(`${name}\n${stableJson(input)}`).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function createExecutor(options: ExecutorOptions) {
  const { sql, verify } = options;
  const now = options.now ?? (() => new Date());
  const limits = options.limits ?? { read: 300, write: 60 };
  const enforced = options.passEnforced ?? PASS_ENFORCED;
  const signatureOf = signatures(sql);
  const approvalUrl = options.approvalUrl ?? APPROVAL_URL;
  const byName = new Map(options.operations.map((o) => [o.name, o]));

  for (const op of options.operations) {
    if (!op.handler && !op.operation.rpc?.name) throw new Error(`${op.name} has neither a database function nor a handler`);
    if (op.handler && !op.operation.rpc?.server) throw new Error(`${op.name} has a handler but its rpc isn't marked server`);
    if (op.deprecated && op.deprecated.sunset.getTime() - op.deprecated.since.getTime() < SUNSET_NOTICE_MS) {
      throw new Error(`${op.name} sunsets less than six months after it was deprecated`);
    }
  }

  async function rateLimit(userId: string, effect: "read" | "write", at: Date) {
    const window = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
    const [row] = await sql<{ hits: number }[]>`
      insert into public.api_rate_limits (bucket, window_started_at, hits)
      values (${`${userId}:${effect}`}, ${window}, 1)
      on conflict (bucket, window_started_at) do update set hits = public.api_rate_limits.hits + 1
      returning hits`;
    if (row.hits > limits[effect]) {
      const retry = Math.max(1, Math.ceil((window.getTime() + 60_000 - at.getTime()) / 1000));
      throw new Problem("rate_limited", "That's a lot of requests. Wait a moment and try again.", { "Retry-After": String(retry) });
    }
  }

  /**
   * The house a house operation acts in: its houseId, or the house of the
   * row it names (an assignment, a dispute…), read as the person so RLS
   * decides whether they can see it. Failing those, the house they're in
   * (a person is in one house at a time). Null for other scopes.
   */
  async function houseOf(tx: Tx, op: ApiOperation, input: Record<string, unknown>): Promise<string | null> {
    if (op.operation.scope !== "house") return null;
    if (typeof input.houseId === "string") return input.houseId;
    for (const [key, table, column] of HOUSE_FROM) {
      const value = input[key];
      if (typeof value !== "string") continue;
      const [row] = await tx.unsafe<{ house_id: string }[]>(`select house_id from public.${table} where ${column} = $1::uuid limit 1`, [value]);
      if (!row) throw new Problem("not_found", "That isn't there, or isn't yours to see.");
      return row.house_id;
    }
    const rows = await tx<{ house_id: string }[]>`select house_id from public.members where user_id = (select auth.uid()) limit 2`;
    if (rows.length !== 1) throw new Problem("invalid_input", "Which house? Name it with houseId.");
    return rows[0].house_id;
  }

  async function guard(tx: Tx, op: ApiOperation, house: string | null) {
    const g = op.operation.guard;
    if (g.by !== "permission") return;
    const permission = g.permission;
    if (op.operation.scope === "house") {
      const rows = await tx<{ p: string }[]>`select p from public.my_permissions(${house}::uuid) p`;
      if (!rows.some((r) => r.p === permission)) throw new Problem("forbidden", `You need ${permission} in this house.`);
    } else if (op.operation.scope === "app") {
      const [row] = await tx<{ p: string[] | null }[]>`select public.my_app_permissions() as p`;
      if (!(row.p ?? []).includes(permission)) throw new Problem("forbidden", `You need ${permission}.`);
    }
    // Account operations: being signed in is the permission; the function only touches your own rows.
  }

  /** The House Pass, when the operation needs it: always, or only when the input that turns its feature on is set. */
  async function entitlement(tx: Tx, op: ApiOperation, house: string | null, input: Record<string, unknown>, at: Date) {
    const feature = op.operation.entitlement;
    if (!feature || !enforced || !house) return;
    const when = op.operation.entitlementWhen;
    if (when && (input[when] === undefined || input[when] === null || input[when] === "")) return;
    const [row] = await tx<{ pass_plan: string; pass_ends_at: string | null; pass_bought_by: string | null }[]>`
      select pass_plan, pass_ends_at, pass_bought_by from public.houses where id = ${house}::uuid`;
    if (!row || !passUnlocked(passOf(row), at, enforced)) {
      throw new Problem("pass_required", "This needs a House Pass.");
    }
  }

  /**
   * Uses the person's approval of exactly this request, once: true if there
   * was one. Runs as the API, in the operation's own transaction, so a write
   * that then fails leaves the approval unused.
   */
  async function useApproval(tx: Tx, userId: string, hash: string, at: Date): Promise<boolean> {
    const [used] = await tx<{ id: string }[]>`
      update public.api_approvals set used_at = ${at}
      where id = (
        select id from public.api_approvals
        where user_id = ${userId}::uuid and request_hash = ${hash} and approved_at is not null
          and used_at is null and expires_at > ${at}
        order by approved_at
        limit 1
        for update skip locked)
      returning id`;
    return Boolean(used);
  }

  /** Asks the person: the same waiting request again, or a new one. Throws forbidden with the approvalUrl, or plain forbidden if they said no. */
  async function askApproval(name: string, input: Record<string, unknown>, claims: Claims, hash: string, house: string | null, at: Date): Promise<never> {
    const [latest] = await sql<{ id: string; declined_at: Date | null }[]>`
      select id, declined_at from public.api_approvals
      where user_id = ${claims.sub}::uuid and request_hash = ${hash} and approved_at is null and expires_at > ${at}
      order by created_at desc
      limit 1`;
    if (latest?.declined_at) throw new Problem("forbidden", "You said no to this in Jonz.");
    const id =
      latest?.id ??
      (
        await sql<{ id: string }[]>`
          insert into public.api_approvals (user_id, operation, request_hash, input, house_id, client_id, expires_at, created_at)
          values (${claims.sub}::uuid, ${name}, ${hash}, ${sql.json(input as postgres.JSONValue)}, ${house}::uuid,
                  ${typeof claims.client_id === "string" ? claims.client_id.slice(0, 100) : null},
                  ${new Date(at.getTime() + APPROVAL_TTL_MS)}, ${at})
          returning id`
      )[0].id;
    const url = approvalUrl(id);
    throw new Problem("forbidden", `This can't be undone, so approve it in Jonz first: ${url}`, {}, { approvalUrl: url });
  }

  async function execute(name: string, context: RequestContext, rawInput: unknown): Promise<Result> {
    const requestId = context.requestId ?? randomUUID();
    try {
      return await run(name, context, rawInput, requestId);
    } catch (error) {
      if (error instanceof Problem) throw error;
      const problem = fromDatabase(error);
      if (problem.code === "internal") console.error(`[${requestId}] ${name} failed`, error);
      throw problem;
    }
  }

  async function run(name: string, context: RequestContext, rawInput: unknown, requestId: string): Promise<Result> {
    const op = byName.get(name);
    if (!op) throw new Problem("not_found", "There's no such operation.");
    const client: ClientInfo | null = checkClient(context.client, options.minimumBuilds ?? {});
    const claims: Claims = await verify(context.authorization);
    const at = now();
    const effect = op.operation.effect;
    await rateLimit(claims.sub, effect, at);

    const parsed = op.input.safeParse(rawInput ?? {});
    if (!parsed.success) throw new Problem("invalid_input", z.prettifyError(parsed.error));
    const input = parsed.data;

    const key = effect === "write" ? context.idempotencyKey?.trim() || null : null;
    if (key && key.length > 255) throw new Problem("invalid_input", "Idempotency-Key is longer than 255 characters.");
    const approval = needsApproval(op.operation, claims, context.via);
    const hash = key || approval ? requestHash(name, input) : null;
    const status = effect === "write" ? 201 : 200;
    const fn = op.operation.rpc?.name;
    const signature = op.handler || !fn ? null : await signatureOf(fn);

    const outcome = (await sql.begin(async (tx) => {
        if (key) {
          // Same person, same key: one at a time, on any instance, until this transaction ends.
          await tx`select pg_advisory_xact_lock(hashtextextended(${`${claims.sub}:${key}`}, 0))`;
          const [seen] = await tx<{ request_hash: string; status: number; response: unknown }[]>`
            select request_hash, status, response from public.api_idempotency_keys
            where user_id = ${claims.sub}::uuid and key = ${key} and created_at > ${new Date(at.getTime() - IDEMPOTENCY_TTL_MS)}`;
          if (seen) {
            if (seen.request_hash !== hash) throw new Problem("idempotency_mismatch", "That Idempotency-Key was already used for a different request.");
            return { body: seen.response, replayed: true, status: seen.status as 200 | 201 };
          }
        }

        await becomePerson(tx, claims);
        const house = await houseOf(tx, op, input);
        await guard(tx, op, house);
        await entitlement(tx, op, house, input, at);
        if (approval) {
          await becomeApi(tx);
          if (!(await useApproval(tx, claims.sub, hash!, at))) return { ask: house };
          await becomePerson(tx, claims);
        }
        const raw = op.handler
          ? await op.handler({ tx, claims, input, now: at })
          : await callFunction(tx, signature!, fn!, (op.rpcArgs ?? defaultRpcArgs)(input));
        // Checked before commit: a write whose answer breaks its contract is rolled back, not half-reported.
        // Nothing back where the contract wants something: the row isn't there, or RLS hides it.
        if ((raw === null || raw === undefined) && !op.output.safeParse(null).success) {
          throw new Problem("not_found", "That isn't there, or isn't yours to see.");
        }
        const out = op.output.safeParse(op.fromResult ? op.fromResult(raw, input) : raw);
        if (!out.success) {
          console.error(`[${requestId}] ${name} returned a shape its contract doesn't allow`, z.prettifyError(out.error));
          throw new Problem("internal", "Something went wrong on our side.");
        }
        const body = out.data;

        if (effect === "write") {
          await becomeApi(tx);
          const auditHouse = house ?? (typeof input.houseId === "string" ? input.houseId : null);
          await tx`
            insert into public.api_audit_entries (user_id, operation, house_id, via, client, request_id)
            values (${claims.sub}::uuid, ${name}, ${auditHouse}::uuid,
                    ${context.via ?? "api"}, ${client ? `${client.platform}/${client.version} (${client.build})` : null}, ${requestId})`;
          if (key) {
            const response = sql.json((body ?? null) as postgres.JSONValue);
            // An expired record for this key is replaced; a live one can't exist here (we hold the lock and looked).
            await tx`
              insert into public.api_idempotency_keys (user_id, key, operation, request_hash, status, response, created_at)
              values (${claims.sub}::uuid, ${key}, ${name}, ${hash}, ${status}, ${response}, ${at})
              on conflict (user_id, key) do update
                set operation = excluded.operation, request_hash = excluded.request_hash, status = excluded.status,
                    response = excluded.response, created_at = excluded.created_at`;
          }
        }
        return { body, replayed: false, status };
      })) as { body: unknown; replayed: boolean; status: 200 | 201 } | { ask: string | null };

    // Nothing ran: the person hasn't approved this yet.
    if ("ask" in outcome) return askApproval(name, input, claims, hash!, outcome.ask, at);
    return outcome.replayed ? { ...outcome, requestId } : { status: outcome.status, body: outcome.body, requestId };
  }

  return execute;
}

export type Executor = ReturnType<typeof createExecutor>;
