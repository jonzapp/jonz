import { wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, undealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// A house's own kinds of John in the Expo app's web build: an admin adds a
// kind in a colour of their own, files a John under it, moves it up the
// list and deletes it, leaving the John with no kind until it's given one.
// The rules behind them are proved in tests/db/john-kinds.test.ts; this
// proves the app's screens reach them.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("add a kind in any colour, file a John under it, move it and delete it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-chrome", "One browser is enough for the screens; the rules are the database's.");
  const { userId, houseId } = await undealtHouseInClient(page.context(), "Ava Kinds", "Flat 71", ["Water the plants"]);
  made.push(userId);
  const db = admin();

  await page.goto("/house/johns");
  const kinds = page.getByTestId("johns-kinds");
  await expect(kinds.getByTestId("kind-row")).toHaveCount(6);

  // A new kind, in a colour typed by its code.
  await kinds.getByTestId("add-kind").click();
  const form = page.getByTestId("kind-form");
  await form.getByTestId("kind-name").fill("Garden");
  await form.getByRole("radio", { name: words("house.kinds.anyColour") }).click();
  await form.getByTestId("colour-code").fill("#3a7d44");
  await expect(form.getByTestId("kind-preview")).toContainText("Garden");
  await form.getByTestId("save-kind").click();
  await expect(form).toBeHidden();
  // It goes before Everything else.
  await expect(kinds.getByTestId("kind-row").nth(5)).toContainText("Garden");
  const { data: garden } = await db.from("john_kinds").select("id, colour, position").eq("house_id", houseId).eq("name", "Garden").single();
  expect(garden).toMatchObject({ colour: "#3a7d44", position: 5 });

  // A John filed under it: its own section on the list.
  await page.getByTestId("john-def").filter({ hasText: "Water the plants" }).click();
  const john = page.getByTestId("john-form");
  await john.getByTestId("john-kind").click();
  await john.getByRole("radio", { name: "Garden" }).click();
  await john.getByTestId("save-john").click();
  await expect(john).toBeHidden();
  const section = page.getByTestId(`kind-${garden!.id}`);
  await expect(section.getByRole("heading", { name: "Garden" })).toBeVisible();
  await expect(section.getByTestId("john-def")).toContainText("Water the plants");
  await expect(kinds.getByRole("button", { name: `${words("house.kinds.edit", { name: "Garden" })}, 1 John` })).toBeVisible();

  // Moved up, at once.
  await kinds.getByRole("button", { name: /^Edit Garden, / }).click();
  await form.getByTestId("kind-up").click();
  await expect(form.getByTestId("kind-up")).toContainText("Above Floors & hoovering");
  await page.getByTestId("side-panel-close").click();
  await expect(kinds.getByTestId("kind-row").nth(4)).toContainText("Garden");

  // Deleted: its John has no kind, at the foot of the list, until it's given one.
  await kinds.getByRole("button", { name: /^Edit Garden, / }).click();
  await expect(form.getByTestId("kind-note")).toContainText(words("house.kinds.deleteNote", { n: 1 }));
  await form.getByTestId("delete-kind").click();
  await expect(form).toBeHidden();
  await expect(kinds.getByTestId("kind-row")).toHaveCount(6);
  const none = page.getByTestId("kind-none");
  await expect(none.getByRole("heading", { name: words("house.kinds.none") })).toBeVisible();
  await expect(none.getByTestId("john-def")).toContainText("Water the plants");
  const { data: plants } = await db.from("johns").select("john_kind_id").eq("house_id", houseId).eq("name", "Water the plants").single();
  expect(plants).toEqual({ john_kind_id: null });

  // Given a kind again, it leaves No kind.
  await none.getByTestId("john-def").click();
  await john.getByTestId("john-kind").click();
  await john.getByRole("radio", { name: "Kitchen" }).click();
  await john.getByTestId("save-john").click();
  await expect(john).toBeHidden();
  await expect(page.getByTestId("kind-kitchen").getByTestId("john-def")).toContainText("Water the plants");
  await expect(none).toHaveCount(0);
});
