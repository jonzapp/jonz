import { GOOGLE_LIMITED_USE, HELP_PAGE, LEGAL_COPY, PRIVACY_POLICY, TERMS, wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// What the web app has beyond its screens, on the Expo app's web build: the
// pages anyone can open, the tab titles, the look, reminders, and the files a
// browser asks for to install it.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("privacy, the terms, help, and a link to nowhere, open for anyone", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: words('door.signIn.privacy') }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText(GOOGLE_LIMITED_USE)).toBeVisible();
  await expect(page).toHaveTitle("Privacy · Jonz");

  // Opened cold, as Google's, Microsoft's and the stores' reviewers will.
  await page.goto("/terms");
  await expect(page.getByText(TERMS.lead)).toBeVisible();
  await expect(page).toHaveTitle("Terms · Jonz");

  // Where the README and CONTRIBUTING send people with a problem or an idea.
  await page.goto("/help");
  await expect(page.getByText(HELP_PAGE.lead)).toBeVisible();
  await expect(page.getByRole("link", { name: HELP_PAGE.sections[1].links![0].label })).toHaveAttribute("href", "mailto:support@jonz.app");
  await expect(page).toHaveTitle("Help · Jonz");

  for (const path of ["/nowhere/at-all", "/_sitemap"]) {
    await page.goto(path);
    await expect(page.getByText(words('door.notFound.body'))).toBeVisible();
  }
  // Signed out there are no Johns to go back to, so it's the front door.
  await page.getByRole("link", { name: words('door.notFound.backToDoor') }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: words('door.signIn.privacy') })).toBeVisible();
});

test("a page to read lists its sections beside the words on a laptop, each jumping to its own", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop-chrome", "The laptop's layout");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/privacy");
  const contents = page.getByTestId("legal-contents");
  await expect(contents.getByRole("heading", { name: LEGAL_COPY.contents })).toBeVisible();
  await expect(contents.getByRole("button")).toHaveCount(PRIVACY_POLICY.sections.length);
  // The list beside the words, the two sharing a top edge.
  const start = await page.getByTestId("legal-pair-start").boundingBox();
  const end = await page.getByTestId("legal-pair-end").boundingBox();
  expect(start?.y ?? 0).toBeCloseTo(end?.y ?? 1, 0);
  expect(end?.x ?? 0).toBeGreaterThan((start?.x ?? 0) + (start?.width ?? 0));
  const shots = process.env.SHOTS;
  for (const colorScheme of shots ? (["light", "dark"] as const) : []) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `${shots}/privacy-laptop-${colorScheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  // The last heading is off the bottom until its row in the list jumps to it.
  const last = PRIVACY_POLICY.sections.at(-1)!.heading;
  const heading = page.getByTestId("legal-pair-end").getByRole("heading", { name: last, exact: true });
  await expect(heading).not.toBeInViewport();
  await contents.getByRole("button", { name: last, exact: true }).click();
  await expect(heading).toBeInViewport();
  await expect(page).toHaveURL(/\/privacy$/);

  for (const [path, sections] of [["/terms", TERMS.sections], ["/help", HELP_PAGE.sections]] as const) {
    await page.goto(path);
    await expect(page.getByTestId("legal-contents").getByRole("button")).toHaveCount(sections.length);
  }
  for (const colorScheme of shots ? (["light", "dark"] as const) : []) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `${shots}/help-laptop-${colorScheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });

  // A phone's width keeps the words alone.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(HELP_PAGE.lead)).toBeVisible();
  await expect(page.getByTestId("legal-contents")).toHaveCount(0);
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
  await page.getByRole("tab", { name: words('common.section.week') }).click();
  await expect(page).toHaveTitle("This week · Jonz");
  await page.getByRole("tab", { name: words('common.section.house') }).click();
  await expect(page).toHaveTitle("House · Jonz");

  // Night, chosen on You, stays chosen on this device.
  await page.goto("/house/you");
  await expect(page).toHaveTitle("You · Jonz");
  const house = page.getByTestId("you-screen");
  const ground = () => house.evaluate((el) => getComputedStyle(el).backgroundColor);
  const day = await ground();
  await house.getByRole("radio", { name: words('common.look.dark') }).click();
  await expect(house.getByRole("radio", { name: words('common.look.dark') })).toBeChecked();
  await expect.poll(ground).not.toBe(day);
  const night = await ground();
  await page.reload();
  await expect(house.getByRole("radio", { name: words('common.look.dark') })).toBeChecked();
  expect(await ground()).toBe(night);
  await house.getByRole("radio", { name: words('common.look.system') }).click();
  await expect.poll(ground).toBe(day);

  // Reminders, from their row on You: on, saved as Ava's, then off again.
  const db = admin();
  const rows = async () => (await db.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").eq("user_id", userId)).data;
  const remindersRow = house.getByTestId("to-reminders");
  await expect(remindersRow).toContainText(words('house.lower.off'));
  await remindersRow.click();
  // The sheet is a modal, outside the page.
  const reminders = page.getByTestId("reminders-sheet");
  await reminders.getByTestId("enable-push").click();
  await expect(reminders.getByText(words('house.reminders.turnedOn'))).toBeVisible();
  expect(await rows()).toEqual([
    { user_id: userId, endpoint: "https://fcm.googleapis.com/fcm/send/e2e-device", p256dh: "e2e-p256dh", auth: "e2e-auth" },
  ]);
  await reminders.getByTestId("sheet-close").click();
  await expect(reminders).toBeHidden();
  await expect(remindersRow).toContainText(words('house.lower.on'));
  await remindersRow.click();
  await reminders.getByRole("button", { name: words('house.reminders.off') }).click();
  await expect(reminders.getByTestId("enable-push")).toBeVisible();
  expect(await rows()).toEqual([]);

  await context.close();
});
