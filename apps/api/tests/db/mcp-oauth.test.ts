// A connected app's whole way in, against the local stack's own OAuth server
// (supabase/config.toml, [auth.oauth_server]), as an MCP client goes:
// it registers itself, sends the person to Jonz's consent page, gets a token
// carrying its client_id, and then reaches Jonz through /mcp and nowhere
// else. The person sees it under Connected apps and can disconnect it.

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { connect, createExecutor, tokenVerifier, type Sql } from "@app/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { decodeJwt } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { apiOperation } from "v1";

import { buildMcpServer, protectedResource } from "@/lib/mcp/server";
import { signedInUser } from "@/tests/support/clients";
import { ANON_KEY, SUPABASE_URL } from "@/tests/support/env";
import { restoreApiRole } from "../support/api-role";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const BACK = "http://localhost:9999/callback";
const ops = [apiOperation("create_house"), apiOperation("my_permissions")];

let admin: Sql;
let pool: Sql;

beforeAll(async () => {
  admin = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const password = randomBytes(18).toString("hex");
  await admin.unsafe(`alter role jonz_api password '${password}'`);
  const url = new URL(DB_URL);
  url.username = "jonz_api";
  url.password = password;
  pool = connect(url.toString(), 2);
});

afterAll(async () => {
  await restoreApiRole(admin);
  await pool.end();
  await admin.end();
});

const auth = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/auth/v1${path}`, { ...init, redirect: "manual", headers: { apikey: ANON_KEY, ...(init.headers ?? {}) } });

it("lets an app in through Jonz's consent page, and then only through /mcp", async () => {
  // The app registers itself (dynamic client registration).
  const registered = await auth("/oauth/clients/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test MCP client", redirect_uris: [BACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  });
  expect(registered.status).toBe(201);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };

  // It sends the person to sign in, asking for every scope /mcp names and for
  // /mcp itself, as Claude does: Supabase hands them to Jonz's consent page.
  const meta = protectedResource("https://api.jonz.app", SUPABASE_URL);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const asked = await auth(`/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(BACK)}&state=s1&code_challenge=${challenge}&code_challenge_method=S256&scope=${encodeURIComponent(meta.scopes_supported.join(" "))}&resource=${encodeURIComponent(meta.resource)}&prompt=consent`);
  expect(asked.status).toBe(302);
  const consent = new URL(asked.headers.get("location")!);
  expect(consent.pathname).toBe("/oauth/consent");
  const authorizationId = consent.searchParams.get("authorization_id")!;

  // What the page does, as the person signed in to Jonz.
  const person = await signedInUser("Connecting");
  const { data: details, error } = await person.db.auth.oauth.getAuthorizationDetails(authorizationId);
  expect(error).toBeNull();
  expect(details).toMatchObject({ client: { id: clientId, name: "Test MCP client" }, redirect_uri: BACK });
  const { data: allowed } = await person.db.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  const back = new URL(allowed!.redirect_url);
  expect(back.origin + back.pathname).toBe(BACK);
  expect(back.searchParams.get("state")).toBe("s1");

  // The app swaps the code for a token, which says which app it is.
  const token = await auth("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: clientId, redirect_uri: BACK, code_verifier: verifier }),
  });
  expect(token.status).toBe(200);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };
  expect(decodeJwt(accessToken)).toMatchObject({ sub: person.userId, client_id: clientId });

  // Straight to the tables: refused.
  const rest = await fetch(`${SUPABASE_URL}/rest/v1/houses?select=id`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${accessToken}` } });
  expect(rest.status).toBe(403);

  // Through /mcp: the person's own Jonz, as the person.
  const execute = createExecutor({ sql: pool, verify: tokenVerifier({ supabaseUrl: SUPABASE_URL }), operations: ops });
  const tool = async (name: string, args: Record<string, unknown>) => {
    const res = await createMcpHandler(() => buildMcpServer(execute, `Bearer ${accessToken}`, ops)).fetch(
      new Request("https://api.jonz.app/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
    );
    const text = await res.text();
    const json = text.trimStart().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
    return (JSON.parse(json) as { result: { isError?: boolean; content: { text: string }[] } }).result;
  };
  const newHouse = { name: "Connected house", timezone: "Europe/London", currency: "GBP", weekStarts: 1 };

  // The consent page saved Read only before Allow (as the page does, with the person's own session):
  // the app reads, and every change is refused.
  const { error: picked } = await person.db.rpc("set_app_access", { p_client_id: clientId, p_access: "read" });
  expect(picked).toBeNull();
  const reads = await tool("my_permissions", { houseId: randomUUID() });
  expect(reads.content[0]?.text ?? "").not.toMatch(/can only read/);
  const refused = await tool("create_house", newHouse);
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toMatch(/^forbidden: This app can only read/);
  // The app can't change that itself, straight to the database or through /mcp.
  const { error: raised } = await (await import("@supabase/supabase-js"))
    .createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } })
    .rpc("set_app_access", { p_client_id: clientId, p_access: "write" });
  expect(raised).not.toBeNull();
  // Nor is it an MCP tool (firstParty, apps/api/tests/unit/mcp.test.ts).

  // The person lets it read and change, under Connected apps (through /v1, as the app does): from its next call it can.
  const v1 = createExecutor({ sql: pool, verify: tokenVerifier({ supabaseUrl: SUPABASE_URL }), operations: [apiOperation("set_app_access"), apiOperation("my_app_access")] });
  const personToken = `Bearer ${(await person.db.auth.getSession()).data.session!.access_token}`;
  await expect(v1("set_app_access", { authorization: personToken, via: "api" }, { clientId, access: "write" })).resolves.toMatchObject({ status: 201 });
  await expect(v1("my_app_access", { authorization: personToken, via: "api" }, {})).resolves.toMatchObject({ body: [{ clientId, access: "write" }] });
  const made = await tool("create_house", newHouse);
  expect(made.isError, made.content[0]?.text).toBeFalsy();
  const [audit] = await admin<{ via: string }[]>`select via from public.api_audit_entries where user_id = ${person.userId}::uuid and operation = 'create_house'`;
  expect(audit?.via).toBe("mcp");
  // Even able to change things, the app can't set or read its own access through /v1: only the person, in Jonz.
  await expect(v1("set_app_access", { authorization: `Bearer ${accessToken}`, via: "api" }, { clientId, access: "read" })).rejects.toMatchObject({ code: "forbidden" });
  await expect(v1("my_app_access", { authorization: `Bearer ${accessToken}`, via: "api" }, {})).rejects.toMatchObject({ code: "forbidden" });
  await expect(v1("my_app_access", { authorization: personToken, via: "api" }, {})).resolves.toMatchObject({ body: [{ clientId, access: "write" }] });
  await admin`delete from public.houses where created_by = ${person.userId}::uuid`;

  // The person sees it under Connected apps, and disconnects it: its token's session ends.
  const { data: grants } = await person.db.auth.oauth.listGrants();
  expect(grants?.map((g) => g.client.id)).toEqual([clientId]);
  const { error: revokeError } = await person.db.auth.oauth.revokeGrant({ clientId });
  expect(revokeError).toBeNull();
  const { data: after } = await person.db.auth.oauth.listGrants();
  expect(after).toEqual([]);
  const user = await auth("/user", { headers: { authorization: `Bearer ${accessToken}` } });
  expect(user.status).not.toBe(200);
});
