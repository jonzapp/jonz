import { wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, undealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// A house's own kinds of John in the Expo app's web build: a new house has
// none, so its John sits in No kind; an admin adds kinds (one in a colour of
// their own), files the John under one, moves it up the list and deletes
// it, sending the John back to No kind, then puts it in No kind on purpose
// from the John form. The rules behind them are proved in
// tests/db/john-kinds.test.ts; this proves the app's screens reach them.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("add kinds, file a John under one, move it, delete it, and put the John in No kind on purpose", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-chrome", "One browser is enough for the screens; the rules are the database's.");
  const { userId, houseId } = await undealtHouseInClient(page.context(), "Ava Kinds", "Flat 71", ["Water the plants"]);
  made.push(userId);
  const db = admin();
  const kindId = async (name: string) => (await db.from("john_kinds").select("id").eq("house_id", houseId).eq("name", name).single()).data!.id;
  const plantsKind = async () => (await db.from("johns").select("john_kind_id").eq("house_id", houseId).eq("name", "Water the plants").single()).data!.john_kind_id;

  // A new house has no kinds: its John is in No kind, which says what it is.
  await page.goto("/house/johns");
  const kinds = page.getByTestId("johns-kinds");
  await expect(kinds.getByTestId("add-kind")).toBeVisible();
  await expect(kinds.getByTestId("kind-row")).toHaveCount(0);
  const none = page.getByTestId("kind-none");
  await expect(none.getByRole("heading", { name: words("house.kinds.none") })).toBeVisible();
  await expect(none.getByTestId("john-def")).toContainText("Water the plants");
  await expect(none).toContainText(words("house.kinds.noneNoteEdit"));

  // Two kinds: one in the next ready colour, one in a colour typed by its code.
  const form = page.getByTestId("kind-form");
  await kinds.getByTestId("add-kind").click();
  await form.getByTestId("kind-name").fill("Kitchen");
  await form.getByTestId("save-kind").click();
  await expect(form).toBeHidden();
  await kinds.getByTestId("add-kind").click();
  await form.getByTestId("kind-name").fill("Garden");
  await form.getByRole("radio", { name: words("house.kinds.anyColour") }).click();
  await form.getByTestId("colour-code").fill("#3a7d44");
  await expect(form.getByTestId("kind-preview")).toContainText("Garden");
  await form.getByTestId("save-kind").click();
  await expect(form).toBeHidden();
  // It goes last.
  await expect(kinds.getByTestId("kind-row").nth(1)).toContainText("Garden");
  const { data: garden } = await db.from("john_kinds").select("id, colour, position").eq("house_id", houseId).eq("name", "Garden").single();
  expect(garden).toMatchObject({ colour: "#3a7d44", position: 1 });

  // A John filed under it: its own section on the list, and No kind goes.
  await page.getByTestId("john-def").filter({ hasText: "Water the plants" }).click();
  const john = page.getByTestId("john-form");
  await john.getByTestId("john-kind").click();
  await john.getByRole("radio", { name: "Garden" }).click();
  await john.getByTestId("save-john").click();
  await expect(john).toBeHidden();
  const section = page.getByTestId(`kind-${garden!.id}`);
  await expect(section.getByRole("heading", { name: "Garden" })).toBeVisible();
  await expect(section.getByTestId("john-def")).toContainText("Water the plants");
  await expect(none).toHaveCount(0);
  await expect(kinds.getByRole("button", { name: `${words("house.kinds.edit", { name: "Garden" })}, 1 John` })).toBeVisible();

  // Moved up, at once.
  await kinds.getByRole("button", { name: /^Edit Garden, / }).click();
  await form.getByTestId("kind-up").click();
  await expect(form.getByTestId("kind-up")).toHaveCount(0);
  await expect(form.getByTestId("kind-down")).toContainText("Below Kitchen");
  await page.getByTestId("side-panel-close").click();
  await expect(kinds.getByTestId("kind-row").nth(0)).toContainText("Garden");

  // Deleted: its John goes to No kind.
  await kinds.getByRole("button", { name: /^Edit Garden, / }).click();
  await expect(form.getByTestId("kind-note")).toContainText(words("house.kinds.deleteNote", { n: 1 }));
  await form.getByTestId("delete-kind").click();
  await expect(form).toBeHidden();
  await expect(kinds.getByTestId("kind-row")).toHaveCount(1);
  await expect(none.getByTestId("john-def")).toContainText("Water the plants");
  expect(await plantsKind()).toBeNull();

  // Given a kind, it leaves No kind; put back in No kind on purpose, it goes back.
  await none.getByTestId("john-def").click();
  await john.getByTestId("john-kind").click();
  await john.getByRole("radio", { name: "Kitchen" }).click();
  await john.getByTestId("save-john").click();
  await expect(john).toBeHidden();
  const kitchen = await kindId("Kitchen");
  await expect(page.getByTestId(`kind-${kitchen}`).getByTestId("john-def")).toContainText("Water the plants");
  await expect(none).toHaveCount(0);
  expect(await plantsKind()).toBe(kitchen);
  await page.getByTestId("john-def").filter({ hasText: "Water the plants" }).click();
  await john.getByTestId("john-kind").click();
  await john.getByRole("radio", { name: words("house.kinds.none") }).click();
  await john.getByTestId("save-john").click();
  await expect(john).toBeHidden();
  await expect(none.getByTestId("john-def")).toContainText("Water the plants");
  await expect.poll(plantsKind).toBeNull();
});
