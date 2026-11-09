// /v1 for a host that speaks web-standard Request and Response (a Next
// route handler on Vercel, or any fetch-style runtime). The pool, the
// executor and the Fastify app are made once per instance, on the first
// request, and reused; nothing about any request is kept.

import { connect, createExecutor, Problem, tokenVerifier, type Executor, type Sql } from "@app/server";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app";
import { readConfig } from "./config";
import { V1_OPERATIONS } from "./operations";

interface Instance {
  sql: Sql;
  execute: Executor;
  app: FastifyInstance;
}

let instance: Promise<Instance> | null = null;

/** The pool and executor this instance shares between /v1 and /mcp. Null until API_DATABASE_URL is set. */
export function v1Instance(env: NodeJS.ProcessEnv = process.env): Promise<Instance> | null {
  if (!env.API_DATABASE_URL) return null;
  instance ??= (async () => {
    const config = readConfig({ ...env, SUPABASE_URL: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL });
    const sql = connect(config.databaseUrl, config.poolSize);
    const execute = createExecutor({
      sql,
      verify: tokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.jwtSecret }),
      operations: V1_OPERATIONS,
      minimumBuilds: config.minimumBuilds,
    });
    const app = buildApp({ execute, operations: V1_OPERATIONS, origin: config.origin, allowedOrigins: config.allowedOrigins });
    await app.ready();
    return { sql, execute, app };
  })();
  instance.catch(() => (instance = null));
  return instance;
}

const DROP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

/** Answers one /v1 request. */
export async function handleV1(request: Request): Promise<Response> {
  const ready = v1Instance();
  if (!ready) {
    const problem = new Problem("internal", "The API isn't set up here yet.");
    return Response.json({ ...problem.body(), status: 503 }, { status: 503, headers: { "content-type": "application/problem+json" } });
  }
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
