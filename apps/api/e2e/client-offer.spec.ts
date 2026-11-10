import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, signInToClient, undealtHouseInClient } from "./auth";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// An offer's link in the Expo app's web build (docs/specs/promotions.md): a
// free year for two named people. Signed out, anyone with the link sees what
// it gives on the taped sign and Sign in to use it; signed in as someone it
// isn't for, it says so; signed in as one of them, Use it gives their house
// the Pass and opens its page. Its card in a chat, and the checks at
// checkout, are tests/db/promotions.test.ts.
//
// With SHOTS=<folder> it also takes the PR's pictures there, Day and Night.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
const codes: string[] = [];
test.afterAll(async () => {
  if (codes.length) await admin().from("promotions").delete().in("code", codes);
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

/** A live free year, named for these emails, as the owner's form makes one. */
async function freeYearFor(emails: string[]): Promise<string> {
  const code = `YEAR${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  codes.push(code);
  const db = admin();
  const { data, error } = await db
    .from("promotions")
    .insert({ code, name: "A free year for friends", note: "Thanks for helping test Jonz.", kind: "gift", months: 12, audience: "named", state: "live" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: peopleError } = await db.from("promotion_people").insert(emails.map((email) => ({ promotion_id: data.id, email })));
  if (peopleError) throw peopleError;
  return code;
}

async function emailOf(userId: string): Promise<string> {
  const { data, error } = await admin().auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user.email!.toLowerCase();
}

test("shows anyone what it gives, and gives the Pass to the person it's for", async ({ browser }) => {
  const mine = await browser.newContext();
  const { userId, houseId } = await undealtHouseInClient(mine, "Sam Okafor", "Okafor House", ["Bins"]);
  made.push(userId);
  const code = await freeYearFor([await emailOf(userId), "priya.n@example.com"]);

  // Signed out: the sign, never who it's for, and Sign in to use it.
  const stranger = await browser.newContext();
  const out = await stranger.newPage();
  await out.goto(`/offer/${code.toLowerCase()}`);
  const sign = out.getByTestId("offer-sign");
  await expect(sign).toContainText("A free year of the House Pass");
  await expect(out.getByTestId("offer-note")).toHaveText("Thanks for helping test Jonz.");
  await expect(sign).not.toContainText("priya.n@example.com");
  await shoot(out, "offer-signed-out");
  await out.getByTestId("offer-sign-in").click();
  await expect(out.getByTestId("sign-in-panel")).toContainText("Sign in to use your offer.");
  await stranger.close();

  // Signed in as someone it isn't for.
  const other = await browser.newContext();
  made.push(await signInToClient(other, "Leo Marsh"));
  const theirs = await other.newPage();
  await theirs.goto(`/offer/${code}`);
  await expect(theirs.getByTestId("offer-not-yours")).toContainText("for someone else");
  await expect(theirs.getByTestId("offer-use")).toHaveCount(0);
  await other.close();

  // Signed in as one of them: Use it, and the house has the Pass.
  const page = await mine.newPage();
  await page.goto(`/offer/${code}`);
  await expect(page.getByTestId("offer-use")).toBeVisible();
  await expect(page.getByTestId("offer-you")).toContainText("Signed in as");
  await shoot(page, "offer");
  await page.getByTestId("offer-use").click();
  await expect(page.getByTestId("pass-screen")).toBeVisible();

  const { data: house } = await admin().from("houses").select("pass_plan, pass_ends_at").eq("id", houseId).single();
  expect(house?.pass_plan).toBe("trial");
  expect(new Date(house!.pass_ends_at!).getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);

  // Used: the link says so now, for this house.
  await page.goto(`/offer/${code}`);
  await expect(page.getByTestId("offer-refused")).toContainText("used already");
  await mine.close();
});

test("says a stopped or unknown link opens nothing", async ({ page }) => {
  const code = await freeYearFor(["someone@example.com"]);
  const { error } = await admin().from("promotions").update({ state: "stopped", stopped_at: new Date().toISOString() }).eq("code", code);
  expect(error).toBeNull();
  await page.goto(`/offer/${code}`);
  await expect(page.getByTestId("offer-ended")).toContainText(words('door.offer.ended'));
  await shoot(page, "offer-ended");
  await page.goto("/offer/NOSUCHOFFER1");
  await expect(page.getByTestId("offer-unknown")).toContainText(words('door.offer.unknown'));
});
