import { wordsFor } from "@app/core";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient, undealtHouseInClient } from "./auth";
import { rightNow } from "../tests/support/clock";

const words = wordsFor("en", "housemates");

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

/**
 * No scrollbar beside any scrolling area: with a mouse plugged in a browser
 * otherwise draws one down the page's right edge (and the panel's), a light
 * bar even at night. Playwright's Chromium hides them itself, so this asks
 * each area that scrolls whether it would draw one.
 */
async function noScrollbars(page: Page) {
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll("*")].flatMap((el) => {
      const style = getComputedStyle(el);
      const scrolls = [style.overflowX, style.overflowY].some((o) => o === "auto" || o === "scroll");
      return scrolls && style.scrollbarWidth !== "none" ? [(el as HTMLElement).dataset.testid ?? el.tagName] : [];
    }),
  );
  expect(bars).toEqual([]);
}

/** Where a box's top edge is on the page. */
async function topOf(box: Locator): Promise<number> {
  return (await box.boundingBox())?.y ?? Number.NaN;
}

/** Where a box's bottom edge is on the page. */
async function bottomOf(box: Locator): Promise<number> {
  const b = await box.boundingBox();
  return b ? b.y + b.height : Number.NaN;
}

/** Today's Next up runs across the whole of the column it heads, edge to edge, never a phone's width of it. */
async function acrossTheColumn(nextUp: Locator, column: Locator) {
  const card = await nextUp.boundingBox();
  const room = await column.boundingBox();
  expect(Math.abs((card?.x ?? 0) - (room?.x ?? 0))).toBeLessThan(2);
  expect(Math.abs(rightOf(card) - rightOf(room))).toBeLessThan(2);
}

/** A section's group of rows: the last of its two children, under its header. */
function groupOf(section: Locator): Locator {
  return section.locator(":scope > div").last();
}

/** Where a box's right edge is. */
function rightOf(box: { x: number; width: number } | null): number {
  return (box?.x ?? 0) + (box?.width ?? 0);
}

/**
 * A page in two columns runs its main column to the side panel at any width,
 * a section gap short of its hairline, so no room is left blank between them.
 */
async function runsToThePanel(screen: Locator) {
  const main = await screen.getByTestId("column-main").boundingBox();
  const side = await screen.getByTestId("column-side").boundingBox();
  expect(Math.abs((side?.x ?? 0) - rightOf(main) - 32)).toBeLessThan(2);
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
  const help = await screen.getByTestId("help-button").boundingBox();
  // The card's words are INSET in from its edge.
  expect(title?.x ?? 0).toBeCloseTo((card?.x ?? 0) + 16, 0);
  expect((ask?.x ?? 0) + (ask?.width ?? 0)).toBeGreaterThan(window - 32);
  // Help sits right against the sparkles, the bar's buttons one even group.
  expect((help?.x ?? 0) + (help?.width ?? 0)).toBeCloseTo(ask?.x ?? 0, 0);
  expect((side?.x ?? 0) + (side?.width ?? 0)).toBeCloseTo(window, 0);
  expect(side?.y ?? 0).toBeCloseTo((bar?.y ?? 0) + (bar?.height ?? 0), 0);
}

test("before the first deal Today has no empty panel: the setup card runs across the page", async ({ browser }, info) => {
  test.skip(info.project.name !== "laptop-chrome", "The laptop's layout");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { userId } = await undealtHouseInClient(context, "Glyn Undealt", "Glyn's new house", ["Bins out", "Wipe the hob"]);
  made.push(userId);
  const page = await context.newPage();
  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("column-main").getByTestId("next-up")).toBeVisible();
  // Nothing for the panel yet (no week, nothing to vote on or cover), so there's no panel and no hairline.
  await expect(today.getByTestId("column-side")).toHaveCount(0);
  // The card runs across the page to the window's gutter, never stopping where the panel would have been.
  await acrossTheColumn(today.getByTestId("next-up"), today.getByTestId("column-main"));
  const window = page.viewportSize()?.width ?? 0;
  expect(Math.abs(rightOf(await today.getByTestId("next-up").boundingBox()) - (window - 16))).toBeLessThan(2);
  await shoot(page, "today-undealt");
  // Beside the chat with Jonz it still runs up to the chat, with no empty column under it.
  await today.getByTestId("ask-jonz").click();
  const chat = page.getByTestId("ask-panel");
  await expect(chat).toBeVisible();
  await expect(today.getByTestId("today-pair")).toHaveCount(0);
  const chatEdge = (await chat.boundingBox())?.x ?? 0;
  expect(Math.abs(rightOf(await today.getByTestId("next-up").boundingBox()) - (chatEdge - 16))).toBeLessThan(2);
  await shoot(page, "today-undealt-ask");
  // On a big screen it stops at FILL_MAX, as a page that fills the room does.
  await today.getByTestId("ask-jonz").click();
  await expect(chat).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await today.getByTestId("next-up").boundingBox())?.width ?? 0).toBeLessThanOrEqual(1600);
  await shoot(page, "today-undealt-wide");
  await context.close();
});

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
    await admin().from("assignments").update({ done_at: rightNow().toISOString() }).eq("id", row.id);
  }

  const page = await contexts[0].newPage();
  await page.goto("/today");
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("column-main").getByTestId("next-up")).toBeVisible();
  await expect(today.getByTestId("column-side").getByTestId("week-glance")).toBeVisible();
  // The columns share a top edge: Next up's card and the group beside it, under the day's line and its label.
  expect(await topOf(today.getByTestId("next-up"))).toBeCloseTo(await topOf(groupOf(today.getByTestId("week-glance"))), 0);
  await holdsTheEdges(page, today, today.getByTestId("next-up"));
  // Next up runs across a main column that runs to the panel, with the rest of your week under it.
  await expect(today.getByTestId("today-pair")).toHaveCount(0);
  await acrossTheColumn(today.getByTestId("next-up"), today.getByTestId("column-main"));
  await expect(today.getByTestId("column-main").getByTestId("rest-of-week")).toBeVisible();
  expect(await topOf(today.getByTestId("rest-of-week"))).toBeGreaterThan(await bottomOf(today.getByTestId("next-up")));
  await runsToThePanel(today);
  await shoot(page, "today");
  await noScrollbars(page);
  // Beside the chat with Jonz there's no room for the panel, but the page still fills the room up to the chat: Next up
  // across it, then the rest of your week beside the week, never one phone-wide column with the room blank beside it.
  await today.getByTestId("ask-jonz").click();
  const chat = page.getByTestId("ask-panel");
  await expect(chat).toBeVisible();
  await expect(today.getByTestId("columns")).toHaveCount(0);
  await expect(today.getByTestId("today-pair").getByTestId("next-up")).toHaveCount(0);
  await expect(today.getByTestId("today-pair-start").getByTestId("rest-of-week")).toBeVisible();
  await expect(today.getByTestId("today-pair-end").getByTestId("week-glance")).toBeVisible();
  await acrossTheColumn(today.getByTestId("next-up"), today.getByTestId("today-pair"));
  const chatEdge = (await chat.boundingBox())?.x ?? 0;
  expect(Math.abs(rightOf(await today.getByTestId("today-pair-end").boundingBox()) - (chatEdge - 16))).toBeLessThan(2);
  await shoot(page, "today-ask");
  await today.getByTestId("ask-jonz").click();
  await expect(chat).toHaveCount(0);

  await page.getByRole("tab", { name: words('common.section.week') }).click();
  await expect(page.getByRole("heading", { name: words('common.title.week') })).toBeVisible();
  const week = page.getByTestId("week-screen");
  await expect(week.getByTestId("column-main").getByTestId("week-table")).toBeVisible();
  await expect(week.getByTestId("column-side").getByTestId("house-table")).toBeVisible();
  // The summary heads the board in the main column, with the Table in the panel beside it.
  await expect(week.getByTestId("column-main").getByTestId("week-summary")).toBeVisible();
  await holdsTheEdges(page, week, week.getByTestId("week-summary"));
  await runsToThePanel(week);
  await shoot(page, "week");
  await noScrollbars(page);
  // Beside the chat with Jonz, Week's one column runs up to the chat too.
  await week.getByTestId("ask-jonz").click();
  await expect(chat).toBeVisible();
  await expect(week.getByTestId("columns")).toHaveCount(0);
  expect(Math.abs(rightOf(await week.getByTestId("week-table").boundingBox()) - (chatEdge - 16))).toBeLessThan(2);
  await week.getByTestId("ask-jonz").click();
  await expect(chat).toHaveCount(0);

  // On a big screen the main column still runs to the panel, on Week and on Today.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await runsToThePanel(week);
  await shoot(page, "week-wide");
  await page.getByRole("tab", { name: words('common.section.today') }).click();
  await runsToThePanel(today);
  await acrossTheColumn(today.getByTestId("next-up"), today.getByTestId("column-main"));
  await shoot(page, "today-wide");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: words('common.section.week') }).click();
  await expect(week.getByRole("heading", { name: words('common.title.week') })).toBeVisible();

  // The Table shows the week or the month from the menu in its header, dropped from its words.
  const span = week.getByTestId("table-span");
  await expect(span).toHaveText(words('house.page.week'));
  await span.click();
  const menu = page.getByTestId("table-span-menu");
  await expect(menu).toBeVisible();
  const label = await span.boundingBox();
  const dropped = await menu.boundingBox();
  expect((dropped?.x ?? 0) + (dropped?.width ?? 0)).toBeCloseTo((label?.x ?? 0) + (label?.width ?? 0), 0);
  expect(dropped?.y ?? 0).toBeGreaterThan((label?.y ?? 0) + (label?.height ?? 0));
  await shoot(page, "table-menu");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await span.click();
  await page.getByTestId("table-span-month").click();
  await expect(menu).toHaveCount(0);
  await expect(span).not.toHaveText(words('house.page.week'));
  await shoot(page, "table-month");

  // Track record: the grid, and your breakdown beside it, the two sharing a top edge and filling the room.
  await page.goto("/week/record?span=month");
  const record = page.getByTestId("record-screen");
  await expect(record.getByTestId("record-pair-end").getByTestId("record-breakdown")).toContainText("(you)");
  expect(await topOf(record.getByTestId("record-pair-start"))).toBeCloseTo(await topOf(record.getByTestId("record-pair-end")), 0);
  await fillsTheRoom(page, record.getByTestId("record-pair-end"));
  // Click down the housemates: each opens beside the grid, on the same page, its row marked.
  const someone = record.getByTestId("record-row").filter({ hasNotText: "(you)" }).first();
  await someone.click();
  await expect(someone).toHaveAttribute("aria-current", "true");
  await expect(record.getByTestId("record-pair-end").getByTestId("record-breakdown")).not.toContainText("(you)");
  await expect(page.getByTestId("record-person-screen")).toHaveCount(0);
  await shoot(page, "record");
  // A link to a housemate's own page opens them beside the grid too.
  await page.goto(`/week/record/${housemateIds[0]}?span=month`);
  await expect(page.getByTestId("record-screen").getByTestId("record-pair-end").getByTestId("record-breakdown")).toContainText("Laptop");
  await expect(page.getByTestId("record-person-screen")).toHaveCount(0);
  await page.goto("/week");
  await expect(page.getByRole("heading", { name: words('common.title.week') })).toBeVisible();

  await page.getByRole("tab", { name: words('common.section.house') }).click();
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
  await noScrollbars(page);

  // House lists its pages beside them: the John list, and a John in the panel beside it.
  const nav = page.getByTestId("house-nav");
  await nav.getByRole("link", { name: words('house.lower.johns') }).click();
  await expect(page.getByRole("heading", { name: words('common.title.johnList') })).toBeVisible();
  // The page fills the room beside the list: its kinds one under another, out to the window's gutter,
  // with Add a John at the top right over them, and each John one line whose columns line up down the page.
  const kinds = page.getByTestId("john-kinds");
  await fillsTheRoom(page, kinds);
  const add = await page.getByTestId("john-list-bar").getByTestId("add-john").boundingBox();
  expect(Math.abs(rightOf(add) - rightOf(await kinds.boundingBox()))).toBeLessThan(2);
  const lines = kinds.getByTestId("john-def");
  const whenLeft = async (line: Locator) => (await line.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:\d\d$/).boundingBox())!.x;
  expect(Math.abs((await whenLeft(lines.first())) - (await whenLeft(lines.last())))).toBeLessThan(1);
  expect((await lines.first().boundingBox())!.height).toBeLessThan(56);
  await shoot(page, "johns-columns");
  await page.getByRole("button", { name: /^Edit Bathroom clean, / }).click();
  const panel = page.getByTestId("john-panel");
  await expect(panel.getByRole("heading", { name: words('house.johns.edit', { name: "Bathroom clean" }) })).toBeVisible();
  await shoot(page, "johns");
  await noScrollbars(page);
  await page.getByRole("button", { name: /^Edit Big shop, / }).click();
  await expect(panel.getByRole("heading", { name: words('house.johns.edit', { name: "Big shop" }) })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The Pass: what it gives everyone beside the plans.
  await nav.getByTestId("nav-pass").click();
  await expect(page.getByTestId("pass-pair-end").getByTestId("pass-plans")).toBeVisible();
  expect(await topOf(page.getByTestId("pass-pair-start"))).toBeCloseTo(await topOf(page.getByTestId("pass-pair-end")), 0);
  await shoot(page, "pass");
  await noScrollbars(page);

  // A housemate's page: their record, share, streak, money and time away in two columns, an admin's actions among them.
  await page.goto(`/house/people/${housemateIds[0]}`);
  const person = page.getByTestId("person-screen");
  await expect(person.getByTestId("person-sections-column")).toHaveCount(2);
  await expect(person.getByTestId("person-sections-column").first().getByTestId("person-record")).toBeVisible();
  await expect(person.getByTestId("person-admin")).toBeVisible();
  await fillsTheRoom(page, person.getByTestId("person-sections-column").last());
  await shoot(page, "person");
  await noScrollbars(page);

  // Groups, Admins, Preferences and History are parts of other pages now, Ask Jonz usage has its own, and You is a tab: seven in the list.
  await expect(nav.getByRole("link")).toHaveCount(7);
  // You, the rail's last place: your settings beside help and leaving.
  await page.getByTestId("tab-you").click();
  await expect(page.getByTestId("you-pair-start").getByTestId("sign-out")).toBeVisible();
  await expect(page.getByTestId("you-pair-end").getByTestId("to-delete-account")).toBeVisible();
  await expect(page.getByTestId("you-pair-end").getByTestId("leave")).toBeVisible();
  expect(await topOf(page.getByTestId("you-pair-start"))).toBeCloseTo(await topOf(page.getByTestId("you-pair-end")), 0);
  await shoot(page, "you");
  await noScrollbars(page);
  await page.getByTestId("tab-house").click();
  await nav.getByTestId("nav-wall").click();
  // The Wall alone: no History beside it, its Undo is in each post's sheet.
  await expect(page.getByTestId("wall-screen").getByTestId("wall-day").first()).toBeVisible();
  await expect(page.getByTestId("history-section")).toHaveCount(0);
  await expect(page.getByTestId("wall-shows")).toHaveCount(0);
  await shoot(page, "wall");
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
  await noScrollbars(page);
  // The Guide: the topics, and beside them the one you click (the first, to start), on the same page.
  await page.goto("/house/guide");
  const guide = page.getByTestId("guide");
  await expect(guide.getByTestId("guide-open").getByTestId("guide-words")).toBeVisible();
  await expect(guide.getByTestId("guide-today").getByRole("button")).toHaveAttribute("aria-current", "true");
  expect(await topOf(guide.getByTestId("guide-pair-start"))).toBeCloseTo(await topOf(guide.getByTestId("guide-pair-end")), 0);
  await fillsTheRoom(page, guide.getByTestId("guide-pair-end"));
  await guide.getByTestId("guide-fair_shares").click();
  await expect(guide.getByTestId("guide-fair_shares").getByRole("button")).toHaveAttribute("aria-current", "true");
  await expect(guide.getByTestId("guide-open")).toContainText("Fair shares");
  await expect(guide.getByTestId("guide-open").getByTestId("guide-ask")).toBeVisible();
  await expect(page.getByTestId("guide-page")).toHaveCount(0);
  await shoot(page, "guide");
  await noScrollbars(page);
  // A link to a topic's own page opens it beside the list too.
  await page.goto("/house/guide/points");
  await expect(page.getByTestId("guide").getByTestId("guide-points").getByRole("button")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("guide-page")).toHaveCount(0);
  // The groups under the John list's kinds, not among them.
  await nav.getByTestId("nav-johns").click();
  await expect(page.getByTestId("johns-groups")).toBeVisible();
  await expect(page.getByTestId("john-kinds").getByTestId("johns-groups")).toHaveCount(0);

  await page.getByTestId("house-nav").getByRole("link", { name: words('house.lower.overview') }).click();
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
  await nav.getByRole("link", { name: words('house.lower.johns') }).click();
  await page.getByRole("button", { name: /^Edit Big shop, / }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("ask-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: words('house.lower.overview') }).click();

  // The narrowest laptop leaves too little room for House's list beside the rail: the setup and the Pass
  // are rows on the page again.
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.getByTestId("house-nav")).toHaveCount(0);
  // As on a phone, they're the other half of House's switch.
  await house.getByTestId("house-shows").getByRole("radio", { name: words('house.shows.setup') }).click();
  await expect(house.getByTestId("setup-section")).toBeVisible();
  // You is the rail's, not House's.
  await expect(house.getByTestId("to-you")).toHaveCount(0);
  await expect(page.getByTestId("tab-you")).toBeVisible();
});
