import { FRONT_DOOR_COPY, HOUSE_DRAFT_COPY, NOT_FOUND_COPY, PAGE_TITLE, SECTION_LABEL } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, dealtHouseInClient, signInToClient } from "./auth";
import { backToHouse, toHousePage } from "./house-pages";

// The Expo app's web build, walked as a housemate walks it: every way into a
// House page (its row on House, a card on Today, a link opened cold, a
// refresh) and every way back out of it (the title bar's back, the
// browser's, the tab bar). A back button that says "House" has to land on
// House, whatever came before it.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** Where the chat with Jonz opened: its own page on a phone, the panel beside the page from laptop width. */
async function chatOpened(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.getByTestId("ask-panel")).toBeVisible();
  else await expect(page).toHaveURL(/\/house\/describe$/);
}

// What the page threw or logged as an error, said when a back is missing.
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on("pageerror", (e) => seen.push(`${e.name}: ${e.message} ${e.stack ?? ""}`.slice(0, 800)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // React logs what a screen threw as an object, so ask the page to spell it out.
    void Promise.all(
      m.args().map((a) => a.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message} ${v.stack ?? ""}` : String(v))).catch(() => "?")),
    ).then((parts) => seen.push(parts.join(" ").slice(0, 1500)));
  });
});

/** On House itself: its URL, and its title bar naming the house. */
async function expectOnHouse(page: Page, houseName: string, url: RegExp = /\/house$/) {
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: houseName })).toBeVisible();
}

/** The title bar's back, which names where it goes ("House"); on a laptop, House's is Overview in the list of its pages. */
function backTo(page: Page, label: string) {
  const back = page
    .getByTestId("back")
    .filter({ visible: true })
    .and(page.getByRole("button", { name: `Back to ${label}` }));
  return label === SECTION_LABEL.house ? backToHouse(page, back) : back;
}

/**
 * Tap the title bar's back. When it isn't there, fail saying what the page
 * showed instead, since a missing back is the bug these tests look for.
 */
async function tapBack(page: Page, label: string) {
  const back = backTo(page, label);
  try {
    await expect(back).toBeVisible({ timeout: 30_000 });
  } catch {
    const all = page.getByTestId("back");
    const labels = await all.evaluateAll((els) => els.map((el) => `${el.getAttribute("aria-label")} (${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height})`));
    const text = (await page.locator("body").innerText()).slice(0, 600);
    throw new Error(`No "Back to ${label}" on ${page.url()}. Backs: ${JSON.stringify(labels)}. The page says: ${JSON.stringify(text)}. Errors: ${JSON.stringify(errors.get(page) ?? [])}`);
  }
  await back.click();
}

async function newHouse(page: Page, name: string) {
  await page.goto("/house/new");
  await page.getByLabel(FRONT_DOOR_COPY.name).fill(name);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
}

/** The House pages a row on House opens, with where each lands and what it's called. */
const PUSHED = [
  { row: "to-johns", path: "/house/johns", title: PAGE_TITLE.johnList },
  { row: "to-rules", path: "/house/rules", title: PAGE_TITLE.rules },
  { row: "to-away", path: "/house/away", title: PAGE_TITLE.away },
  { row: "to-pass", path: "/house/pass", title: PAGE_TITLE.pass },
  // You: your name, look and sign-in, help, and leaving.
  { row: "to-you", path: "/house/you", title: PAGE_TITLE.you },
];

test.describe("a house with its week dealt", () => {
  let houseName: string;
  let mateId: string;

  test.beforeEach(async ({ context, browser }) => {
    houseName = `Nav ${Date.now() % 100_000}`;
    const mate = await browser.newContext();
    const { userId, housemateIds } = await dealtHouseInClient(
      context,
      "Ava Nav",
      houseName,
      [
        { name: "Bins out", category: "bins" },
        { name: "Hoover the stairs", category: "floors" },
      ],
      [{ context: mate, name: "Ben Nav" }],
    );
    await mate.close();
    made.push(userId, ...housemateIds);
    mateId = housemateIds[0];
  });

  test("every row on House opens its page, and back comes home to House", async ({ page }) => {
    await page.goto("/house");
    await expectOnHouse(page, houseName);
    for (const { row, path, title } of PUSHED) {
      await toHousePage(page, row).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
      await tapBack(page, SECTION_LABEL.house);
      await expectOnHouse(page, houseName);
    }

    await page.getByTestId("to-wall").getByRole("link").click();
    await expect(page).toHaveURL(/\/house\/wall$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, houseName);

    await page.getByTestId("standing").filter({ hasText: "Ben" }).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/house/people/${mateId}$`));
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, houseName);
  });

  test("the browser's back from a House page comes home to House too", async ({ page }) => {
    await page.goto("/house");
    await expectOnHouse(page, houseName);
    await toHousePage(page, "to-johns").click();
    await expect(page).toHaveURL(/\/house\/johns$/);
    await page.goBack();
    await expectOnHouse(page, houseName);
    await page.goForward();
    await expect(page).toHaveURL(/\/house\/johns$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, houseName);
  });

  // Each page, and where an old link to a page that's now part of another lands.
  for (const { path, lands = path } of [
    { path: "/house/johns" },
    { path: "/house/rules" },
    { path: "/house/away" },
    { path: "/house/wall" },
    { path: "/house/stake" },
    { path: "/house/pass" },
    { path: "/house/describe" },
    { path: "/house/groups", lands: "/house/johns" },
    { path: "/house/admins", lands: "/house/rules" },
    { path: "/house/prefs", lands: "/house/away" },
    { path: "/house/history", lands: "/house/wall?view=history" },
  ]) {
    test(`${path} opened cold, and after a refresh, still goes back to House`, async ({ page }) => {
      const [where, query] = lands.split("?");
      const landed = new RegExp(`${where}${query ? `\\?${query}` : ""}$`);
      // Expo Router copies a page's params onto the routes under it (as for a housemate's page, below).
      const home = query ? new RegExp(`/house(\\?${query})?$`) : /\/house$/;
      await page.goto(path);
      await expect(page).toHaveURL(landed);
      await tapBack(page, SECTION_LABEL.house);
      await expectOnHouse(page, houseName, home);

      await page.goto(path);
      await page.reload();
      await expect(page).toHaveURL(landed);
      await tapBack(page, SECTION_LABEL.house);
      await expectOnHouse(page, houseName, home);
    });
  }

  test("a housemate's page opened cold goes back to House", async ({ page }) => {
    await page.goto(`/house/people/${mateId}`);
    await tapBack(page, SECTION_LABEL.house);
    // Known issue: opened cold, Expo Router copies the page's params onto the
    // routes under it, so House comes back as /house?userId=<id>. House
    // itself is right; only the URL carries the stray param.
    await expectOnHouse(page, houseName, new RegExp(`/house(\\?userId=${mateId})?$`));
  });

  test("Today's standing line opens House, and a page from there goes back to House", async ({ page }) => {
    await page.goto("/today");
    await page.getByTestId("standing-line").click();
    await expectOnHouse(page, houseName);
    await toHousePage(page, "to-away").click();
    await expect(page).toHaveURL(/\/house\/away$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, houseName);
  });

  test("the tabs: each opens its page, and House on a pushed page goes back to House", async ({ page }) => {
    await page.goto("/today");
    // The tabs answer once the app has drawn the page.
    await expect(page.getByRole("heading", { name: PAGE_TITLE.today })).toBeVisible();
    await page.getByRole("tab", { name: SECTION_LABEL.week }).click();
    await expect(page).toHaveURL(/\/week$/);
    await expect(page.getByRole("heading", { name: PAGE_TITLE.week })).toBeVisible();
    await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
    await expectOnHouse(page, houseName);
    await toHousePage(page, "to-rules").click();
    await expect(page).toHaveURL(/\/house\/rules$/);
    await page.getByRole("tab", { name: SECTION_LABEL.today }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
    // A tab keeps its place: House comes back to the page it was on, and a
    // second tap takes it home.
    await expect(page).toHaveURL(/\/house(\/rules)?$/);
    if (page.url().endsWith("/house/rules")) {
      await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
    }
    await expectOnHouse(page, houseName);
  });
});

test.describe("a house just started", () => {
  test("Today's setup card opens the John list, and back goes to House", async ({ context, page }) => {
    made.push(await signInToClient(context, "Cal Nav"));
    const name = `Setup ${Date.now() % 100_000}`;
    await newHouse(page, name);
    await page.getByTestId("setup-johns").click();
    await expect(page).toHaveURL(/\/house\/johns$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, name);
  });

  test("describe the house from Today, add the draft, open the list, and back goes to House", async ({
    context,
    page,
  }) => {
    made.push(await signInToClient(context, "Dee Nav"));
    const name = `Describe ${Date.now() % 100_000}`;
    await newHouse(page, name);
    await page.getByTestId("setup-describe").click();
    await chatOpened(page);
    await page.getByTestId("starter-flat_share").click();
    await expect(page.getByText(HOUSE_DRAFT_COPY.fromStarter)).toBeVisible();
    await page.getByTestId("describe-keep").click();
    await page.getByTestId("chat-open-list").click();
    await expect(page).toHaveURL(/\/house\/johns$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, name);
    // And House's own back history doesn't send the next back to the chat.
    await toHousePage(page, "to-johns").click();
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, name);
  });

  test("describe from the John list, add the draft, and back from the list goes to House", async ({
    context,
    page,
  }) => {
    made.push(await signInToClient(context, "Eli Nav"));
    const name = `List ${Date.now() % 100_000}`;
    await newHouse(page, name);
    await page.getByRole("tab", { name: SECTION_LABEL.house }).click();
    await toHousePage(page, "to-johns").click();
    await page.getByTestId("describe-house").click();
    await chatOpened(page);
    await page.getByTestId("starter-flat_share").click();
    await page.getByTestId("describe-keep").click();
    await page.getByTestId("chat-open-list").click();
    await expect(page).toHaveURL(/\/house\/johns$/);
    await tapBack(page, SECTION_LABEL.house);
    await expectOnHouse(page, name);
  });
});

test.describe("outside a house", () => {
  test("privacy's back goes to the front door, opened cold or from sign-in", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: PAGE_TITLE.privacy })).toBeVisible();
    await page.getByTestId("back").click();
    await expect(page).toHaveURL(new RegExp(`${CLIENT_URL}/(signin)?$`));
  });

  test("a page that isn't there offers a way home", async ({ context, page }) => {
    made.push(await signInToClient(context, "Fay Nav"));
    await newHouse(page, `Lost ${Date.now() % 100_000}`);
    await page.goto("/house/nope");
    await expect(page.getByRole("heading", { name: PAGE_TITLE.notFound })).toBeVisible();
    await page.getByRole("link", { name: NOT_FOUND_COPY.back }).click();
    await expect(page).toHaveURL(/\/today$/);
  });
});
