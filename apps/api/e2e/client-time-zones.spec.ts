import { expect, test } from "@playwright/test";
import { dateIn, wordsFor } from "@app/core";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// Time zones (docs/specs/time-zones.md) in the Expo app's web build: the
// house is in London and this browser is in Regina, so every time reads on
// Regina's clock with nothing saying so; where a time is set (a John's due
// time), one note says it's the house's. An admin picks the house's zone
// from a list searched by country.
test.use({ baseURL: CLIENT_URL, timezoneId: "America/Regina" });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("read times on your own clock, set them in house time, and pick the house's zone by country", async ({ context, page }) => {
  const { userId, weekId } = await dealtHouseInClient(context, "Gwen Away", "Flat 14", [{ name: "Bins out", preset: "bins", dueTime: "21:00" }]);
  made.push(userId);
  const { data: bins } = await admin().from("assignments").select("due_at").eq("week_id", weekId).eq("name", "Bins out").single();
  const due = new Date(bins!.due_at!);

  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("next-up-name")).toHaveText("Bins out");
  // Due 21:00 in London, said on this browser's Regina clock, and nothing says so.
  await expect(today.getByTestId("next-up")).toContainText(dateIn(due, "time", "America/Regina", words));
  await expect(today.getByTestId("next-up")).not.toContainText("21:00");
  await expect(today.getByTestId("house-time-note")).toHaveCount(0);

  // Setting a John's time is in house time, and the editor says so.
  await page.goto("/house/johns");
  await page.getByTestId("johns-screen").getByTestId("add-john").click();
  await expect(page.getByTestId("john-form").getByTestId("house-time-note")).toHaveText(/^In house time: London, \d+ hours ahead of you\.$/);

  // House rules: the zone is a place, picked from a list a search narrows.
  await page.goto("/house/rules");
  await page.getByTestId("edit-rules").first().click();
  const field = page.getByTestId("rules-timezone").first();
  await expect(field).toContainText("London, United Kingdom");
  await field.click();
  const picker = page.getByTestId("zone-picker");
  await expect(picker.getByTestId("zone-suggested")).toContainText("Regina, Canada");
  await picker.getByTestId("zone-search-input").fill("canada");
  await expect(picker.getByTestId("zone-list")).toContainText("Toronto, Canada");
  await expect(picker.getByTestId("zone-list")).not.toContainText("London");
  await picker.getByTestId("zone-America/Regina").click();
  await expect(field).toContainText("Regina, Canada");
  await page.getByTestId("save-rules").first().click();
  await expect(page.getByTestId("rules-house").first()).toBeHidden();

  // Now the house keeps Regina's clock too: setting a time needs no note.
  await page.goto("/house/johns");
  await page.getByTestId("johns-screen").getByTestId("add-john").click();
  await expect(page.getByTestId("john-form").getByTestId("timing-time")).toBeVisible();
  await expect(page.getByTestId("john-form").getByTestId("house-time-note")).toHaveCount(0);
});
