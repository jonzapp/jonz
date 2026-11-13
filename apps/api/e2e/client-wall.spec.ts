import { firstName, REACTION_LABEL, wordsFor } from "@app/core";
import { expect, test, type BrowserContext } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { photo } from "./photo";

const words = wordsFor("en", "housemates");

// The Wall in the Expo app's web build: ticks land on it live, a photo
// receipt shows, and a reaction given in the John sheet sticks.
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
  await wall.getByRole("tab", { name: words('common.section.house') }).click();
  await wall.getByTestId("house-screen").getByTestId("to-wall").getByRole("link").click();
  await expect(wall).toHaveURL(/\/house\/wall$/);
  await expect(wall.getByRole("heading", { name: words('wall.page.title'), level: 1 })).toBeVisible();
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
  const hobTick = events.filter({ hasText: words('wall.feed.ticked', { who: them, john: hob.name }) });
  await expect(hobTick).toBeVisible();

  // The row holds nothing to press but itself: tapping it opens this week's
  // John, where the watcher gives it a "Nice one". It shows at once, chosen,
  // and is counted on the row's meta line, and stays after a reload.
  await expect(hobTick.getByRole("button")).toHaveCount(1);
  await hobTick.getByRole("button").click();
  const reactions = wall.getByTestId("john-reactions");
  await reactions.getByTestId("react-nice").click();
  await expect(reactions.getByRole("button", { name: words("wall.feed.reactionCount", { label: REACTION_LABEL.nice, count: 1 }), pressed: true })).toBeVisible();
  await wall.keyboard.press("Escape");
  await expect(hobTick.getByTestId("count-nice")).toHaveText("1");
  await wall.reload();
  await expect(hobTick.getByTestId("count-nice")).toHaveText("1");
  await expect(hobTick.getByRole("button", { name: new RegExp(words("wall.feed.tally", { label: REACTION_LABEL.nice, count: 1 })) })).toBeVisible();

  // The bath needs a photo: the watcher's Next up asks for it. Once ticked, the Wall shows it.
  const bathPage = await contexts[watcher].newPage();
  await bathPage.goto("/today");
  const bathNext = bathPage.getByTestId("today-screen").getByTestId("next-up");
  await expect(bathNext.getByTestId("next-up-name")).toHaveText(bath.name);
  const chooser = bathPage.waitForEvent("filechooser");
  await bathNext.getByTestId("mark-done").click();
  await (await chooser).setFiles({ name: "receipt.png", mimeType: "image/png", buffer: photo() });
  const bathTick = events.filter({ hasText: words('wall.feed.ticked', { who: words('wall.feed.you'), john: bath.name }) });
  await expect(bathTick).toBeVisible();
  await expect(wall.getByTestId("wall-screen").getByRole("img", { name: words('wall.page.photoOf', { john: bath.name }) })).toBeVisible();
});

test("an admin undoes a housemate's tick from the John sheet its Wall post opens", async ({ browser }) => {
  const contexts: Record<string, BrowserContext> = { ava: await browser.newContext(), ben: await browser.newContext() };
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    contexts.ava,
    "Ava Undo",
    "Flat 31",
    [{ name: "Clean the sink", category: "kitchen" }, { name: "Dust the shelves", category: "other" }],
    [{ context: contexts.ben, name: "Ben Undo" }],
  );
  made.push(userId, ...housemateIds);
  const { data: dealt } = await admin().from("assignments").select("id, name, user_id").eq("house_id", houseId);
  const bens = dealt!.find((a) => a.user_id === housemateIds[0])!;

  // Ben ticks his John.
  const benPage = await contexts.ben.newPage();
  await benPage.goto("/today");
  await benPage.getByTestId("today-screen").getByTestId("next-up").getByRole("button", { name: words("john.row.markDone"), exact: true }).click();
  await expect.poll(async () => (await admin().from("assignments").select("done_at").eq("id", bens.id).single()).data?.done_at).not.toBeNull();

  // Ava, who made the house and so is its admin, opens his post on the Wall: the John sheet, with Undo.
  const wall = await contexts.ava.newPage();
  await wall.goto("/house/wall");
  const post = wall.getByTestId("wall-screen").getByTestId("wall-event").filter({ hasText: words("wall.feed.ticked", { who: "Ben", john: bens.name }) });
  await post.getByRole("button", { name: new RegExp(`^Ben ticked ${bens.name}`) }).click();
  const undo = wall.getByTestId("john-undo").getByTestId("undo-move");
  await expect(undo).toHaveText(words("wall.history.undo"));
  await undo.click();
  await expect.poll(async () => (await admin().from("assignments").select("done_at").eq("id", bens.id).single()).data?.done_at).toBeNull();
  await expect(wall.getByTestId("john-undo")).toHaveCount(0);
});
