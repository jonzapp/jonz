import { randomUUID } from "node:crypto";

import { MESSAGE_COPY } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, houseOf, ownerInClient } from "./auth";

// The owner's Messages in the Expo app's web build (docs/specs/owner-admin.md,
// "Messages"): the owner, signed in with their code, sends themself a test,
// then sends a message to a house, which lands on the house's Wall as From
// Jonz and in the Sent list. Who may send, and each person reached once, are
// checked by tests/db/owner-messages.test.ts.
//
// With SHOTS=<folder> it also takes the PR's pictures there, Day and Night.
test.use({ baseURL: CLIENT_URL });

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

test("sends the owner a test, then a message to a house that lands on its Wall", async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  const houseName = `Elm Street ${randomUUID().slice(0, 4)}`;
  const { ownerId: housemate } = await houseOf("Mia Elm", houseName);
  made.push(housemate);
  const subject = `About last week’s reset ${randomUUID().slice(0, 4)}`;

  const page = await context.newPage();
  await page.goto("/admin/messages");
  const form = page.getByTestId("message-form");
  await expect(form).toBeVisible();
  // On a laptop, who it's to and what it says beside how it goes out, the two sharing a top edge.
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(form.getByTestId("message-form-start").getByTestId("message-subject")).toBeVisible();
    await expect(form.getByTestId("message-form-end").getByTestId("message-way-push")).toBeVisible();
    const start = await form.getByTestId("message-form-start").boundingBox();
    const end = await form.getByTestId("message-form-end").boundingBox();
    expect(start?.y ?? 0).toBeCloseTo(end?.y ?? 1, 0);
  }

  // Pick the house by its name.
  await form.getByTestId("message-find").fill(houseName.slice(0, 14));
  await form.getByText(houseName).click();
  await expect(form.getByTestId("message-picked")).toContainText(houseName);
  await expect(page.getByTestId("message-send")).toHaveText(/Send to 1 person/);

  await form.getByTestId("message-subject").fill(subject);
  await form.getByTestId("message-body").fill("Hi Elm Street, a bug in Monday’s reset took points it shouldn’t have. We’ve put them back. Sorry about that. Glyn");
  await shoot(page, "messages");

  // A test first: only the owner, never a Wall.
  await page.getByTestId("message-test").click();
  await expect(page.getByText(MESSAGE_COPY.testToast)).toBeVisible();
  const db = admin();
  const { data: test } = await db.from("owner_messages").select("audience, people, by_wall").eq("subject", subject).single();
  expect(test).toEqual({ audience: "test", people: 1, by_wall: false });

  // Then the house.
  await page.getByTestId("message-send").click();
  await expect(page.getByText(MESSAGE_COPY.sentToast(1))).toBeVisible();
  const { data: wall } = await db.from("events").select("kind, data").eq("kind", "jonz_message").contains("data", { subject });
  expect(wall).toHaveLength(1);

  // Both are in Sent, newest first.
  const recent = page.getByTestId("message-recent");
  await expect(recent.getByText(subject)).toHaveCount(2);
  await shoot(page, "messages-sent");

  await page.getByTestId("message-all-sent").click();
  await expect(page.getByTestId("admin-sent")).toBeVisible();
  await expect(page.getByTestId("admin-sent").getByText(subject).first()).toBeVisible();
  await shoot(page, "messages-all-sent");
  await context.close();
});
