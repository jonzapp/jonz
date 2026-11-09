// The /v1 HTTP API: a thin Fastify layer over @app/server's executor. Every
// route comes from an operation; the executor does every check and the work.
// This file only maps HTTP in and out:
//
//   path keys + query (GET) or body (others) → the operation's input
//   Authorization, Jonz-Client, Idempotency-Key → the request context
//   result → 200/201 JSON; refusal → RFC 9457 problem+json
//   every response → Request-Id; a deprecated operation → Deprecation + Sunset
//
// Stateless: nothing is kept between requests, so any number of instances can
// sit behind the load balancer.

import { randomUUID } from "node:crypto";

import { corsHeaders } from "./cors";
import { asProblem, openApi, pathKeys, Problem, type ApiOperation, type Executor } from "@app/server";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";

export interface AppOptions {
  execute: Executor;
  operations: readonly ApiOperation[];
  /** The public origin, for the OpenAPI document. */
  origin?: string;
  logger?: boolean;
  /** Most bytes a request body may have. */
  bodyLimit?: number;
  /** Web origins that may call from a browser elsewhere (ALLOWED_ORIGINS). */
  allowedOrigins?: readonly string[];
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;
const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** "/v1/houses/{houseId}/johns" → "/v1/houses/:houseId/johns" */
export const fastifyPath = (path: string) => path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, ":$1");

type QueryTypes = Record<string, "number" | "boolean" | "array" | "string">;

/** What each of an operation's inputs is, so a query string's text can be read as the number, yes/no or list it stands for. */
export function queryTypes(input: z.ZodType): QueryTypes {
  const schema = z.toJSONSchema(input, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, { type?: string | string[]; anyOf?: { type?: string }[] }> };
  const types: QueryTypes = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const named = [prop.type, ...(prop.anyOf ?? []).map((p) => p.type)].flat().filter(Boolean);
    types[key] = named.includes("integer") || named.includes("number") ? "number" : named.includes("boolean") ? "boolean" : named.includes("array") ? "array" : "string";
  }
  return types;
}

/** A query string read by its operation's input types; anything that doesn't fit is left for the schema to refuse. */
export function readQuery(query: Record<string, unknown>, types: QueryTypes): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(query)) {
    const type = types[key];
    if (type === "array") out[key] = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean);
    else if (Array.isArray(raw)) out[key] = raw;
    else if (type === "number" && /^-?\d+(\.\d+)?$/.test(String(raw))) out[key] = Number(raw);
    else if (type === "boolean" && (raw === "true" || raw === "false")) out[key] = raw === "true";
    else out[key] = raw;
  }
  return out;
}

function sendProblem(reply: FastifyReply, problem: Problem, requestId: string) {
  for (const [k, v] of Object.entries(problem.headers)) reply.header(k, v);
  return reply.code(problem.status).type("application/problem+json").send(problem.body(requestId));
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.bodyLimit ?? 256 * 1024,
    // Our own Request-Id, honouring a caller's when it looks like one (so a phone's retry shares its id).
    genReqId: (req) => {
      const given = header(req.headers["request-id"]);
      return given && REQUEST_ID.test(given) ? given : `req_${randomUUID()}`;
    },
    // Path and query are taken as written; the operation's schema decides what they mean.
    routerOptions: { ignoreTrailingSlash: true },
  });

  const allowed = options.allowedOrigins ?? [];
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Request-Id", req.id);
    for (const [k, v] of Object.entries(corsHeaders(header(req.headers.origin), allowed))) reply.header(k, v);
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  app.setNotFoundHandler((req, reply) => sendProblem(reply, new Problem("not_found", "There's no such path in /v1."), req.id));
  app.setErrorHandler((error: { statusCode?: number; message?: string }, req, reply) => {
    // Fastify's own refusals (a body that isn't JSON, or too big) are the caller's mistake.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return sendProblem(reply, new Problem("invalid_input", error.message ?? "That request can't be read."), req.id);
    }
    req.log.error(error);
    return sendProblem(reply, asProblem(error), req.id);
  });

  const document = openApi(options.operations, options.origin);
  app.get("/v1/openapi.json", async () => document);
  app.get("/v1/health", async () => ({ ok: true }));

  for (const op of options.operations) {
    const keys = pathKeys(op.http.path);
    const types = op.http.method === "GET" ? queryTypes(op.input) : {};
    app.route({
      method: op.http.method,
      url: fastifyPath(op.http.path),
      handler: async (req, reply) => {
        if (op.deprecated) {
          // RFC 9745: @<unix seconds>. RFC 8594: an HTTP date.
          reply.header("Deprecation", `@${Math.floor(op.deprecated.since.getTime() / 1000)}`);
          reply.header("Sunset", op.deprecated.sunset.toUTCString());
          if (op.deprecated.link) reply.header("Link", `<${op.deprecated.link}>; rel="deprecation"`);
        }
        const params = req.params as Record<string, string>;
        const from = op.http.method === "GET" ? readQuery(req.query as Record<string, unknown>, types) : (req.body ?? {});
        if (typeof from !== "object" || Array.isArray(from)) {
          return sendProblem(reply, new Problem("invalid_input", "Send a JSON object."), req.id);
        }
        const input: Record<string, unknown> = { ...from };
        for (const k of keys) {
          if (k in input && input[k] !== params[k]) return sendProblem(reply, new Problem("invalid_input", `${k} is in the path; don't send it again.`), req.id);
          input[k] = params[k];
        }
        try {
          const result = await options.execute(
            op.name,
            {
              authorization: header(req.headers.authorization),
              client: header(req.headers["jonz-client"]),
              idempotencyKey: header(req.headers["idempotency-key"]),
              requestId: req.id,
              via: "api",
            },
            input,
          );
          if (result.replayed) reply.header("Idempotent-Replayed", "true");
          // Serialised here: Fastify would send a bare string (a new row's id) as text.
          return reply.code(result.status).type("application/json; charset=utf-8").send(JSON.stringify(result.body ?? null));
        } catch (error) {
          const problem = asProblem(error);
          if (problem.code === "internal" && !(error instanceof Problem)) req.log.error(error);
          return sendProblem(reply, problem, req.id);
        }
      },
    });
  }

  return app;
}
