import { createHash, randomBytes, randomUUID } from "node:crypto";

import { OPERATIONS, wordsFor } from "@app/core";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { CLIENT_URL, cleanUp, undealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// Connecting an app to Jonz over MCP, in the Expo app's web build
// (docs/specs/operation-registry.md, "MCP"): the app registers with the local
// stack's OAuth server and sends the person to Jonz's consent page, where
// they pick what it may do (Read only first, or Read and change) and Allow
// sends them back to it with a code; the app then shows under Connected apps
// on You, saying what it may do, and its sheet changes that or disconnects
// it. And a request it makes that can't be undone waits
// at jonz.app/approve/<id> until the person approves it there.
//
// With SHOTS=<folder> it also takes the PR's pictures there, Day and Night.
test.use({ baseURL: CLIENT_URL });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const BACK = "http://localhost:9999/callback";

const made: string[] = [];
test.afterAll(async () => {
  await cleanUp(made);
});

async function shoot(page: Page, name: string) {
  const folder = process.env.SHOTS;
  if (!folder) return;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${folder}/${name}-${test.info().project.name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** An app registers itself and asks to sign in: the consent page's authorization_id. */
async function anAppAsks(name: string): Promise<string> {
  const auth = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/auth/v1${path}`, { ...init, redirect: "manual", headers: { apikey: ANON_KEY, ...(init.headers ?? {}) } });
  const registered = await auth("/oauth/clients/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: name, client_uri: "https://example.com", redirect_uris: [BACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }),
  });
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
  const asked = await auth(`/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(BACK)}&state=s1&code_challenge=${challenge}&code_challenge_method=S256`);
  return new URL(asked.headers.get("location")!).searchParams.get("authorization_id")!;
}

test("connects an app on Jonz's consent page, lists it on You, and approves what it can't undo", async ({ browser }) => {
  const context = await browser.newContext();
  const { userId, houseId } = await undealtHouseInClient(context, "Sam Okafor", "Okafor House", ["Bins"]);
  made.push(userId);
  const page = await context.newPage();

  // The consent page: the app by name, and Allow back to it with a code.
  const app = `Notes ${randomUUID().slice(0, 4)}`;
  const authorizationId = await anAppAsks(app);
  await page.route(`${BACK}**`, (route) => route.fulfill({ status: 200, body: "back in the app" }));
  await page.goto(`/oauth/consent?authorization_id=${authorizationId}`);
  await expect(page.getByRole("heading", { name: words('people.consent.heading', { app }) })).toBeVisible();
  await expect(page.getByText(words('people.consent.body', { app }))).toBeVisible();
  // What it may do: Read only until Sam picks otherwise.
  await expect(page.getByText(words('people.appAccess.label', { app }))).toBeVisible();
  const readOnly = page.getByTestId("app-access-read");
  const change = page.getByTestId("app-access-write");
  await expect(readOnly).toHaveAttribute("aria-checked", "true");
  await expect(change).toHaveAttribute("aria-checked", "false");
  await shoot(page, "consent");
  await change.click();
  await expect(change).toHaveAttribute("aria-checked", "true");
  await expect(readOnly).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: words('people.consent.allow'), exact: true }).click();
  await page.waitForURL((url) => url.href.startsWith(BACK) && url.searchParams.has("code"));
  const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
  const access = async () => (await sql<{ access: string }[]>`select access from public.connected_apps where user_id = ${userId}::uuid`).map((r) => r.access);
  expect(await access()).toEqual(["write"]);

  // Connected apps on You: what it may do, and its sheet changes it.
  await page.goto("/house/you");
  const row = page.getByTestId("connected-app");
  await expect(row).toContainText(app);
  await expect(row).toContainText(words('people.appAccess.write'));
  await row.scrollIntoViewIfNeeded();
  await shoot(page, "connected-apps");
  await row.click();
  const sheet = page.getByTestId("app-sheet");
  await expect(sheet.getByTestId("app-access-write")).toHaveAttribute("aria-checked", "true");
  await shoot(page, "app-sheet");
  await sheet.getByTestId("app-access-read").click();
  await expect(sheet.getByTestId("app-access-read")).toHaveAttribute("aria-checked", "true");
  await expect.poll(access).toEqual(["read"]);
  // The sheet's own close: Safari doesn't take Escape as a close.
  await sheet.getByTestId("sheet-close").click();
  await expect(page.getByTestId("sheet-scrim")).toHaveCount(0);
  await expect(row).toContainText(words('people.appAccess.read'));

  // A request it can't undo, waiting for Sam.
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.api_approvals (user_id, operation, request_hash, input, house_id, client_id, expires_at)
    values (${userId}::uuid, 'set_house_kind', ${"a".repeat(64)}, ${sql.json({ houseId, kind: "family" })}, ${houseId}::uuid, 'notes', now() + interval '15 minutes')
    returning id`;
  await page.goto(`/approve/${id}`);
  await expect(page.getByRole("heading", { name: words('people.approve.heading') })).toBeVisible();
  await expect(page.getByTestId("approve-ask")).toHaveText(`${OPERATIONS.set_house_kind.about}.`);
  await expect(page.getByText(words('people.approve.inHouse', { house: "Okafor House" }))).toBeVisible();
  await shoot(page, "approve");
  await page.getByRole("button", { name: words('people.approve.approve'), exact: true }).click();
  await expect(page.getByRole("heading", { name: words('people.approve.approved') })).toBeVisible();
  await shoot(page, "approved");
  const [row2] = await sql<{ approved_at: Date | null }[]>`select approved_at from public.api_approvals where id = ${id}::uuid`;
  expect(row2.approved_at).not.toBeNull();
  await sql.end();

  // Disconnect it, from its sheet.
  await page.goto("/house/you");
  await page.getByTestId("connected-app").click();
  await page.getByTestId("app-sheet").getByRole("button", { name: words('people.connectedApps.disconnect') }).click();
  await page.getByTestId("disconnect-sheet").getByRole("button", { name: words('people.connectedApps.disconnect') }).click();
  await expect(page.getByTestId("connected-app")).toHaveCount(0);

  // How to connect one again: the steps and the address to paste.
  await page.getByTestId("connect-claude").click();
  const help = page.getByTestId("connect-claude-sheet");
  await expect(help.getByTestId("mcp-address-value")).toHaveText(/\/mcp$/);
  await expect(help.getByRole("button", { name: words('people.connectClaude.open') })).toBeVisible();
  await shoot(page, "connect-claude");
  await context.close();
});
