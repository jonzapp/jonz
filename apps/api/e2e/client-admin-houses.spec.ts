import { randomUUID } from "node:crypto";

import { OVERVIEW_COPY } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, houseOf, ownerInClient } from "./auth";

// The owner's Overview and Houses in the Expo app's web build
// (docs/specs/owner-admin.md): /admin opens on the Overview, with its
// figures and how things are right now; Houses finds a house by its name and
// shows its people and Pass, read only. What each reads, and who may, are
// checked by tests/db/owner-houses.test.ts.
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

test("opens on the Overview, then finds a house and shows it, read only", async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  const houseName = `Elm Street ${randomUUID().slice(0, 4)}`;
  const { ownerId: housemate } = await houseOf("Mia Elm", houseName);
  made.push(housemate);

  const page = await context.newPage();
  await page.goto("/admin");
  const overview = page.getByTestId("admin-overview");
  await expect(overview).toBeVisible();
  await expect(overview.getByTestId("overview-figures")).toBeVisible();
  await expect(overview.getByTestId("health-database")).toBeVisible();
  await expect(overview.getByTestId("overview-chart")).toBeVisible();
  // The section's heading, not its words: on a stack where nothing needs the
  // owner yet, the empty row ("Nothing needs you") holds the same words.
  await expect(overview.getByRole("heading", { name: OVERVIEW_COPY.needsYou, exact: true })).toBeVisible();
  await shoot(page, "overview");

  await page.goto("/admin/houses");
  const houses = page.getByTestId("admin-houses");
  await expect(houses).toBeVisible();
  await houses.getByTestId("houses-search-input").fill(houseName);
  const { data: house } = await admin().from("houses").select("id").eq("name", houseName).single();
  const row = houses.getByTestId(`house-${house!.id}`);
  await expect(row).toContainText(houseName);
  await expect(row).toContainText(/Trial/);

  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  if (!wide) {
    await row.click();
    await expect(page.getByTestId("admin-house")).toBeVisible();
  }
  const panel = page.getByTestId("house-panel");
  await expect(panel).toContainText(houseName);
  await expect(panel.getByTestId(`house-person-${housemate}`)).toContainText("Mia Elm");
  await expect(panel.getByTestId("house-pass")).toContainText("The free month");
  await shoot(page, "houses");
  if (wide) {
    // On a big screen the list still runs to the panel, a section gap short of its hairline.
    await page.setViewportSize({ width: 1920, height: 1080 });
    const main = await houses.getByTestId("column-main").boundingBox();
    const side = await houses.getByTestId("column-side").boundingBox();
    expect(Math.abs((side?.x ?? 0) - ((main?.x ?? 0) + (main?.width ?? 0)) - 32)).toBeLessThan(2);
  }
  await context.close();
});
