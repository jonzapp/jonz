import { formatMoney, HOUSE_PAGE_COPY, monthOf, SECTION_LABEL, STAKE_HISTORY_COPY } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { backToHouse } from "./house-pages";

// The Stake in the Expo app's web build: what a closed month left owing, on
// House's month card, and the person paid marking it received there.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** The month before this one, as `yyyy-MM`. */
function lastMonth(): string {
  const [y, m] = monthOf(new Date(), "Europe/London").split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

test("a closed month's debt is settled once the person paid marks it received", async ({ browser }) => {
  const avaContext = await browser.newContext();
  const benContext = await browser.newContext();
  const { userId: ava, houseId, housemateIds } = await dealtHouseInClient(
    avaContext,
    "Ava Stake",
    "Flat 50",
    [{ name: "Bins out", category: "bins" }],
    [{ context: benContext, name: "Ben Stake" }],
  );
  const ben = housemateIds[0];
  made.push(ava, ben);

  // Last month Ben forfeited £4 and it went to Ava; the month is closed.
  const month = lastMonth();
  const db = admin();
  const { error } = await db.from("ledger").insert([
    { house_id: houseId, user_id: ben, kind: "forfeit", amount_minor: -400, month },
    { house_id: houseId, user_id: ava, kind: "share", amount_minor: 400, month },
  ]);
  expect(error).toBeNull();
  expect((await db.from("month_closes").insert({ house_id: houseId, month })).error).toBeNull();

  // Ben's own history has the forfeit. The old link still lands on it, now one of House's pages.
  const four = formatMoney(400, "GBP");
  const benPage = await benContext.newPage();
  await benPage.goto("/stake");
  await expect(benPage).toHaveURL(/\/house\/stake$/);
  await expect(benPage.getByRole("heading", { name: STAKE_HISTORY_COPY.title })).toBeVisible();
  await expect(benPage.getByTestId("stake-screen").getByTestId("ledger-entry").filter({ hasText: STAKE_HISTORY_COPY.aJohn })).toContainText(four);

  // Back on House, settling up says what he owes, with nothing to mark.
  await backToHouse(benPage, benPage.getByTestId("stake-screen").getByTestId("back")).click();
  await expect(benPage).toHaveURL(/\/house$/);
  const owed = benPage.getByTestId("house-screen").getByTestId("settle-up").getByTestId("transfer");
  await expect(owed).toHaveCount(1);
  await expect(owed).toContainText(HOUSE_PAGE_COPY.youOwe("Ava", four));
  await expect(owed).toContainText(HOUSE_PAGE_COPY.waitingFor("Ava"));
  await expect(owed.getByRole("button")).toHaveCount(0);

  // Ava, paid, marks it received from settling up on House; the house is square, so settling up goes.
  const avaPage = await avaContext.newPage();
  await avaPage.goto("/today");
  await avaPage.getByRole("tab", { name: SECTION_LABEL.house }).click();
  const avaHouse = avaPage.getByTestId("house-screen");
  const due = avaHouse.getByTestId("settle-up").getByTestId("transfer");
  await expect(due).toContainText(HOUSE_PAGE_COPY.owesYou("Ben", four));
  await due.getByRole("button", { name: HOUSE_PAGE_COPY.markReceivedFrom("Ben", four) }).click();
  await expect(due).toHaveCount(0);
  // Ben's House follows, live.
  await expect(owed).toHaveCount(0);

  // Stake history says so once, from her side, however it's shown.
  await expect(avaHouse.getByTestId("settle-up")).toHaveCount(0);
  // Her month's figure opens Stake history.
  await avaHouse.getByTestId("figure-money").click();
  await expect(avaPage).toHaveURL(/\/house\/stake$/);
  const stake = avaPage.getByTestId("stake-screen");
  const paid = stake.getByTestId("ledger-entry").filter({ hasText: STAKE_HISTORY_COPY.paid("Ben", STAKE_HISTORY_COPY.yourself) });
  await expect(paid).toHaveCount(1);
  await stake.getByRole("radio", { name: STAKE_HISTORY_COPY.whole }).click();
  await expect(paid).toHaveCount(1);
});
