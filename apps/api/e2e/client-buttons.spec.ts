import { expect, test } from "@playwright/test";

import { CLIENT_URL, cleanUp, dealtHouseInClient, undealtHouseInClient } from "./auth";
import { expectButtonRules } from "./button-rules";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// The button rules (docs/style/controls.md) on the real pages, on every
// phone and laptop the suite runs: a button on its own fills its column on a
// phone and keeps its own width in a wide column on a laptop; nothing sits
// alone at its own width that a ButtonRow didn't place; one amber button at
// most. The style page (client-style.spec.ts) checks the pieces; this checks
// the pages put them together right.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("Week before the first deal: Deal week 1 is across a phone, its own width on a laptop", async ({ browser }) => {
  const context = await browser.newContext();
  const { userId } = await undealtHouseInClient(context, "Ava Buttons", `Flat ${Date.now() % 10_000}`, ["Bins", "Bathroom"]);
  made.push(userId);
  const page = await context.newPage();
  await page.goto("/week");
  const week = page.getByTestId("week-screen");
  const deal = week.getByRole("button", { name: words('today.nextUp.dealWeek1') });
  await expect(deal).toBeVisible();

  // Measured against the empty page's column, not the button's own wrapper, which hugged it before.
  const button = (await deal.boundingBox())!.width;
  const row = await week.getByTestId("week-not-dealt").evaluate((element) => {
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  if ((page.viewportSize()?.width ?? 0) < 1024) expect(Math.abs(button - row), "Deal week 1 spans the column").toBeLessThanOrEqual(1);
  else expect(button, "Deal week 1 keeps its own width").toBeLessThan(row / 2);
  await expectButtonRules(page, "Week before the deal");

  await page.goto("/today");
  await expect(page.getByTestId("today-screen")).toBeVisible();
  await expect(page.getByTestId("today-screen").getByRole("button", { name: words('today.nextUp.dealWeek1') })).toBeVisible();
  await expectButtonRules(page, "Today's setup card");
  await context.close();
});

test("every page of a dealt house keeps the button rules", async ({ browser }) => {
  const context = await browser.newContext();
  const mate = await browser.newContext();
  const { userId, housemateIds } = await dealtHouseInClient(context, "Ben Buttons", `Flat ${Date.now() % 10_000}`, [{ name: "Bins" }, { name: "Bathroom" }], [
    { context: mate, name: "Cat Buttons" },
  ]);
  made.push(userId, ...housemateIds);
  const page = await context.newPage();

  for (const [path, screen] of [
    ["/today", "today-screen"],
    ["/week", "week-screen"],
    ["/house", "house-screen"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(screen)).toBeVisible();
    // Everything the page reads has arrived: no "Reading…" left.
    await expect(page.getByTestId(screen).getByRole("progressbar")).toHaveCount(0);
    await expectButtonRules(page, path);
  }
  // A John's sheet, from its row on Week: Mark done, Photo and the rest.
  await page.goto("/week");
  await page.getByTestId("week-screen").getByRole("button", { name: "Bins" }).first().click();
  await expect(page.getByTestId("john-sheet-name")).toHaveText("Bins");
  await expectButtonRules(page, "a John's sheet");
  // Each page once what it reads has arrived. Not "networkidle": the house's
  // live stream stays open for as long as the page does.
  for (const [path, screen] of [
    ["/house/johns", "johns-screen"],
    ["/house/rules", "rules-screen"],
    ["/house/away", "away-screen"],
    ["/house/wall", "wall-screen"],
    ["/house/you", "you-screen"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(screen)).toBeVisible();
    await expect(page.getByTestId(screen).getByRole("progressbar")).toHaveCount(0);
    await expectButtonRules(page, path);
  }
  await context.close();
  await mate.close();
});
