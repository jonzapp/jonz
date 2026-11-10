import { firstName, REACTION_LABEL, SECTION_LABEL, WALL_COPY, WALL_FEED_COPY, wordsFor } from "@app/core";
import { expect, test, type BrowserContext } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { photo } from "./photo";

const words = wordsFor("en", "housemates");

// The Wall in the Expo app's web build: ticks land on it live, a photo
// receipt shows, and a reaction sticks.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("ticks land on the Wall with their photos, and take reactions", async ({ browser }) => {
  const contexts: Record<string, BrowserContext> = { ava: await browser.newContext(), ben: await browser.newContext() };
  const names: Record<string, string> = { ava: "Ava Wall", ben: "Ben Wall" };
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    contexts.ava,
    names.ava,
    "Flat 30",
    [
      { name: "Clean the bath", category: "bathroom", needsPhoto: true },
      { name: "Wipe the hob", category: "kitchen" },
    ],
    [{ context: contexts.ben, name: names.ben }],
  );
  made.push(userId, ...housemateIds);
  const who = (id: string) => (id === userId ? "ava" : "ben");
  const { data: dealt } = await admin().from("assignments").select("name, user_id, needs_photo").eq("house_id", houseId);
  const bath = dealt!.find((a) => a.needs_photo)!;
  const hob = dealt!.find((a) => !a.needs_photo)!;
  // Two Johns of the same effort for two people: one each. Whoever has the
  // bath watches the Wall, so the hob is a housemate's tick, with its "Nice one".
  const hobber = who(hob.user_id);
  const watcher = who(bath.user_id);
  expect(watcher).not.toBe(hobber);
  const them = firstName(names[hobber]);

  // The watcher opens the whole Wall from House. So far it says who moved in.
  const wall = await contexts[watcher].newPage();
  await wall.goto("/today");
  await wall.getByRole("tab", { name: SECTION_LABEL.house }).click();
  await wall.getByTestId("house-screen").getByTestId("to-wall").getByRole("link").click();
  await expect(wall).toHaveURL(/\/house\/wall$/);
  await expect(wall.getByRole("heading", { name: WALL_COPY.title })).toBeVisible();
  // (House stays laid out under the pushed page, with its own latest rows: look on the Wall's.)
  const events = wall.getByTestId("wall-screen").getByTestId("wall-event");
  await expect(events.filter({ hasText: words("wall.feed.joined", { who: them }) })).toBeVisible();

  // The hob is the hobber's one John, so it's their Next up. Ticked, it lands
  // on the Wall without a reload.
  const hobPage = await contexts[hobber].newPage();
  await hobPage.goto("/today");
  const hobNext = hobPage.getByTestId("today-screen").getByTestId("next-up");
  await expect(hobNext.getByTestId("next-up-name")).toHaveText(hob.name);
  await hobNext.getByRole("button", { name: words('john.row.markDone'), exact: true }).click();
  const hobTick = events.filter({ hasText: WALL_FEED_COPY.ticked(them, hob.name) });
  await expect(hobTick).toBeVisible();

  // The watcher gives it a "Nice one"; it shows at once and stays after a reload.
  await hobTick.getByRole("button", { name: REACTION_LABEL.nice, exact: true }).click();
  const nice = hobTick.getByRole("button", { name: WALL_FEED_COPY.tally(REACTION_LABEL.nice, 1) });
  await expect(nice).toHaveText("1");
  // A browser hears that it's theirs: pressed, as the web's reactions say.
  await expect(hobTick.getByRole("button", { name: WALL_FEED_COPY.tally(REACTION_LABEL.nice, 1), pressed: true })).toBeVisible();
  await wall.reload();
  await expect(nice).toHaveText("1");
  await expect(hobTick.getByRole("button", { name: WALL_FEED_COPY.tally(REACTION_LABEL.nice, 1), pressed: true })).toBeVisible();

  // The bath needs a photo: the watcher's Next up asks for it. Once ticked, the Wall shows it.
  const bathPage = await contexts[watcher].newPage();
  await bathPage.goto("/today");
  const bathNext = bathPage.getByTestId("today-screen").getByTestId("next-up");
  await expect(bathNext.getByTestId("next-up-name")).toHaveText(bath.name);
  const chooser = bathPage.waitForEvent("filechooser");
  await bathNext.getByTestId("mark-done").click();
  await (await chooser).setFiles({ name: "receipt.png", mimeType: "image/png", buffer: photo() });
  const bathTick = events.filter({ hasText: WALL_FEED_COPY.ticked(WALL_FEED_COPY.you, bath.name) });
  await expect(bathTick).toBeVisible();
  await expect(wall.getByTestId("wall-screen").getByRole("img", { name: WALL_COPY.photoOf(bath.name) })).toBeVisible();
});
