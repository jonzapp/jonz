import { readFileSync } from "node:fs";

import { openApi, Problem, type ApiOperation, type Executor, type RequestContext } from "@app/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApp, queryTypes, readQuery } from "../../src/app";
import { V1_OPERATIONS } from "../../src/operations";

const read: ApiOperation = {
  name: "list_johns",
  operation: { about: "Lists Johns.", scope: "house", effect: "read", guard: { by: "permission", permission: "johns:read" }, rpc: { name: "list_johns" } },
  input: z.object({ houseId: z.uuid(), limit: z.coerce.number().optional() }),
  output: z.unknown(),
  http: { method: "GET", path: "/v1/houses/{houseId}/johns" },
};
const write: ApiOperation = {
  ...read,
  name: "add_john",
  operation: { ...read.operation, effect: "write", guard: { by: "permission", permission: "johns:write" }, rpc: { name: "add_john" } },
  http: { method: "POST", path: "/v1/houses/{houseId}/johns" },
  deprecated: { since: new Date(Date.UTC(2027, 0, 1)), sunset: new Date(Date.UTC(2027, 6, 1)), link: "https://api.jonz.app/docs/changes" },
};
const H = "11111111-1111-4111-8111-111111111111";

/** A stand-in executor that records what the HTTP layer handed it. */
function stub(answer: (name: string, ctx: RequestContext, input: unknown) => unknown) {
  const calls: { name: string; ctx: RequestContext; input: unknown }[] = [];
  const execute: Executor = async (name, ctx, input) => {
    calls.push({ name, ctx, input });
    const out = answer(name, ctx, input);
    if (out instanceof Error) throw out;
    return out as Awaited<ReturnType<Executor>>;
  };
  return { calls, app: buildApp({ execute, operations: [read, write] }) };
}

describe("/v1 over HTTP", () => {
  it("hands a read its path and query, and the headers that matter", async () => {
    const { app, calls } = stub(() => ({ status: 200, body: [{ id: 1 }], requestId: "x" }));
    const res = await app.inject({ method: "GET", url: `/v1/houses/${H}/johns?limit=5`, headers: { authorization: "Bearer t", "jonz-client": "ios/1.4.2 (57)", "request-id": "req_from_phone_1" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: 1 }]);
    expect(res.headers["request-id"]).toBe("req_from_phone_1");
    expect(calls[0]).toMatchObject({ name: "list_johns", input: { houseId: H, limit: 5 }, ctx: { authorization: "Bearer t", client: "ios/1.4.2 (57)", requestId: "req_from_phone_1", via: "api" } });
  });

  it("hands a write its body and Idempotency-Key, and says when an answer is replayed", async () => {
    const { app, calls } = stub(() => ({ status: 201, body: { id: "j1" }, replayed: true, requestId: "x" }));
    const res = await app.inject({ method: "POST", url: `/v1/houses/${H}/johns`, payload: { name: "Bins" }, headers: { "idempotency-key": "k1" } });
    expect(res.statusCode).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBe("true");
    expect(res.headers["request-id"]).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(calls[0]).toMatchObject({ name: "add_john", input: { houseId: H, name: "Bins" }, ctx: { idempotencyKey: "k1" } });
  });

  it("marks a deprecated operation with Deprecation, Sunset and a link", async () => {
    const { app } = stub(() => ({ status: 201, body: null, requestId: "x" }));
    const res = await app.inject({ method: "POST", url: `/v1/houses/${H}/johns`, payload: {} });
    expect(res.headers.deprecation).toBe(`@${Date.UTC(2027, 0, 1) / 1000}`);
    expect(res.headers.sunset).toBe("Thu, 01 Jul 2027 00:00:00 GMT");
    expect(res.headers.link).toBe('<https://api.jonz.app/docs/changes>; rel="deprecation"');
  });

  it("answers every refusal as problem+json with its headers", async () => {
    const { app } = stub(() => new Problem("rate_limited", "Slow down.", { "Retry-After": "12" }));
    const res = await app.inject({ method: "GET", url: `/v1/houses/${H}/johns` });
    expect(res.statusCode).toBe(429);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["retry-after"]).toBe("12");
    expect(res.json()).toMatchObject({ title: "rate_limited", status: 429, detail: "Slow down.", requestId: res.headers["request-id"] });
  });

  it("leaks nothing from an unexpected error", async () => {
    const { app } = stub(() => new Error("password=hunter2 at db.internal:5432"));
    const res = await app.inject({ method: "GET", url: `/v1/houses/${H}/johns` });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("hunter2");
    expect(res.json().detail).toBe("Something went wrong on our side.");
  });

  it("refuses unknown paths, unreadable bodies and a path key sent twice", async () => {
    const { app, calls } = stub(() => ({ status: 201, body: null, requestId: "x" }));
    expect((await app.inject({ method: "GET", url: "/v1/nope" })).json()).toMatchObject({ title: "not_found", status: 404 });
    const bad = await app.inject({ method: "POST", url: `/v1/houses/${H}/johns`, payload: "{not json", headers: { "content-type": "application/json" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().title).toBe("invalid_input");
    const twice = await app.inject({ method: "POST", url: `/v1/houses/${H}/johns`, payload: { houseId: "22222222-2222-4222-8222-222222222222" } });
    expect(twice.json().title).toBe("invalid_input");
    const array = await app.inject({ method: "POST", url: `/v1/houses/${H}/johns`, payload: [1] });
    expect(array.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("serves its contract", async () => {
    const { app } = stub(() => null);
    const doc = (await app.inject({ method: "GET", url: "/v1/openapi.json" })).json();
    expect(Object.keys(doc.paths)).toEqual(["/v1/houses/{houseId}/johns"]);
    expect(doc.paths["/v1/houses/{houseId}/johns"].post.deprecated).toBe(true);
  });

  it("keeps apps/v1/openapi.json up to date (npm run openapi -w v1)", () => {
    const committed = JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"));
    expect(committed).toEqual(openApi(V1_OPERATIONS));
  });
});

describe("the registry on /v1", () => {
  it("serves every operation with a database function, each path key an input", async () => {
    expect(V1_OPERATIONS.length).toBeGreaterThan(90);
    for (const op of V1_OPERATIONS) {
      const shape = Object.keys((op.input as z.ZodObject).shape ?? {});
      for (const key of [...op.http.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])) expect(shape, `${op.name} ${op.http.path}`).toContain(key);
    }
    const app = buildApp({ execute: (async () => ({ status: 200, body: null, requestId: "x" })) as Executor, operations: V1_OPERATIONS });
    await app.ready();
    await app.close();
  });

  it("reads a query string by the operation's input types", () => {
    const types = queryTypes(z.object({ limit: z.int().optional(), all: z.boolean().optional(), ids: z.array(z.uuid()).optional(), q: z.string().optional() }));
    expect(readQuery({ limit: "20", all: "true", ids: "a,b", q: "12" }, types)).toEqual({ limit: 20, all: true, ids: ["a", "b"], q: "12" });
    expect(readQuery({ limit: "twenty", all: "yes" }, types)).toEqual({ limit: "twenty", all: "yes" });
  });
});

describe("hosting", () => {
  it("answers 503 until the API's database is set", async () => {
    const { handleV1 } = await import("../../src/fetch");
    const saved = process.env.API_DATABASE_URL;
    delete process.env.API_DATABASE_URL;
    const res = await handleV1(new Request("https://api.jonz.app/v1/health"));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    if (saved !== undefined) process.env.API_DATABASE_URL = saved;
  });

  it("lets in only listed browser origins, and answers their preflight", async () => {
    const app = buildApp({ execute: (async () => ({ status: 200, body: [], requestId: "x" })) as Executor, operations: [read], allowedOrigins: ["https://*-glynfincks-projects.vercel.app"] });
    const ok = await app.inject({ method: "OPTIONS", url: `/v1/houses/${H}/johns`, headers: { origin: "https://jonz-web-git-x-glynfincks-projects.vercel.app" } });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://jonz-web-git-x-glynfincks-projects.vercel.app");
    expect(String(ok.headers["access-control-allow-headers"])).toContain("Idempotency-Key");
    const other = await app.inject({ method: "GET", url: `/v1/houses/${H}/johns`, headers: { origin: "https://evil.example" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    expect(other.headers.vary).toContain("Origin");
  });
});
