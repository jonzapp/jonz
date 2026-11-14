import { expect, test, type Locator, type Page } from "@playwright/test";

import { tickHouse } from "../lib/engine/tick";
import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { fromNow, rightNow } from "../tests/support/clock";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// The board in the Expo app's web build: two housemates, one ticks, the
// other opens it from the board and disputes it in its John sheet. In a
// house of two the one voter can't strike it alone at once: it's decided
// when the vote closes (docs/specs/fair-checks.md). A phone shows a group per person; a
// laptop shows the house as a table. Either way a John is a `week-row`.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** Where a John shows on the board: its row in its owner's group on a phone, in the table on a laptop. */
function onBoard(page: Page, john: string): Locator {
  return page.getByTestId("week-screen").getByTestId("week-row").filter({ hasText: john }).filter({ visible: true });
}

test("dispute a housemate's tick from the board, and the house of two decides when the vote closes", async ({ browser }) => {
  const avaContext = await browser.newContext();
  const benContext = await browser.newContext();
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    avaContext,
    "Ava Board",
    "Flat 21",
    [
      { name: "Bins out", preset: "bins" },
      { name: "Wipe the hob", preset: "kitchen" },
    ],
    [{ context: benContext, name: "Ben Board" }],
  );
  made.push(userId, ...housemateIds);
  const { data: bens } = await admin().from("assignments").select("name").eq("house_id", houseId).eq("user_id", housemateIds[0]);
  expect(bens).toHaveLength(1);
  const benJohn = bens![0].name;

  // Ben ticks his, his one John: Next up on his Today.
  const ben = await benContext.newPage();
  await ben.goto("/today");
  const benToday = ben.getByTestId("today-screen");
  await expect(benToday.getByTestId("next-up-name")).toHaveText(benJohn);
  await benToday.getByTestId("next-up").getByRole("button", { name: words('john.row.markDone'), exact: true }).click();
  const mine = benToday.getByTestId("rest-of-week").getByTestId("my-john").filter({ hasText: benJohn });
  await expect(mine.getByRole("img", { name: words('today.nextUp.stateLabel.checking') })).toBeVisible();

  // Ava goes from Today to the board by its tab, and sees it being checked.
  const ava = await avaContext.newPage();
  await ava.goto("/today");
  await ava.getByRole("tab", { name: words('common.section.week') }).click();
  await expect(ava).toHaveURL(/\/week$/);
  await expect(ava.getByRole("heading", { name: words('common.title.week') })).toBeVisible();
  const theirs = onBoard(ava, benJohn);
  await expect(theirs.getByRole("img", { name: words('today.nextUp.stateLabel.checking') })).toBeVisible();
  await expect(theirs.getByTestId("status-checking")).toBeVisible();

  // The row opens its John sheet, where she disputes it. She's the only
  // voter, so it waits for the vote to close.
  await theirs.getByRole("button", { name: benJohn }).click();
  const sheet = ava.getByTestId("john-sheet");
  await expect(sheet.getByTestId("john-sheet-name")).toHaveText(benJohn);
  await sheet.getByRole("button", { name: words('john.dispute.open'), exact: true }).click();
  await sheet.getByLabel(words('john.dispute.label')).fill("Still greasy");
  await sheet.getByRole("button", { name: words('john.dispute.send') }).click();
  await expect(sheet.getByRole("button", { name: words('john.dispute.open'), exact: true })).toHaveCount(0);
  await expect(theirs.getByRole("img", { name: words('today.nextUp.stateLabel.disputed') })).toBeVisible();
  const { data: open } = await admin().from("disputes").select("id, resolution").eq("house_id", houseId);
  expect(open).toEqual([{ id: expect.any(String), resolution: null }]);

  // The vote closes with no photo from Ben: the tick is struck.
  await admin().from("disputes").update({ closes_at: fromNow(-1000).toISOString() }).eq("id", open![0].id);
  await tickHouse(admin(), houseId, rightNow());
  await ava.reload();
  await expect(onBoard(ava, benJohn).getByRole("img", { name: words('today.nextUp.stateLabel.open') })).toBeVisible();

  // Ben's Today follows: his John is open again.
  await ben.reload();
  await expect(benToday.getByTestId("next-up").getByRole("button", { name: words('john.row.markDone'), exact: true })).toBeVisible();
  await expect(benToday.getByTestId("next-up-name")).toHaveText(benJohn);
  const { data: struck } = await admin().from("disputes").select("resolution").eq("house_id", houseId);
  expect(struck).toEqual([{ resolution: "upheld" }]);
});
