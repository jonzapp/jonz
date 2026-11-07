import { ASK_USAGE_COPY, FRONT_DOOR_COPY, type AskUsage } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, signInToClient } from "./auth";

// The week's Ask Jonz: the chat says nothing while there's plenty, warns
// over the box once under a quarter is left, and puts a notice in the box's
// place once it's all used. The usage page shows the house's and each
// person's use. The figures are written in over the real read, since how
// much Claude uses isn't something a test can spend.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

async function newHouse(page: Page) {
  await page.goto("/house/new");
  await page.getByLabel(FRONT_DOOR_COPY.name).fill(`Usage ${Date.now() % 10_000}`);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
}

/** Answer the usage read with these figures, the rest as the real one gave them. */
async function usageIs(page: Page, over: Partial<AskUsage>) {
  await page.unroute("**/api/ask/usage");
  await page.route("**/api/ask/usage", async (route) => {
    const real = (await (await route.fetch()).json()) as AskUsage;
    await route.fulfill({ json: { ...real, ...over } });
  });
}

test("warn when Ask Jonz is low, give way to a notice once it's used, and show the week on its page", async ({ context, page }) => {
  made.push(await signInToClient(context, "Uma Usage"));
  await newHouse(page);

  // Plenty left: just the box.
  await page.goto("/house/describe");
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByTestId("chat-low")).toHaveCount(0);

  await usageIs(page, { left: 0.18, house: true });
  await page.reload();
  await expect(page.getByTestId("chat-low")).toContainText(/Only 18% of the house’s Ask Jonz left this week\. More on \w+ at \d\d:\d\d\./);
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await usageIs(page, { left: 0, house: true, pass: false });
  await page.reload();
  await expect(page.getByTestId("chat-out")).toContainText(ASK_USAGE_COPY.outHouse);
  await expect(page.getByTestId("chat-input")).toHaveCount(0);
  await expect(page.getByTestId("chat-out-pass")).toBeVisible();

  await page.getByTestId("chat-out-usage").click();
  await expect(page).toHaveURL(/\/house\/ask-usage$/);
  await expect(page.getByTestId("usage-house")).toContainText(ASK_USAGE_COPY.house);
  await expect(page.getByTestId("usage-week")).toContainText(/Resets \w+ at \d\d:\d\d/);
});
