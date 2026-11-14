import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, ownerInClient } from "./auth";

// The owner's four tabs (docs/specs/owner-admin.md, "Four tabs by job"):
// Overview with the Audit log, Inbox with Deletions, Houses, and Send. On a
// phone a tab's other pages are a switch at the top; on a laptop the open
// tab unfolds its pages in the side list.
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

test("four tabs, each with its pages inside", async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  const page = await context.newPage();
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;

  await page.goto("/admin/overview");
  await expect(page.getByTestId("admin-overview")).toBeVisible();
  if (wide) {
    for (const key of ["overview", "inbox", "houses", "send"]) await expect(page.getByTestId(`admin-group-${key}`)).toBeVisible();
    await expect(page.getByTestId("admin-group-records")).toHaveCount(0);
    await expect(page.getByTestId("admin-nav-audit")).toBeVisible();
    await expect(page.getByTestId("admin-nav-deletions")).toHaveCount(0);
  } else {
    for (const key of ["overview", "inbox", "houses", "send"]) await expect(page.getByTestId(`admin-tab-${key}`)).toBeVisible();
    await expect(page.getByTestId("admin-tab-records")).toHaveCount(0);
    await expect(page.getByTestId("admin-switch").getByText("Audit log")).toBeVisible();
  }
  await shoot(page, "tabs-overview");

  // Deletions lives in the Inbox now.
  if (wide) await page.getByTestId("admin-group-inbox").click();
  else await page.getByTestId("admin-tab-inbox").click();
  await expect(page.getByTestId("admin-inbox")).toBeVisible();
  if (wide) await page.getByTestId("admin-nav-deletions").click();
  else await page.getByTestId("admin-switch").getByText("Deletions").click();
  await expect(page).toHaveURL(/\/admin\/deletions/);
  await shoot(page, "tabs-deletions");

  await page.goto("/admin/messages");
  if (wide) await expect(page.getByTestId("admin-nav-notices")).toBeVisible();
  else await expect(page.getByTestId("admin-switch").getByText("Notices")).toBeVisible();
  await shoot(page, "tabs-send");
  await context.close();
});
