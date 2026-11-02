import { HOUSE_LOWER_COPY, HOUSE_PAGE_COPY, JOHN_LIST_COPY, PAGE_TITLE, SECTION_LABEL } from "@app/core";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

// Today, Week and House on a laptop: Today and Week spread into two columns
// beside the rail, the second a panel docked to the window's right edge,
// House lists its pages beside them with a panel for a John, its pages fill
// the room beside the list in columns, and a window too narrow for them
// keeps the phone's way.
// SHOTS=<folder> also saves each page, in daylight and after dark.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

async function shoot(page: Page, name: string) {
  const folder = process.env.SHOTS;
  if (!folder) return;
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `${folder}/${name}-${colorScheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** Where a box's top edge is on the page. */
async function topOf(box: Locator): Promise<number> {
  return (await box.boundingBox())?.y ?? Number.NaN;
}

/** A section's group of rows: the last of its two children, under its header. */
function groupOf(section: Locator): Locator {
  return section.locator(":scope > div").last();
}

/** Where a box's right edge is. */
function rightOf(box: { x: number; width: number } | null): number {
  return (box?.x ?? 0) + (box?.width ?? 0);
}

/** A House page that fills the room runs its last column out to the window's gutter, short of FILL_MAX. */
async function fillsTheRoom(page: Page, lastColumn: Locator) {
  const window = page.viewportSize()?.width ?? 0;
  expect(Math.abs(rightOf(await lastColumn.boundingBox()) - (window - 16))).toBeLessThan(2);
}

/**
 * The page holds the window's edges, as a desktop app's does: the title bar's
 * Title starts where the main column's words do, its sparkles sit at the
 * window's right edge, and the side panel runs from the bar's hairline to
 * that edge.
 */
async function holdsTheEdges(page: Page, screen: Locator, firstCard: Locator) {
  const window = page.viewportSize()?.width ?? 0;
  const bar = await screen.getByTestId("title-bar").boundingBox();
  const title = await screen.getByTestId("title-bar").getByRole("heading").boundingBox();
  const card = await firstCard.boundingBox();
  const side = await screen.getByTestId("column-side").boundingBox();
  const ask = await screen.getByTestId("ask-jonz").boundingBox();
  // The card's words are INSET in from its edge.
  expect(title?.x ?? 0).toBeCloseTo((card?.x ?? 0) + 16, 0);
  expect((ask?.x ?? 0) + (ask?.width ?? 0)).toBeGreaterThan(window - 32);
  expect((side?.x ?? 0) + (side?.width ?? 0)).toBeCloseTo(window, 0);
  expect(side?.y ?? 0).toBeCloseTo((bar?.y ?? 0) + (bar?.height ?? 0), 0);
}

test("each place spreads out on a laptop, and a narrow window keeps the phone's way", async ({ browser }, info) => {
  test.skip(info.project.name !== "laptop-chrome", "The laptop's layout");
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const { userId, houseId, housemateIds } = await dealtHouseInClient(
    contexts[0],
    "Glyn Laptop",
    "Glyn's house",
    [
      { name: "Bins and recycling out", category: "bins" },
      { name: "Kitchen deep clean", category: "kitchen" },
      { name: "Hoover the stairs", category: "floors" },
      { name: "Bathroom clean", category: "bathroom" },
      { name: "Mop the floors", category: "floors" },
      { name: "Big shop", category: "errands" },
      { name: "Wipe the hob", category: "kitchen" },
      { name: "Clean the windows", category: "other" },
    ],
    [
      { context: contexts[1], name: "Sam Laptop" },
      { context: contexts[2], name: "Priya Laptop" },
      { context: contexts[3], name: "Tom Laptop" },
    ],
  );
  made.push(userId, ...housemateIds);
  // Two of the housemates' Johns done, so the week has some of each.
  const { data: theirs } = await admin().from("assignments").select("id").eq("house_id", houseId).neq("user_id", userId).limit(2);
  for (const row of theirs ?? []) {
    await admin().from("assignments").update({ done_at: new Date().toISOString() }).eq("id", row.id);
  }

  const page = await contexts[0].newPage();
  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("column-main").getByTestId("next-up")).toBeVisible();
  await expect(today.getByTestId("column-side").getByTestId("week-glance")).toBeVisible();
  // The columns share a top edge: Next up's card and the group beside it, under the day's line and its label.
  expect(await topOf(today.getByTestId("next-up"))).toBeCloseTo(await topOf(groupOf(today.getByTestId("week-glance"))), 0);
  await holdsTheEdges(page, today, today.getByTestId("next-up"));
  await shoot(page, "today");

  await page.getByRole("tab", { name: SECTION_LABEL.week }).click();
  await expect(page.getByRole("heading", { name: PAGE_TITLE.week })).toBeVisible();
  const week = page.getByTestId("week-screen");
  await expect(week.getByTestId("column-main").getByTestId("week-table")).toBeVisible();
  await expect(week.getByTestId("column-side").getByTestId("house-table")).toBeVisible();
  // The summary heads the board in the main column, with the Table in the panel beside it.
  await expect(week.getByTestId("column-main").getByTestId("week-summary")).toBeVisible();
  await holdsTheEdges(page, week, week.getByTestId("week-summary"));
  await shoot(page, "week");

  // The Table shows the week or the month from the menu in its header, dropped from its words.
  const span = week.getByTestId("table-span");
  await expect(span).toHaveText(HOUSE_PAGE_COPY.week);
  await span.click();
  const menu = page.getByTestId("table-span-menu");
  await expect(menu).toBeVisible();
  const words = await span.boundingBox();
  const dropped = await menu.boundingBox();
  expect((dropped?.x ?? 0) + (dropped?.width ?? 0)).toBeCloseTo((words?.x ?? 0) + (words?.width ?? 0), 0);
  expect(dropped?.y ?? 0).toBeGreaterThan((words?.y ?? 0) + (words?.height ?? 0));
  await shoot(page, "table-menu");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await span.click();
  await page.getByTestId("table-span-month").click();
  await expect(menu).toHaveCount(0);
  await expect(span).not.toHaveText(HOUSE_PAGE_COPY.week);
  await shoot(page, "table-month");

  await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
  const house = page.getByTestId("house-screen");
  // The house at a glance in four figures on one line, then the Table beside the Wall, the two sharing a top edge.
  const figures = house.getByTestId("house-figures");
  await expect(figures.getByRole("link")).toHaveCount(4);
  expect(await topOf(figures.getByRole("link").first())).toBeCloseTo(await topOf(figures.getByRole("link").last()), 0);
  await expect(house.getByTestId("house-pair-start").getByTestId("house-table")).toBeVisible();
  await expect(house.getByTestId("house-pair-end").getByTestId("wall-section")).toBeVisible();
  expect(await topOf(house.getByTestId("house-pair-start"))).toBeCloseTo(await topOf(house.getByTestId("house-pair-end")), 0);
  await fillsTheRoom(page, house.getByTestId("house-pair-end"));
  await shoot(page, "house");

  // House lists its pages beside them: the John list, and a John in the panel beside it.
  const nav = page.getByTestId("house-nav");
  await nav.getByRole("link", { name: HOUSE_LOWER_COPY.johns }).click();
  await expect(page.getByRole("heading", { name: PAGE_TITLE.johnList })).toBeVisible();
  // The page fills the room beside the list: its kinds in two columns sharing a top edge, out to the
  // window's gutter, with Add a John at the top right over them.
  const kinds = page.getByTestId("john-kinds-column");
  await expect(kinds).toHaveCount(2);
  expect(await topOf(kinds.nth(0))).toBeCloseTo(await topOf(kinds.nth(1)), 0);
  await fillsTheRoom(page, kinds.nth(1));
  const add = await page.getByTestId("john-list-bar").getByTestId("add-john").boundingBox();
  expect(Math.abs(rightOf(add) - rightOf(await kinds.nth(1).boundingBox()))).toBeLessThan(2);
  await shoot(page, "johns-columns");
  await page.getByRole("button", { name: /^Edit Bathroom clean, / }).click();
  const panel = page.getByTestId("john-panel");
  await expect(panel.getByRole("heading", { name: JOHN_LIST_COPY.edit("Bathroom clean") })).toBeVisible();
  await shoot(page, "johns");
  await page.getByRole("button", { name: /^Edit Big shop, / }).click();
  await expect(panel.getByRole("heading", { name: JOHN_LIST_COPY.edit("Big shop") })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The Pass: what it gives everyone beside the plans.
  await nav.getByTestId("nav-pass").click();
  await expect(page.getByTestId("pass-pair-end").getByTestId("pass-plans")).toBeVisible();
  expect(await topOf(page.getByTestId("pass-pair-start"))).toBeCloseTo(await topOf(page.getByTestId("pass-pair-end")), 0);
  await shoot(page, "pass");

  // A housemate's page: their record, share, streak, money and time away in two columns, an admin's actions among them.
  await page.goto(`/house/people/${housemateIds[0]}`);
  const person = page.getByTestId("person-screen");
  await expect(person.getByTestId("person-sections-column")).toHaveCount(2);
  await expect(person.getByTestId("person-sections-column").first().getByTestId("person-record")).toBeVisible();
  await expect(person.getByTestId("person-admin")).toBeVisible();
  await fillsTheRoom(page, person.getByTestId("person-sections-column").last());
  await shoot(page, "person");

  // Groups, Admins, Preferences and History are parts of other pages now, and You has its own: seven in the list.
  await expect(nav.getByRole("link")).toHaveCount(7);
  // You: your settings beside help and leaving.
  await nav.getByTestId("nav-you").click();
  await expect(page.getByTestId("you-pair-start").getByTestId("sign-out")).toBeVisible();
  await expect(page.getByTestId("you-pair-end").getByTestId("to-delete-account")).toBeVisible();
  await expect(page.getByTestId("you-pair-end").getByTestId("leave")).toBeVisible();
  expect(await topOf(page.getByTestId("you-pair-start"))).toBeCloseTo(await topOf(page.getByTestId("you-pair-end")), 0);
  await shoot(page, "you");
  await nav.getByTestId("nav-wall").click();
  // History beside the Wall, under its name, the two sharing a top edge.
  const history = page.getByTestId("wall-pair-end").getByTestId("history-section");
  await expect(history).toBeVisible();
  expect(await topOf(page.getByTestId("wall-pair-start"))).toBeCloseTo(await topOf(page.getByTestId("wall-pair-end")), 0);
  await expect(page.getByTestId("wall-shows")).toHaveCount(0);
  await shoot(page, "wall-history");
  // The admins beside the rules they can change.
  await nav.getByTestId("nav-rules").click();
  await expect(page.getByTestId("rules-pair-start").getByTestId("rules-panel")).toBeVisible();
  await expect(page.getByTestId("rules-pair-end").getByTestId("admins-section")).toBeVisible();
  await shoot(page, "rules-admins");
  // Your days and best time beside the house's time away.
  await nav.getByTestId("nav-away").click();
  await expect(page.getByTestId("away-pair-start").getByTestId("prefs-time")).toBeVisible();
  await expect(page.getByTestId("away-pair-end").getByTestId("away-panel")).toBeVisible();
  await shoot(page, "days-away");
  // The groups among the John list's kinds.
  await nav.getByTestId("nav-johns").click();
  await expect(page.getByTestId("john-kinds").getByTestId("johns-groups")).toBeVisible();

  await page.getByTestId("house-nav").getByRole("link", { name: HOUSE_LOWER_COPY.overview }).click();
  await expect(house.getByTestId("house-figures")).toBeVisible();

  // A screen wide enough for the list beside the chat with Jonz still has one panel down the right: a John closes the chat.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(house.getByTestId("house-pair")).toBeVisible();
  const table = groupOf(house.getByTestId("house-table"));
  const wall = groupOf(house.getByTestId("wall-section").locator(":scope > div").first());
  expect(await topOf(table)).toBeCloseTo(await topOf(wall), 0);
  await shoot(page, "house-wide");
  await house.getByTestId("ask-jonz").click();
  await expect(page.getByTestId("ask-panel")).toBeVisible();
  // The open panel is the sign: the sparkles stay as they were, saying only to a screen reader that it's open.
  await expect(house.getByTestId("ask-jonz")).toHaveAttribute("aria-expanded", "true");
  await expect(house.getByTestId("ask-jonz")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await shoot(page, "ask-open");
  await nav.getByRole("link", { name: HOUSE_LOWER_COPY.johns }).click();
  await page.getByRole("button", { name: /^Edit Big shop, / }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("ask-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: HOUSE_LOWER_COPY.overview }).click();

  // The narrowest laptop leaves too little room for House's list beside the rail: the setup, the Pass and You
  // are rows on the page again, under the Table and the Wall.
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.getByTestId("house-nav")).toHaveCount(0);
  await expect(house.getByTestId("setup-section")).toBeVisible();
  await expect(house.getByTestId("to-you")).toBeVisible();
});
