import {
  addDaysTo,
  AWAY_COPY,
  dateRange,
  dayName,
  GROUPS_COPY,
  JOHN_LIST_COPY,
  localDate,
  NEXT_UP_COPY,
  SECTION_LABEL,
  SETUP_COPY,
} from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

// Groups and time away in the Expo app's web build: a John only some of the
// house shares, and a trip booked from the calendar. The rules behind both
// are proved in packages/core and tests/db/groups-away.test.ts; this proves
// the app's screens reach them.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/**
 * Tap a day in the booking calendar, by the name a screen reader hears
 * ("Wednesday 28 October"). It opens on this week and runs on for five, across
 * months, so the next few days are always on it.
 */
async function tapDay(page: Page, date: string) {
  await page.getByTestId("away-form").getByRole("button", { name: dayName(date), exact: true }).click();
}

/** Opens a day's sheet from Who's away, a month on if the day is in the next one. */
async function openDay(page: Page, today: string, date: string, away: number) {
  const month = page.getByTestId("away-month");
  if (date.slice(0, 7) !== today.slice(0, 7)) await month.getByRole("button", { name: AWAY_COPY.laterMonth }).click();
  await month.getByRole("button", { name: AWAY_COPY.dayLabel(dayName(date), away) }).click();
}

test("make a group, give it a John, and book time away", async ({ browser }) => {
  const avaContext = await browser.newContext();
  const benContext = await browser.newContext();
  const { userId: ava, houseId, housemateIds } = await dealtHouseInClient(
    avaContext,
    "Ava Away",
    "Flat 70",
    [{ name: "Bins out", category: "bins" }],
    [{ context: benContext, name: "Ben Away" }],
  );
  made.push(ava, ...housemateIds);
  const db = admin();

  const page = await avaContext.newPage();
  // Groups are on the John list, among the Johns they share.
  await page.goto("/house/johns");
  const groups = page.getByTestId("johns-groups");
  await expect(groups.getByText(GROUPS_COPY.empty)).toBeVisible();

  // A group of the people who share the upstairs bathroom: Ava alone.
  await groups.getByTestId("add-group").click();
  const groupForm = page.getByTestId("group-form");
  await groupForm.getByLabel(GROUPS_COPY.name).fill("Upstairs bathroom");
  await groupForm.getByRole("checkbox", { name: "You" }).click();
  await groupForm.getByTestId("save-group").click();
  await expect(groupForm).toBeHidden();
  await expect(groups.getByTestId("group")).toContainText("Upstairs bathroom");

  // A John only that group is handed, on the same list.
  const list = page.getByTestId("johns-screen");
  await list.getByTestId("add-john").click();
  const johnForm = page.getByTestId("john-form");
  await johnForm.getByLabel(JOHN_LIST_COPY.name).fill("Bathroom clean");
  await johnForm.getByRole("button", { name: new RegExp(`^${JOHN_LIST_COPY.sharedBy}, `) }).click();
  await johnForm.getByRole("radio", { name: "Upstairs bathroom" }).click();
  await johnForm.getByTestId("save-john").click();
  await expect(johnForm).toBeHidden();
  await expect(list.getByTestId("john-def").filter({ hasText: "Bathroom clean" })).toContainText("Upstairs bathroom");
  const { data: group } = await db.from("groups").select("id, group_members(user_id)").eq("house_id", houseId).single();
  expect(group!.group_members).toEqual([{ user_id: ava }]);
  const { data: john } = await db.from("johns").select("group_id").eq("house_id", houseId).eq("name", "Bathroom clean").single();
  expect(john!.group_id).toBe(group!.id);

  // Time away, booked ahead from the calendar.
  await page.goto("/house/away");
  const awayPage = page.getByTestId("away-screen");
  const today = localDate(new Date(), "Europe/London");
  const from = addDaysTo(today, 2);
  const to = addDaysTo(today, 5);
  await tapDay(page, from);
  await tapDay(page, to);
  const away = page.getByTestId("away-form");
  await expect(away.getByTestId("away-picked")).toContainText("Away");
  await away.getByLabel(AWAY_COPY.note).fill("Lisbon");
  await away.getByTestId("book-away").click();
  // Yours, to cancel, and on the month as yours.
  await expect(awayPage.getByTestId("my-trip")).toContainText(dateRange(from, to));
  await expect(awayPage.getByTestId("my-trip")).toContainText("Lisbon");
  await openDay(page, today, from, 1);
  await expect(page.getByTestId("away-day-sheet").getByTestId("day-away")).toContainText(SETUP_COPY.you);
  await page.getByTestId("sheet-close").click();
  const { data: booked } = await db.from("away_periods").select("starts_on, ends_on, note").eq("house_id", houseId);
  expect(booked).toEqual([{ starts_on: from, ends_on: to, note: "Lisbon" }]);

  // Today says so, under the week; Ben sees it on Time away, and can't change the groups.
  await page.getByRole("tab", { name: SECTION_LABEL.today }).click();
  await expect(page.getByTestId("today-screen").getByTestId("away-line")).toContainText(NEXT_UP_COPY.awaySoon(dateRange(from, to)));
  const benPage = await benContext.newPage();
  await benPage.goto("/house/away");
  await openDay(benPage, today, to, 1);
  const avasTrip = benPage.getByTestId("away-day-sheet").getByTestId("day-away");
  await expect(avasTrip).toContainText("Ava");
  await expect(avasTrip).toContainText(AWAY_COPY.backOn(dateRange(addDaysTo(to, 1), addDaysTo(to, 1))));
  await expect(avasTrip).toContainText("Lisbon");
  await benPage.getByTestId("sheet-close").click();
  // An old link to Groups lands on the John list.
  await benPage.goto("/house/groups");
  await expect(benPage).toHaveURL(/\/house\/johns$/);
  await expect(benPage.getByTestId("johns-groups").getByTestId("group")).toBeVisible();
  await expect(benPage.getByTestId("johns-groups").getByTestId("add-group")).toHaveCount(0);

  // Ava changes her mind.
  await page.goto("/house/away");
  await awayPage.getByTestId("my-trip").getByRole("button", { name: AWAY_COPY.cancel }).click();
  await expect(awayPage.getByTestId("my-trip")).toHaveCount(0);
  await expect(awayPage.getByText(AWAY_COPY.nobody)).toBeVisible();
  expect((await db.from("away_periods").select("id").eq("house_id", houseId)).data).toEqual([]);

  await avaContext.close();
  await benContext.close();
});
