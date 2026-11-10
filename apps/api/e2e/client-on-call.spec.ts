import { HISTORY_COPY, JOHN_COPY, ON_CALL_COPY, wordsFor } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// On-call Johns in the Expo app's web build: a Done it counts once, taking
// it back leaves nothing to do, and a flag comes down only at the hands of
// whoever raised it (or an admin), never whoever has it.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

async function flagsOf(houseId: string) {
  const { data } = await admin().from("assignments").select("id, done_at").eq("house_id", houseId).not("flagged_at", "is", null);
  return data!;
}

function onCall(page: Page) {
  return page.getByTestId("today-screen").getByTestId("on-call");
}

test("Done it counts once, and Undo takes the flag with it", async ({ context, page }) => {
  const { userId, houseId } = await dealtHouseInClient(context, "Gus OnCall", "Flat 14", [
    { name: "Clean the bath", category: "bathroom" },
    { name: "Dishwasher empty", category: "kitchen", onCall: true },
  ]);
  made.push(userId);

  await page.goto("/today");
  const section = onCall(page);
  await section.getByTestId("on-call-done").click();

  // Done, and no button to say it again.
  await expect(section.getByTestId("on-call-done-it")).toBeVisible();
  await expect(section.getByTestId("on-call-done")).toHaveCount(0);
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(HISTORY_COPY.doneIt);
  expect(await flagsOf(houseId)).toHaveLength(1);

  // The toast's Undo: the flag goes too, so nothing is left to do.
  await toast.getByRole("button", { name: HISTORY_COPY.undo }).click();
  await expect(section.getByTestId("on-call-done")).toBeVisible();
  await expect(section.getByTestId("on-call-flagged")).toHaveCount(0);
  await expect.poll(() => flagsOf(houseId)).toEqual([]);

  // From the John's sheet, the same.
  await section.getByTestId("on-call-done").click();
  await section.getByTestId("on-call-done-it").click();
  await page.getByTestId("john-sheet-body").getByRole("button", { name: JOHN_COPY.undo, exact: true }).click();
  await expect(section.getByTestId("on-call-done")).toBeVisible();
  await expect(section.getByTestId("on-call-flagged")).toHaveCount(0);
  await expect.poll(() => flagsOf(houseId)).toEqual([]);
});

test("whoever raised a flag can take it down; whoever has it can't", async ({ browser, context, page }) => {
  const samContext = await browser.newContext({ baseURL: CLIENT_URL, viewport: page.viewportSize() ?? undefined });
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    context,
    "Hal OnCall",
    "Flat 15",
    [
      { name: "Clean the bath", category: "bathroom" },
      { name: "Dishwasher empty", category: "kitchen", onCall: true },
    ],
    [{ context: samContext, name: "Sam OnCall" }],
  );
  made.push(userId, ...housemateIds);
  const [samId] = housemateIds;
  const db = admin();
  // Hal on call and not an admin, so only Sam (or an admin) can take Sam's flag down.
  const { data: week } = await db.from("weeks").select("id").eq("house_id", houseId).single();
  await db.from("on_call_picks").update({ user_id: userId }).eq("week_id", week!.id);
  await db.from("members").update({ role: "admin" }).eq("house_id", houseId).eq("user_id", samId);
  await db.from("members").update({ role: "member" }).eq("house_id", houseId).eq("user_id", userId);

  // Sam says it needs doing.
  const sam = await samContext.newPage();
  await sam.goto("/today");
  await onCall(sam).getByTestId("on-call-flag").click();
  await expect(onCall(sam).getByTestId("on-call-flagged")).toBeVisible();

  // Hal has it, and is told who can take it down.
  await page.goto("/today");
  await onCall(page).getByTestId("on-call-flagged").click();
  const halSheet = page.getByTestId("john-sheet-body");
  await expect(halSheet.getByTestId("flag-who-can-remove")).toContainText(words("today.onCall.onlyRaiser", { name: "Sam" }));
  await expect(halSheet.getByTestId("remove-flag")).toHaveCount(0);

  // Sam takes it down.
  await onCall(sam).getByTestId("on-call-flagged").click();
  await sam.getByTestId("john-sheet-body").getByTestId("remove-flag").click();
  await expect(sam.getByTestId("toast")).toContainText(ON_CALL_COPY.removed);
  await expect(onCall(sam).getByTestId("on-call-flag")).toBeVisible();
  await expect.poll(() => flagsOf(houseId)).toEqual([]);
  await samContext.close();
});
