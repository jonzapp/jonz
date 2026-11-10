import { PAGE_TITLE } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { photo } from "./photo";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// Today in the Expo app's web build: your next John in the Next up card and
// the rest of your week as rows, ticked, taken back, and ticked with a photo
// receipt from the file chooser.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("tick a John, take it back, and tick one with a photo", async ({ context, page }) => {
  const { userId, houseId } = await dealtHouseInClient(context, "Fay Client", "Flat 12", [
    // Due an hour before the bath, so the bins are Next up.
    { name: "Bins out", category: "bins", dueTime: "20:00" },
    { name: "Clean the bath", category: "bathroom", needsPhoto: true },
  ]);
  made.push(userId);

  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: PAGE_TITLE.today })).toBeVisible();
  // (Tabs keep the other screens laid out underneath: look on Today's.)
  const today = page.getByTestId("today-screen");
  const nextUp = today.getByTestId("next-up");
  const rest = today.getByTestId("rest-of-week").getByTestId("my-john");
  const row = (name: string) => rest.filter({ hasText: name });
  await expect(nextUp.getByTestId("next-up-name")).toHaveText("Bins out");
  await expect(rest).toHaveCount(1);
  await expect(row("Clean the bath")).toBeVisible();

  // A tick: it counts at once, while the house can still check it. The bins
  // join the rest of the week and the bath is next.
  await nextUp.getByRole("button", { name: words('john.row.markDone'), exact: true }).click();
  const bins = row("Bins out");
  await expect(bins.getByRole("img", { name: words('today.nextUp.stateLabel.checking') })).toBeVisible();
  await expect(nextUp.getByTestId("next-up-name")).toHaveText("Clean the bath");
  // A photo John wants the photo first: no plain Mark done.
  await expect(nextUp.getByRole("button", { name: words('today.nextUp.takePhoto') })).toBeVisible();
  await expect(nextUp.getByRole("button", { name: words('john.row.markDone'), exact: true })).toHaveCount(0);

  // Taken back while it's being checked: the bins are Next up again.
  await bins.getByRole("button", { name: words('today.nextUp.undo', { john: "Bins out" }) }).click();
  await expect(nextUp.getByTestId("next-up-name")).toHaveText("Bins out");
  await expect(rest).toHaveCount(1);

  // The bath from its row: its tick box asks for the photo, from the browser's file chooser here.
  const bath = row("Clean the bath");
  await expect(bath.getByRole("checkbox", { name: words('today.nextUp.tick', { john: "Clean the bath" }) })).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await bath.getByRole("checkbox", { name: words('today.nextUp.tickWithPhoto', { john: "Clean the bath" }) }).click();
  await (await chooser).setFiles({ name: "bath.png", mimeType: "image/png", buffer: photo() });
  await expect(bath.getByRole("img", { name: words('today.nextUp.stateLabel.checking') })).toBeVisible();
  await expect(nextUp.getByTestId("next-up-name")).toHaveText("Bins out");

  // The receipt is in the private bucket, under the house and the John.
  const { data: ticked } = await admin()
    .from("assignments")
    .select("id, photo_path")
    .eq("house_id", houseId)
    .eq("name", "Clean the bath")
    .single();
  expect(ticked!.photo_path).toMatch(new RegExp(`^${houseId}/${ticked!.id}/[0-9a-f-]+\\.jpg$`));
  const { data: files } = await admin().storage.from("proofs").list(`${houseId}/${ticked!.id}`);
  expect(files).toHaveLength(1);
});
