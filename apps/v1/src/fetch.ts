// /v1 for a host that speaks web-standard Request and Response (a Next
// route handler on Vercel, or any fetch-style runtime). The pool, the
// executor and the Fastify app are made once per instance, on the first
// request, and reused; nothing about any request is kept.

import { connect, createExecutor, Problem, tokenVerifier, type ApiOperation, type Executor, type Sql } from "@app/server";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app";
import { readConfig } from "./config";
import { withHandlers, type Handlers } from "./operations";

interface Instance {
  sql: Sql;
  execute: Executor;
  app: FastifyInstance;
  /** What this instance serves: the database operations and the server ones it was given handlers for. */
  operations: readonly ApiOperation[];
}

let instance: Promise<Instance> | null = null;

/**
 * The pool and executor this instance shares between /v1 and /mcp. Null
 * until API_DATABASE_URL is set. `handlers` run the server operations; the
 * first call's are the ones kept, so every caller in a host passes the same.
 */
export function v1Instance(env: NodeJS.ProcessEnv = process.env, handlers: Handlers = {}): Promise<Instance> | null {
  if (!env.API_DATABASE_URL) return null;
  instance ??= (async () => {
    const operations = withHandlers(handlers);
    const config = readConfig({ ...env, SUPABASE_URL: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL });
    const sql = connect(config.databaseUrl, config.poolSize);
    const execute = createExecutor({
      sql,
      verify: tokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.jwtSecret }),
      operations,
      minimumBuilds: config.minimumBuilds,
    });
    const app = buildApp({ execute, operations, origin: config.origin, allowedOrigins: config.allowedOrigins });
    await app.ready();
    return { sql, execute, app, operations };
  })();
  instance.catch(() => (instance = null));
  return instance;
}

const DROP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

/** Answers one /v1 request, running server operations with `handlers`. */
export const createV1Handler = (handlers: Handlers) => (request: Request) => answer(request, handlers);

/** Answers one /v1 request, serving the database operations only. */
export const handleV1 = createV1Handler({});

const problemResponse = (status: number, detail: string, requestId?: string) =>
  Response.json(
    { ...new Problem("internal", detail).body(requestId), status },
    { status, headers: { "content-type": "application/problem+json", ...(requestId ? { "request-id": requestId } : {}) } },
  );

/**
 * Anything that fails outside Fastify (starting up, or handing the request
 * over) answers the same problem+json as inside it: what went wrong goes to
 * the logs, never to the caller.
 */
async function answer(request: Request, handlers: Handlers): Promise<Response> {
  try {
    return await forward(request, handlers);
  } catch (error) {
    const requestId = `req_${crypto.randomUUID()}`;
    console.error(`[${requestId}] /v1 failed before reaching an operation`, error);
    return problemResponse(500, "Something went wrong on our side.", requestId);
  }
}

async function forward(request: Request, handlers: Handlers): Promise<Response> {
  const ready = v1Instance(process.env, handlers);
  if (!ready) return problemResponse(503, "The API isn't set up here yet.");
  const { app } = await ready;
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    if (!DROP.has(k)) headers[k] = v;
  });
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  const res = await app.inject({ method: request.method as "GET", url: url.pathname + url.search, headers, payload: body });
  const out = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || k === "content-length" || k === "connection") continue;
    for (const one of Array.isArray(v) ? v : [String(v)]) out.append(k, one);
  }
  return new Response(res.statusCode === 204 ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers: out });
}
