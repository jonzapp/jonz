import {
  FRONT_DOOR_COPY,
  JOIN_COPY,
  NEW_HOUSE_COPY,
  PAGE_TITLE,
  SECTION_LABEL,
  SIGN_IN_COPY,
} from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, houseOf, signInToClient } from "./auth";

// The Expo app's web build: starting a house, joining one by its link or its
// code, and the house being caught up by the API as it comes into view.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/**
 * The house you're in, by name: on a phone Today names no house, so ask
 * House, whose title bar does.
 */
async function expectHouseNamed(page: Page, name: string) {
  await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
  await expect(page).toHaveURL(/\/house$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** Today asks /v1 to catch the house up as it opens; this is that call's answer. */
function caughtUp(page: Page) {
  return page.waitForResponse((r) => r.url().endsWith("/catch-up") && r.request().method() === "POST");
}

test("start a house, and land on it caught up", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ava Client"));
  const name = `Flat ${Date.now() % 10_000}`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("link", { name: FRONT_DOOR_COPY.startInstead }).click();
  await expect(page).toHaveURL(/\/house\/new$/);
  await expect(page.getByRole("heading", { name: NEW_HOUSE_COPY.heading })).toBeVisible();

  // One field, the name; the defaults are a line under it, and Change opens them.
  await page.getByLabel(FRONT_DOOR_COPY.name).fill(name);
  await page.getByTestId("change-defaults").click();
  await page.getByRole("radio", { name: "Sunday" }).click();
  const fresh = caughtUp(page);
  await page.getByTestId("create-house").click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: PAGE_TITLE.today })).toBeVisible();
  const answer = await fresh;
  expect(answer.status()).toBe(201);
  expect(await answer.json()).toEqual({ ticked: true });
  await expectHouseNamed(page, name);
});

test("a join link opens on the invite, signs you in on the spot, then joins", async ({ context, page }) => {
  const { ownerId, code } = await houseOf("Ben Owner", "Number 9");
  made.push(ownerId);

  // Signed out, the link opens on the invite: the house and how many live there, not yet what it plays for.
  await page.goto(`/join/${code}`);
  const invite = page.getByTestId("invite-first");
  await expect(invite.getByRole("heading", { name: "Number 9" })).toBeVisible();
  await expect(invite.getByText(JOIN_COPY.livesHere(1))).toBeVisible();
  await expect(page.getByTestId("join-stake")).toHaveCount(0);
  // Its one button leads to signing in, right there, the house still named and the code kept.
  await invite.getByRole("button", { name: FRONT_DOOR_COPY.join }).click();
  await expect(page.getByText(JOIN_COPY.signInFor("Number 9"))).toBeVisible();
  await page.route(/\/auth\/v1\/authorize/, (route) => route.fulfill({ status: 200, body: "Google" }));
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
  await page.getByRole("button", { name: SIGN_IN_COPY.google }).click();
  expect(new URL((await authorize).url()).searchParams.get("redirect_to")).toBe(`${CLIENT_URL}/join/${code}`);

  // Back from Google (minted here), signed in on the same link.
  made.push(await signInToClient(context, "Cal Client"));
  const joiner = await context.newPage();
  await joiner.goto(`/join/${code}`);
  await expect(joiner.getByRole("heading", { name: "Number 9" })).toBeVisible();
  await expect(joiner.getByText(JOIN_COPY.livesHere(1))).toBeVisible();
  const catching = caughtUp(joiner);
  await joiner.getByRole("button", { name: FRONT_DOOR_COPY.join }).click();
  await expect(joiner).toHaveURL(/\/today$/);
  await expect(joiner.getByRole("heading", { name: PAGE_TITLE.today })).toBeVisible();
  expect((await catching).status()).toBe(201);
  await expectHouseNamed(joiner, "Number 9");
});

test("a join link that opens nothing says so before anyone signs in", async ({ page }) => {
  await page.goto("/join/ZZZZ2222");
  await expect(page.getByRole("heading", { name: JOIN_COPY.badLink })).toBeVisible();
  await expect(page.getByRole("button", { name: SIGN_IN_COPY.google })).toHaveCount(0);
});

test("a code typed in joins too, however it's spelt", async ({ context, page }) => {
  const { ownerId, code } = await houseOf("Dee Owner", "The Loft");
  made.push(ownerId, await signInToClient(context, "Eli Client"));

  await page.goto("/welcome");
  await page.getByLabel(FRONT_DOOR_COPY.paste).fill("NOPE");
  await page.getByRole("button", { name: FRONT_DOOR_COPY.open }).click();
  await expect(page.getByText(FRONT_DOOR_COPY.badInvite)).toBeVisible();

  await page.getByLabel(FRONT_DOOR_COPY.paste).fill(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
  await page.getByRole("button", { name: FRONT_DOOR_COPY.open }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${code}$`));
  await expect(page.getByRole("heading", { name: "The Loft" })).toBeVisible();
});
