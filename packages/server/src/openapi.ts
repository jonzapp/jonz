// The /v1 contract as an OpenAPI 3.1 document, built from the same operations
// the executor runs, so the document can't drift from what is served. CI
// compares it with main's (oasdiff): within /v1 a change may only add.

import { z } from "zod";

import type { ApiOperation } from "./executor";
import { PROBLEM_CODES } from "./problem";

type Json = Record<string, unknown>;

export const API_VERSION = "1";

/** The names in a path template: "/v1/houses/{houseId}/johns" → ["houseId"]. */
export function pathKeys(path: string): string[] {
  return [...path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]);
}

function schemaOf(type: z.ZodType, io: "input" | "output"): Json {
  const { $schema: _drop, ...schema } = z.toJSONSchema(type, { io, unrepresentable: "any" }) as Json;
  void _drop;
  return schema;
}

const problem = { $ref: "#/components/responses/Problem" };

export function openApi(operations: readonly ApiOperation[], server = "https://api.jonz.app"): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const op of operations) {
    const input = schemaOf(op.input, "input") as { properties?: Record<string, Json>; required?: string[] };
    const inPath = new Set(pathKeys(op.http.path));
    const required = new Set(input.required ?? []);
    const props = Object.entries(input.properties ?? {});
    const parameters: Json[] = props
      .filter(([k]) => inPath.has(k) || op.http.method === "GET")
      .map(([k, schema]) => ({ name: k, in: inPath.has(k) ? "path" : "query", required: inPath.has(k) || required.has(k), schema }));
    const bodyProps = op.http.method === "GET" ? [] : props.filter(([k]) => !inPath.has(k));
    const write = op.operation.effect === "write";
    if (write) parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
    parameters.push({ $ref: "#/components/parameters/JonzClient" });

    const entry: Json = {
      operationId: op.name,
      summary: op.operation.about,
      tags: [op.operation.scope],
      parameters,
      security: [{ bearer: [] }],
      "x-jonz-effect": op.operation.effect,
      ...(op.operation.guard.by === "permission" ? { "x-jonz-permission": op.operation.guard.permission } : {}),
      ...(op.operation.destructive ? { "x-jonz-destructive": true } : {}),
      ...(op.deprecated ? { deprecated: true, "x-sunset": op.deprecated.sunset.toISOString() } : {}),
      ...(op.operation.entitlement ? { "x-jonz-entitlement": op.operation.entitlement } : {}),
      responses: {
        [write ? "201" : "200"]: { description: "Done.", content: { "application/json": { schema: schemaOf(op.output, "output") } } },
        default: problem,
      },
    };
    if (bodyProps.length) {
      entry.requestBody = {
        required: bodyProps.some(([k]) => required.has(k)),
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: Object.fromEntries(bodyProps),
              required: bodyProps.map(([k]) => k).filter((k) => required.has(k)),
              additionalProperties: false,
            },
          },
        },
      };
    }
    (paths[op.http.path] ??= {})[op.http.method.toLowerCase()] = entry;
  }

  return {
    openapi: "3.1.0",
    info: { title: "Jonz API", version: API_VERSION, description: "Every Jonz operation, for the app, MCP and scripts. Changes within /v1 only add." },
    servers: [{ url: server }],
    paths,
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "A Supabase Auth access token." } },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 255 }, description: "Send the same key to retry a write safely for 24 hours." },
        JonzClient: { name: "Jonz-Client", in: "header", required: false, schema: { type: "string", examples: ["ios/1.4.2 (57)"] } },
      },
      responses: {
        Problem: {
          description: "Refused or failed (RFC 9457).",
          headers: { "Request-Id": { schema: { type: "string" } } },
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      },
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "detail"],
          properties: {
            type: { type: "string", format: "uri" },
            title: { type: "string", enum: Object.keys(PROBLEM_CODES) },
            status: { type: "integer" },
            detail: { type: "string" },
            requestId: { type: "string" },
          },
        },
      },
    },
  };
}
