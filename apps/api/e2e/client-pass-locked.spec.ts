import { wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { fromNow } from "../tests/support/clock";

const words = wordsFor("en", "housemates");

// A house whose free month has ended and that hasn't bought the Pass, in the
// Expo app's web build: a photo John ticks plainly, nothing offers a photo,
// lateness costs nothing (no Stake).
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("without the House Pass, a photo John ticks plainly", async ({ browser }) => {
  const context = await browser.newContext();
  const { userId, houseId } = await dealtHouseInClient(context, "Ava Locked", "Flat 41", [
    { name: "Clean the oven", category: "kitchen", needsPhoto: true },
  ]);
  made.push(userId);
  // Ended a day before the database's own now, so this holds whatever the date.
  const { error } = await admin()
    .from("houses")
    .update({ pass_plan: "trial", pass_ends_at: fromNow(-86_400_000).toISOString() })
    .eq("id", houseId);
  expect(error).toBeNull();

  const page = await context.newPage();
  await page.goto("/today");
  const next = page.getByTestId("today-screen").getByTestId("next-up");
  await expect(next.getByTestId("next-up-name")).toHaveText("Clean the oven");
  await expect(next.getByTestId("mark-done")).toHaveText(words("john.row.markDone"));
  await expect(next).not.toContainText(/if late/);
  await expect(next.getByTestId("done-with-photo")).toHaveCount(0);
  await expect(next.getByTestId("choose-photo")).toHaveCount(0);
  await next.getByTestId("mark-done").click();
  await expect.poll(async () => (await admin().from("assignments").select("done_at").eq("house_id", houseId).single()).data?.done_at).not.toBeNull();
});
