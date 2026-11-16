import { wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// The command box on a laptop: Ctrl K, or the rail's Search, opens it over
// the page; typing finds the house's Johns, its people and its pages; the
// arrows and Enter open one, and Esc puts it away.
// SHOTS=<folder> also saves it open, in daylight and after dark.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("Ctrl K finds a John, a housemate or a page, and opens the one picked", async ({ browser }, info) => {
  test.skip(info.project.name !== "laptop-chrome", "The laptop's keys");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mate = await browser.newContext();
  const { userId, housemateIds } = await dealtHouseInClient(
    context,
    "Cora Command",
    "Cora's house",
    [{ name: "Bins out" }, { name: "Wipe the hob" }],
    [{ context: mate, name: "Bea Binley" }],
  );
  made.push(userId, ...housemateIds);
  const page = await context.newPage();
  await page.goto("/today");
  await expect(page.getByTestId("today-screen")).toBeVisible();

  // Nothing typed: every page, the first tinted, the search taking the keys.
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByTestId("command-box");
  await expect(box).toBeVisible();
  const input = box.getByTestId("command-input");
  await expect(input).toBeFocused();
  await expect(box.getByRole("option", { name: words("common.title.today") })).toHaveAttribute("aria-selected", "true");
  await expect(box.getByRole("option")).toHaveCount(12);
  await shoot(page, "command-pages");

  // "bin" finds the John, then the housemate, and no page.
  await input.fill("bin");
  await expect(box.getByRole("option")).toHaveCount(2);
  await expect(box.getByRole("option").first()).toHaveAccessibleName(`Bins out, ${words("house.kinds.none")}`);
  await shoot(page, "command-found");
  // ↓ then Enter opens the housemate's own page.
  await input.press("ArrowDown");
  await expect(box.getByRole("option", { name: "Bea Binley" })).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(box).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/house/people/${housemateIds[0]}$`));
  await expect(page.getByTestId("person-screen")).toBeVisible();

  // The rail's Search opens it too, and a John of this week opens its sheet.
  await page.getByTestId("rail-search").click();
  await expect(box.getByTestId("command-input")).toBeFocused();
  await box.getByTestId("command-input").fill("wipe");
  await box.getByTestId("command-input").press("Enter");
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId("john-sheet-name")).toHaveText("Wipe the hob");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("john-sheet-name")).toHaveCount(0);

  // A page by its name; Esc, a click beside it and Ctrl K again each put it away.
  await page.keyboard.press("ControlOrMeta+k");
  await box.getByTestId("command-input").fill("rules");
  await box.getByTestId("command-input").press("Enter");
  await expect(page).toHaveURL(/\/house\/rules$/);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("command-scrim").click({ position: { x: 8, y: 8 } });
  await expect(box).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box).toHaveCount(0);

  // Typed again, it starts from nothing; and says so when nothing matches.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box.getByTestId("command-input")).toHaveValue("");
  await box.getByTestId("command-input").fill("zebra");
  await expect(box.getByText(words("common.command.none", { query: "zebra" }))).toBeVisible();
  await context.close();
  await mate.close();
});

async function shoot(page: import("@playwright/test").Page, name: string) {
  const folder = process.env.SHOTS;
  if (!folder) return;
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `${folder}/${name}-${colorScheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}
