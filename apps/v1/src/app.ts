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

import { asProblem, openApi, pathKeys, Problem, type ApiOperation, type Executor } from "@app/server";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

export interface AppOptions {
  execute: Executor;
  operations: readonly ApiOperation[];
  /** The public origin, for the OpenAPI document. */
  origin?: string;
  logger?: boolean;
  /** Most bytes a request body may have. */
  bodyLimit?: number;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;
const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** "/v1/houses/{houseId}/johns" → "/v1/houses/:houseId/johns" */
export const fastifyPath = (path: string) => path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, ":$1");

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

  app.addHook("onRequest", async (req, reply) => {
    reply.header("Request-Id", req.id);
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
        const from = op.http.method === "GET" ? (req.query as Record<string, unknown>) : (req.body ?? {});
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
