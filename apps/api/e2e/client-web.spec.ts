import { GOOGLE_LIMITED_USE, HOUSE_LOWER_COPY, LOOK_LABEL, NOT_FOUND_COPY, REMINDERS_COPY, SECTION_LABEL, SIGN_IN_COPY, TERMS } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

// What the web app has beyond its screens, on the Expo app's web build: the
// pages anyone can open, the tab titles, the look, reminders, and the files a
// browser asks for to install it.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("privacy, the terms, and a link to nowhere, open for anyone", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: SIGN_IN_COPY.privacy }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText(GOOGLE_LIMITED_USE)).toBeVisible();
  await expect(page).toHaveTitle("Privacy · Jonz");

  // Opened cold, as Google's, Microsoft's and the stores' reviewers will.
  await page.goto("/terms");
  await expect(page.getByText(TERMS.lead)).toBeVisible();
  await expect(page).toHaveTitle("Terms · Jonz");

  for (const path of ["/nowhere/at-all", "/_sitemap"]) {
    await page.goto(path);
    await expect(page.getByText(NOT_FOUND_COPY.body)).toBeVisible();
  }
  // Signed out there are no Johns to go back to, so it's the front door.
  await page.getByRole("link", { name: NOT_FOUND_COPY.backToDoor }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: SIGN_IN_COPY.privacy })).toBeVisible();
});

test("installable: the manifest, its icons and the service worker are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = await manifest.json();
  expect(body.start_url).toBe("/today");
  for (const icon of body.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain("showNotification");
});

test("tab titles, the look, and reminders on this device", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "light" });
  // The browser's push service stood in for: subscribing hands back a made-up
  // endpoint, as a real one would, and the app saves it as the user's own.
  await context.addInitScript(() => {
    let current: unknown = null;
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/e2e-device",
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e-device", keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" } }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    };
    const pushManager = {
      subscribe: async () => (current = subscription),
      getSubscription: async () => current,
    };
    const registration = { pushManager };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: async () => registration, getRegistration: async () => registration, ready: Promise.resolve(registration) },
      configurable: true,
    });
    Object.assign(window, { PushManager: function PushManager() {}, Notification: { requestPermission: async () => "granted" } });
  });
  const { userId } = await dealtHouseInClient(context, "Ava Web", "Flat 80", [{ name: "Bins out", category: "bins" }]);
  made.push(userId);

  const page = await context.newPage();
  await page.goto("/today");
  await expect(page).toHaveTitle("Today · Jonz");
  await page.getByRole("tab", { name: SECTION_LABEL.week }).click();
  await expect(page).toHaveTitle("This week · Jonz");
  await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
  await expect(page).toHaveTitle("House · Jonz");

  // Night, chosen on You, stays chosen on this device.
  await page.goto("/house/you");
  await expect(page).toHaveTitle("You · Jonz");
  const house = page.getByTestId("you-screen");
  const ground = () => house.evaluate((el) => getComputedStyle(el).backgroundColor);
  const day = await ground();
  await house.getByRole("radio", { name: LOOK_LABEL.dark }).click();
  await expect(house.getByRole("radio", { name: LOOK_LABEL.dark })).toBeChecked();
  await expect.poll(ground).not.toBe(day);
  const night = await ground();
  await page.reload();
  await expect(house.getByRole("radio", { name: LOOK_LABEL.dark })).toBeChecked();
  expect(await ground()).toBe(night);
  await house.getByRole("radio", { name: LOOK_LABEL.system }).click();
  await expect.poll(ground).toBe(day);

  // Reminders, from their row on You: on, saved as Ava's, then off again.
  const db = admin();
  const rows = async () => (await db.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").eq("user_id", userId)).data;
  const remindersRow = house.getByTestId("to-reminders");
  await expect(remindersRow).toContainText(HOUSE_LOWER_COPY.off);
  await remindersRow.click();
  // The sheet is a modal, outside the page.
  const reminders = page.getByTestId("reminders-sheet");
  await reminders.getByTestId("enable-push").click();
  await expect(reminders.getByText(REMINDERS_COPY.turnedOn)).toBeVisible();
  expect(await rows()).toEqual([
    { user_id: userId, endpoint: "https://fcm.googleapis.com/fcm/send/e2e-device", p256dh: "e2e-p256dh", auth: "e2e-auth" },
  ]);
  await reminders.getByTestId("sheet-close").click();
  await expect(reminders).toBeHidden();
  await expect(remindersRow).toContainText(HOUSE_LOWER_COPY.on);
  await remindersRow.click();
  await reminders.getByRole("button", { name: REMINDERS_COPY.off }).click();
  await expect(reminders.getByTestId("enable-push")).toBeVisible();
  expect(await rows()).toEqual([]);

  await context.close();
});
