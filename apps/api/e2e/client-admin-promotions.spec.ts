import { randomUUID } from "node:crypto";

import { PROMOTIONS_COPY } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, ownerInClient } from "./auth";

// The owner's Promotions in the Expo app's web build (docs/specs/promotions.md):
// the owner, signed in with their code, makes a free year for three named
// people, sees what they get before it's made, then opens its page with the
// link to copy and the three people. Who may make one, and the checks at
// checkout, are tests/db/promotions.test.ts and tests/unit.
//
// With SHOTS=<folder> it also takes the PR's pictures there, Day and Night.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
const codes: string[] = [];
test.afterAll(async () => {
  if (codes.length) await admin().from("promotions").delete().in("code", codes);
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

test("makes a free year for three people, then opens it with its link", async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  const code = `FRIENDS${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  codes.push(code);

  const page = await context.newPage();
  await page.goto("/admin/promotions");
  const form = page.getByTestId("promotion-form");
  await expect(form).toBeVisible();
  await shoot(page, "promotions-start");

  await form.getByTestId("promotion-name").fill("A free year for friends");
  await form.getByTestId("promotion-kind").getByText(PROMOTIONS_COPY.kind.gift).click();
  await form.getByTestId("promotion-months").fill("12");
  await form.getByTestId("promotion-audience").getByText(PROMOTIONS_COPY.audiences.named).click();
  await form.getByTestId("promotion-people-box").fill("sam.okafor@example.com\npriya.n@example.com, leo.marsh@example.com");
  await form.getByTestId("promotion-note").fill("Thanks for helping test Jonz.");
  await form.getByTestId("promotion-code").fill(code);

  // What they get, before it's made: beside the form on a laptop, a sheet on a phone.
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  if (!wide) await page.getByTestId("promotion-preview-open").click();
  const preview = page.getByTestId(wide ? "admin-promotions" : "promotion-preview-sheet").getByTestId("promotion-preview");
  await expect(preview.getByTestId("promotion-preview-title")).toHaveText("A free year of the House Pass");
  await expect(preview.getByTestId("promotion-preview-who")).toContainText("Only sam.okafor@example.com, priya.n@example.com and leo.marsh@example.com, once each.");
  await shoot(page, "promotions");
  if (!wide) {
    // The sheet's own close: Safari doesn't take Escape as a close.
    await page.getByTestId("promotion-preview-sheet").getByTestId("sheet-close").click();
    await expect(page.getByTestId("sheet-scrim")).toHaveCount(0);
  }

  await page.getByTestId("promotion-make").click();
  await expect(page.getByTestId("admin-promotion")).toBeVisible();
  await expect(page.getByTestId("promotion-state")).toHaveText(PROMOTIONS_COPY.stateChip.live);
  await expect(page.getByTestId("promotion-url")).toContainText(`jonz.app/offer/${code}`);
  await expect(page.getByTestId("promotion-people")).toContainText("priya.n@example.com");
  await expect(page.getByTestId("promotion-email")).toHaveText(PROMOTIONS_COPY.emailThem(3));
  await shoot(page, "promotion");

  // In the database as the form said: a year's free Pass, three people, no plans.
  const { data } = await admin().from("promotions").select("kind, months, plans, audience, state, note").eq("code", code).single();
  expect(data).toEqual({ kind: "gift", months: 12, plans: [], audience: "named", state: "live", note: "Thanks for helping test Jonz." });

  // And in All promotions, found by an email on it.
  await page.goto(`/admin/promotions/all?q=${encodeURIComponent("leo.marsh")}`);
  const all = page.getByTestId("admin-promotions-all");
  await expect(all.getByTestId(`promotion-${code}`)).toBeVisible();
  await shoot(page, "promotions-all");
  await context.close();
});
