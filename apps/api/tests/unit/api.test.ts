import { afterEach, describe, expect, it } from "vitest";

import { getBearerToken } from "@/lib/auth";
import { corsHeaders } from "@/lib/cors";
import { error, json, preflight, refused } from "@/lib/respond";

describe("getBearerToken", () => {
  it("reads a bearer token", () => {
    expect(getBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(getBearerToken("bearer abc")).toBe("abc");
  });

  it("refuses a missing or malformed header", () => {
    for (const header of [null, "", "Basic abc", "Bearer", "Bearer ", "Bearer a b", "abc"]) {
      expect(getBearerToken(header)).toBeNull();
    }
  });
});

describe("corsHeaders", () => {
  const allowed = ["http://localhost:8205"];

  it("lets a listed web origin in", () => {
    expect(corsHeaders("http://localhost:8205", allowed)).toMatchObject({
      "Access-Control-Allow-Origin": "http://localhost:8205",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Vary: "Origin",
    });
  });

  it("lets nobody else in, or a phone (no Origin), but still says the answer depends on Origin", () => {
    expect(corsHeaders("https://evil.example", allowed)).toEqual({ Vary: "Origin" });
    expect(corsHeaders("http://localhost:8205.evil.example", allowed)).toEqual({ Vary: "Origin" });
    expect(corsHeaders(null, allowed)).toEqual({ Vary: "Origin" });
    expect(corsHeaders("http://localhost:8205", [])).toEqual({});
  });

  it("lets a preview in through a one-label wildcard, and nothing past it", () => {
    const previews = ["https://staging.jonz.app", "https://*-glynfincks-projects.vercel.app"];
    expect(corsHeaders("https://jonz-web-git-fix-glynfincks-projects.vercel.app", previews)).toMatchObject({
      "Access-Control-Allow-Origin": "https://jonz-web-git-fix-glynfincks-projects.vercel.app",
    });
    expect(corsHeaders("https://staging.jonz.app", previews)).toMatchObject({ Vary: "Origin" });
    expect(corsHeaders("https://evil.example/x-glynfincks-projects.vercel.app", previews)).toEqual({ Vary: "Origin" });
    expect(corsHeaders("https://a.b-glynfincks-projects.vercel.app", previews)).toEqual({ Vary: "Origin" });
    expect(corsHeaders("https://x-glynfincks-projects.vercel.app.evil.example", previews)).toEqual({ Vary: "Origin" });
    expect(corsHeaders("https://x-glynfincksXprojects.vercel.app", previews)).toEqual({ Vary: "Origin" });
  });
});

describe("responses", () => {
  const saved = process.env.ALLOWED_ORIGINS;
  afterEach(() => {
    process.env.ALLOWED_ORIGINS = saved;
  });

  const from = (origin?: string) => new Request("http://localhost:3205/api/fresh", { headers: origin ? { origin } : {} });

  it("gives every error the same shape", async () => {
    process.env.ALLOWED_ORIGINS = "";
    const response = error(from(), 404, "That isn’t in your house.");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "That isn’t in your house." });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers an allowed origin's preflight, and its calls, with CORS", async () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:8205, https://example.test";
    const pre = preflight(from("http://localhost:8205"));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("http://localhost:8205");
    const ok = json(from("https://example.test"), { ticked: true });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://example.test");
    expect(await ok.json()).toEqual({ ticked: true });
  });
});

describe("refused", () => {
  const request = new Request("http://localhost:3205/api/disputes", { method: "POST" });

  it("says a refusal in words, with what kind it was", async () => {
    const notYours = refused(request, { message: "own_john", code: "42501" });
    expect(notYours.status).toBe(403);
    expect(await notYours.json()).toEqual({ error: "You can’t vote on your own John, or on a cover of it." });

    const notNow = refused(request, { message: "already_disputed", code: "P0001" });
    expect(notNow.status).toBe(409);
    expect(await notNow.json()).toEqual({ error: "Someone’s already disputing that tick." });
  });

  it("calls anything else a fault, never repeating the database's own message", async () => {
    const fault = refused(request, { message: "connection terminated unexpectedly", code: "08006" });
    expect(fault.status).toBe(500);
    expect(await fault.json()).toEqual({ error: "Something went wrong. Try again." });
  });
});
