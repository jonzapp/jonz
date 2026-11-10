import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, OPTIONS, POST } from "@/app/auth/v1/[...path]/route";

// Sign-in on our own address (app/auth/v1): each request goes on to Supabase
// Auth as the person sent it, and only the paths a person signs in with.

const SUPABASE = "https://db.example";
const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("ALLOWED_ORIGINS", "https://staging.jonz.app");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
  return { url, init, headers: init.headers };
};

describe("/auth/v1", () => {
  it("passes a sign-in on with the person's own token and body, and brings the answer back", async () => {
    fetchMock.mockResolvedValue(new Response('{"access_token":"t"}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1", server: "gotrue" } }));
    const request = new Request("https://jonz.app/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { authorization: "Bearer anon", apikey: "anon", "content-type": "application/json", "x-client-info": "supabase-js/2", cookie: "c=1", "x-forwarded-for": "203.0.113.9" },
      body: '{"email":"a@b.c","password":"p"}',
    });
    const answer = await POST(request, params("token"));
    const { url, init, headers } = sent();
    expect(url).toBe(`${SUPABASE}/auth/v1/token?grant_type=password`);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"email":"a@b.c","password":"p"}');
    expect(headers.get("authorization")).toBe("Bearer anon");
    expect(headers.get("x-client-info")).toBe("supabase-js/2");
    expect(headers.get("cookie")).toBeNull();
    // Without our secret key, the person's address isn't vouched for.
    expect(headers.get("apikey")).toBe("anon");
    expect(headers.get("sb-forwarded-for")).toBeNull();
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('{"access_token":"t"}');
    expect(answer.headers.get("set-cookie")).toBeNull();
    expect(answer.headers.get("server")).toBeNull();
    expect(answer.headers.get("cache-control")).toBe("no-store");
  });

  it("with the secret key, has Supabase limit each person by their own address, never by their token's say", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await GET(new Request("https://jonz.app/auth/v1/user", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }), params("user"));
    const { headers } = sent();
    expect(headers.get("apikey")).toBe("sb_secret_x");
    expect(headers.get("sb-forwarded-for")).toBe("203.0.113.9");
    // No token of their own: they ask as anyone would, not as our key.
    expect(headers.get("authorization")).toBe("Bearer anon");
  });

  it("never sends a new publishable key as a Bearer token: the apikey alone says it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_x");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await GET(new Request("https://jonz.app/auth/v1/settings"), params("settings"));
    const { headers } = sent();
    expect(headers.get("apikey")).toBe("sb_publishable_x");
    expect(headers.get("authorization")).toBeNull();
  });

  it("hands a redirect back as it is (a provider's sign-in page, or back to the app)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://accounts.google.com/o/oauth2/auth?x=1" } }));
    const answer = await GET(new Request("https://jonz.app/auth/v1/authorize?provider=google"), params("authorize"));
    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/auth?x=1");
  });

  it("answers 404 for the admin API, anything else of Supabase's, or a path that climbs, without asking", async () => {
    for (const path of [["admin", "users"], ["invite"], ["generate_link"], [], ["user", ".."], ["callback"]]) {
      const answer = await GET(new Request(`https://jonz.app/auth/v1/${path.join("/")}`), params(...path));
      expect(answer.status, path.join("/")).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the staging site ask from its own origin, and no other", async () => {
    const ok = OPTIONS(new Request("https://api.staging.jonz.app/auth/v1/token", { method: "OPTIONS", headers: { origin: "https://staging.jonz.app" } }));
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://staging.jonz.app");
    expect(ok.headers.get("access-control-allow-headers")).toContain("apikey");
    const other = OPTIONS(new Request("https://api.staging.jonz.app/auth/v1/token", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("says sign-in isn't answering when Supabase can't be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const answer = await POST(new Request("https://jonz.app/auth/v1/token", { method: "POST", body: "{}" }), params("token"));
    expect(answer.status).toBe(502);
    expect(await answer.json()).toMatchObject({ error_code: "unexpected_failure" });
  });
});
