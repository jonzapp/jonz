import { monthOf, monthWord, pointsLabel, SECTION_LABEL, wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

const words = wordsFor("en", "housemates");

// The Table in the Expo app's web build: a tick scores at once, for the
// week, on House's Table, and each housemate's row opens their page, with
// their fair share and streak.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("a tick scores on the Table at once, beside fair shares and streaks", async ({ browser }) => {
  const avaContext = await browser.newContext();
  const benContext = await browser.newContext();
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    avaContext,
    "Ava Table",
    "Flat 40",
    [
      { name: "Bins out", category: "bins" },
      { name: "Wipe the hob", category: "kitchen" },
    ],
    [{ context: benContext, name: "Ben Table" }],
  );
  made.push(userId, ...housemateIds);
  const { data: mine } = await admin().from("assignments").select("name, points").eq("house_id", houseId).eq("user_id", userId);

  // Ava's one John is her Next up.
  const ava = await avaContext.newPage();
  await ava.goto("/today");
  const today = ava.getByTestId("today-screen");
  await expect(today.getByTestId("next-up-name")).toHaveText(mine![0].name);
  await today.getByTestId("next-up").getByRole("button", { name: words('john.row.markDone'), exact: true }).click();
  await expect(today.getByRole("img", { name: words('today.nextUp.stateLabel.checking') })).toBeVisible();

  // The Table is on House: one row per housemate, this week's points first.
  // Ava leads with her John's points (the month's depends on whether it
  // falls due this month).
  await ava.getByRole("tab", { name: SECTION_LABEL.house }).click();
  await expect(ava).toHaveURL(/\/house$/);
  const table = ava.getByTestId("house-screen").getByTestId("house-table");
  await expect(table.getByRole("heading", { name: words('house.page.table') })).toBeVisible();
  const standings = table.getByTestId("standing");
  await expect(standings).toHaveCount(2);
  await expect(standings.first()).toContainText(words('house.page.you'));
  await expect(standings.first()).toContainText(pointsLabel(mine![0].points));
  await expect(standings.nth(1)).toContainText("Ben");
  await expect(standings.nth(1)).toContainText(pointsLabel(0));
  // The month's Table has everyone on it too, chosen from the menu in its header.
  const month = monthWord(monthOf(new Date(), "Europe/London"));
  await table.getByTestId("table-span").click();
  await ava.getByRole("radio", { name: month }).click();
  await expect(table.getByTestId("table-span")).toHaveText(month);
  await expect(standings).toHaveCount(2);

  // Ben's row opens his page: his fair share and his streak.
  await standings.filter({ hasText: "Ben" }).getByRole("link").click();
  await expect(ava).toHaveURL(new RegExp(`/house/people/${housemateIds[0]}$`));
  const person = ava.getByTestId("person-screen");
  await expect(person.getByTestId("person-share")).toContainText(words('people.person.level', { you: false }));
  await expect(person.getByTestId("person-perks")).toContainText(words('people.person.noStreak'));
});
