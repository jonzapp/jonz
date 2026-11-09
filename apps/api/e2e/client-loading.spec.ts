import { BIN_NIGHT, FOCUS_SHELL_COPY } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

// Waiting, on the real pages (docs/style/states.md, "Waiting"): while a
// page first reads it shows its own outline, busy for a screen reader; a
// read that fails says so with Try again; and Jonz starts on the J sign in
// the page's colour, never white. Each read is held back by the test, not
// by the clock, so nothing here depends on how fast the machine is.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** Holds every read matching `url` until `release` is called. */
async function hold(page: Page, url: string) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    await released;
    await route.continue();
  });
  return () => release();
}

test("Today shows its outline while the house reads, then the page", async ({ context, page }) => {
  const { userId } = await dealtHouseInClient(context, "Lou Loading", "Flat 30", [{ name: "Bins out", category: "bins" }]);
  made.push(userId);
  const release = await hold(page, "**/rest/v1/houses?**");

  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  const today = page.getByTestId("today-screen");
  const waiting = today.getByRole("progressbar", { name: FOCUS_SHELL_COPY.reading });
  await expect(waiting).toBeVisible();
  await expect(waiting).toHaveAttribute("aria-busy", "true");
  // The page's shape in outline, not an empty page with a spinner.
  await expect(waiting.getByTestId("hairline")).not.toHaveCount(0);
  await expect(today.getByTestId("next-up")).toHaveCount(0);

  release();
  await expect(today.getByTestId("next-up")).toBeVisible();
  await expect(waiting).toHaveCount(0);
});

test("a read that fails says so, and Try again reads again", async ({ context, page }) => {
  const { userId } = await dealtHouseInClient(context, "Kit Loading", "Flat 31", [{ name: "Bins out", category: "bins" }]);
  made.push(userId);
  let failing = true;
  // A server error, not a dropped connection: supabase-js tries a dropped
  // read again on its own (3 times, backing off), which this test isn't about.
  await page.route("**/rest/v1/houses?**", (route) =>
    failing
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "XX000", message: "down" }) })
      : route.continue(),
  );

  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByText(FOCUS_SHELL_COPY.unreadable)).toBeVisible();
  await expect(today.getByTestId("next-up")).toHaveCount(0);

  failing = false;
  await today.getByRole("button", { name: FOCUS_SHELL_COPY.retry }).click();
  await expect(today.getByTestId("next-up")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`Jonz starts on the J sign in ${scheme === "light" ? "Day" : "Night"}, never a white page`, async ({ context, page }) => {
    const { userId } = await dealtHouseInClient(context, `Ash Loading ${scheme}`, "Flat 32", [{ name: "Bins out" }]);
    made.push(userId);
    await page.emulateMedia({ colorScheme: scheme });
    // Your house, read at the start: held, so the start stays up.
    const release = await hold(page, "**/rest/v1/members?**");

    await page.goto("/");
    await expect(page.getByTestId("start-sign")).toBeVisible();
    const ground = BIN_NIGHT[scheme].background;
    const rgb = `rgb(${[1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16)).join(", ")})`;
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb);

    release();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByTestId("start-sign")).toHaveCount(0);
  });
}
