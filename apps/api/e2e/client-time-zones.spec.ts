import { expect, test } from "@playwright/test";
import { wordsFor } from "@app/core";

import { CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// Time zones (docs/specs/time-zones.md) in the Expo app's web build: the
// house is in London and this browser is in Regina, so times read on
// Regina's clock with one line saying so, and house time is a tap away; an
// admin picks the house's zone from a list searched by country.
test.use({ baseURL: CLIENT_URL, timezoneId: "America/Regina" });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("read times on your own clock, and pick the house's zone by country", async ({ context, page }) => {
  const { userId } = await dealtHouseInClient(context, "Gwen Away", "Flat 14", [{ name: "Bins out", category: "bins", dueTime: "21:00" }]);
  made.push(userId);

  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("next-up-name")).toHaveText("Bins out");
  // Away from the house's clock: said once, under the date, with house time a tap away.
  const line = today.getByTestId("zone-line");
  await expect(line).toContainText("Your time, Regina.");
  await expect(line).toContainText(words("common.zone.showHouse"));
  await line.click();
  await expect(line).toContainText("House time, London.");
  await line.click();
  await expect(line).toContainText("Your time, Regina.");

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

  // Now the house keeps Regina's clock too: nothing to say on Today.
  await page.goto("/today");
  await expect(page.getByTestId("today-screen").getByTestId("next-up-name")).toHaveText("Bins out");
  await expect(page.getByTestId("today-screen").getByTestId("zone-line")).toHaveCount(0);
});
