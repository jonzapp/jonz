import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { tokenVerifier } from "./auth";
import { checkClient, parseClient } from "./client";
import { defaultRpcArgs, fromDatabase, requestHash, type ApiOperation } from "./executor";
import { openApi, pathKeys } from "./openapi";
import { Problem } from "./problem";

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";
const NOW = 1_800_000_000; // a fixed moment, in seconds: tests never read the real clock

async function token(claims: Record<string, unknown>, exp = NOW + 3600) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt(NOW - 10).setExpirationTime(exp).sign(new TextEncoder().encode(SECRET));
}

describe("tokens", () => {
  const verify = tokenVerifier({ supabaseUrl: "http://127.0.0.1:54341", jwtSecret: SECRET, currentDate: new Date(NOW * 1000) });

  it("accepts a signed-in person's token", async () => {
    const t = await token({ sub: "11111111-1111-1111-1111-111111111111", role: "authenticated", aud: "authenticated" });
    await expect(verify(`Bearer ${t}`)).resolves.toMatchObject({ sub: "11111111-1111-1111-1111-111111111111" });
  });

  it.each([
    ["no header", null],
    ["not bearer", "Basic abc"],
  ])("refuses %s", async (_, header) => {
    await expect(verify(header)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("refuses the anon key, a service key, another audience, an expired token and a forged one", async () => {
    const tokens = [
      await token({ role: "anon", aud: "authenticated" }),
      await token({ sub: "x", role: "service_role", aud: "authenticated" }),
      await token({ sub: "x", role: "authenticated", aud: "other" }),
      await token({ sub: "x", role: "authenticated", aud: "authenticated" }, NOW - 1),
      (await token({ sub: "x", role: "authenticated", aud: "authenticated" })).slice(0, -2) + "xx",
    ];
    for (const t of tokens) await expect(verify(`Bearer ${t}`)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("client version gate", () => {
  it("reads the header", () => {
    expect(parseClient("ios/1.4.2 (57)")).toEqual({ platform: "ios", version: "1.4.2", build: 57 });
    expect(parseClient("web/2.0.0")).toEqual({ platform: "web", version: "2.0.0", build: 0 });
    expect(parseClient("curl/8")).toBeNull();
    expect(parseClient(undefined)).toBeNull();
  });

  it("turns away phone builds below the minimum with 426, never the web or MCP", () => {
    expect(() => checkClient("android/1.0.0 (9)", { android: 10 })).toThrow(Problem);
    try {
      checkClient("android/1.0.0 (9)", { android: 10 });
    } catch (e) {
      expect((e as Problem).status).toBe(426);
      expect((e as Problem).headers["Jonz-Minimum-Build"]).toBe("10");
    }
    expect(checkClient("android/1.0.0 (10)", { android: 10 })?.build).toBe(10);
    expect(checkClient("web/0.0.1", { ios: 99, android: 99 })?.platform).toBe("web");
    expect(checkClient(null, { ios: 99 })).toBeNull();
  });
});

describe("arguments and errors", () => {
  it("names a function's arguments p_snake_case", () => {
    expect(defaultRpcArgs({ houseId: "h", weekStartsOn: "2026-11-09", note: null })).toEqual({ p_house_id: "h", p_week_starts_on: "2026-11-09", p_note: null });
  });

  it("ties an Idempotency-Key to the request, whatever order its keys came in", () => {
    expect(requestHash("add_john", { a: 1, b: [1, { y: 2, x: 1 }] })).toBe(requestHash("add_john", { b: [1, { x: 1, y: 2 }], a: 1 }));
    expect(requestHash("add_john", { a: 1 })).not.toBe(requestHash("add_john", { a: 2 }));
    expect(requestHash("add_john", { a: 1 })).not.toBe(requestHash("remove_john", { a: 1 }));
  });

  it("passes on only the words a function raised on purpose", () => {
    expect(fromDatabase({ code: "42501", message: "permission denied for table houses" })).toMatchObject({ code: "forbidden", message: "You can't do that in this house." });
    expect(fromDatabase({ code: "P0001", message: "That week is already dealt." })).toMatchObject({ code: "rejected", message: "That week is already dealt." });
    expect(fromDatabase({ code: "40001" }).code).toBe("conflict");
    expect(fromDatabase({ code: "XX000", message: "internal detail" })).toMatchObject({ code: "internal", message: "Something went wrong on our side." });
    expect(fromDatabase(new Error("connection refused")).code).toBe("internal");
  });

  it("writes problems as RFC 9457", () => {
    expect(new Problem("forbidden", "No.").body("req_1")).toEqual({ type: "https://api.jonz.app/problems/forbidden", title: "forbidden", status: 403, detail: "No.", requestId: "req_1" });
  });
});

describe("OpenAPI", () => {
  const ops: ApiOperation[] = [
    {
      name: "list_johns",
      operation: { about: "Lists a house's Johns.", scope: "house", effect: "read", guard: { by: "permission", permission: "johns:read" }, rpc: { name: "list_johns" } },
      input: z.object({ houseId: z.uuid(), limit: z.number().int().optional() }),
      output: z.array(z.object({ id: z.uuid(), name: z.string() })),
      http: { method: "GET", path: "/v1/houses/{houseId}/johns" },
    },
    {
      name: "add_john",
      operation: { about: "Adds a John.", scope: "house", effect: "write", guard: { by: "permission", permission: "johns:write" }, rpc: { name: "add_john" }, destructive: true },
      input: z.object({ houseId: z.uuid(), name: z.string().min(1) }),
      output: z.object({ id: z.uuid() }),
      http: { method: "POST", path: "/v1/houses/{houseId}/johns" },
    },
  ];
  const doc = openApi(ops) as { openapi: string; paths: Record<string, Record<string, { parameters: { name?: string; in?: string; $ref?: string }[]; requestBody?: unknown; responses: Record<string, unknown>; [k: string]: unknown }>> };

  it("puts path keys in the path, a read's other input in the query, and a write's in the body", () => {
    expect(pathKeys("/v1/houses/{houseId}/weeks/{weekId}")).toEqual(["houseId", "weekId"]);
    expect(doc.openapi).toBe("3.1.0");
    const get = doc.paths["/v1/houses/{houseId}/johns"].get;
    expect(get.parameters.filter((p) => p.name).map((p) => [p.name, p.in])).toEqual([["houseId", "path"], ["limit", "query"]]);
    expect(get.requestBody).toBeUndefined();
    expect(get.responses["200"]).toBeDefined();
    const post = doc.paths["/v1/houses/{houseId}/johns"].post;
    expect(post.requestBody).toMatchObject({ required: true, content: { "application/json": { schema: { required: ["name"] } } } });
    expect(post.parameters.some((p) => p.$ref === "#/components/parameters/IdempotencyKey")).toBe(true);
    expect(post["x-jonz-permission"]).toBe("johns:write");
    expect(post["x-jonz-destructive"]).toBe(true);
    expect(post.responses["201"]).toBeDefined();
  });
});
