import { STARTER_LISTS, type HouseDraft, wordsFor } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, signInToClient } from "./auth";
import { rightNow } from "../tests/support/clock";

const words = wordsFor("en", "housemates");

// The Expo app's web build: Describe your house, a chat with Jonz, from
// Today's setup card to the John list. On a phone the chat is a page; from
// laptop width it opens in a panel beside the page. The e2e stack has no AI Gateway, so a
// message gets the starter list that fits, as production does when the
// gateway is down.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** Where the chat opened: its own page on a phone, the panel beside the page from laptop width. */
async function chatOpened(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.getByTestId("ask-panel")).toBeVisible();
  else await expect(page).toHaveURL(/\/house\/describe$/);
}

async function newHouse(page: Page, name: string) {
  await page.goto("/house/new");
  await page.getByLabel(words('door.welcome.name')).fill(name);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
}

test("describe the house, keep most of the draft, and find it on the list", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ava Describe"));
  await newHouse(page, `Terrace ${rightNow().getTime() % 10_000}`);

  await page.getByTestId("setup-describe").click();
  await chatOpened(page);
  await expect(page.getByRole("heading", { name: words('common.title.describe') })).toBeVisible();

  await page.getByTestId("chat-input").fill("Me, my husband and our two kids in a semi. Bins go out Tuesday night.");
  const answered = page.waitForResponse((r) => /\/v1\/houses\/[^/]+\/ask$/.test(r.url()) && r.request().method() === "POST");
  await page.getByTestId("chat-send").click();
  expect((await answered).status()).toBe(201);

  // No gateway here, so the family starter list stands in, and says so.
  await expect(page.getByText(words('ask.draft.offline'))).toBeVisible();
  const family = STARTER_LISTS.family;
  await expect(page.getByTestId("draft-john")).toHaveCount(3);
  await page.getByTestId("draft-see-all").click();
  await expect(page.getByTestId("draft-john")).toHaveCount(family.length);

  await page.getByRole("checkbox", { name: new RegExp(`^${family[0].name}`) }).click();
  await page.getByTestId("describe-keep").click();
  await expect(page.getByText(words('ask.draft.added', { n: family.length - 1 }))).toBeVisible();
  await page.getByTestId("chat-open-list").click();

  await expect(page).toHaveURL(/\/house\/johns$/);
  await expect(page.getByTestId("john-def")).toHaveCount(family.length - 1);
  await expect(page.getByText(family[1].name)).toBeVisible();
  await expect(page.getByText(family[0].name, { exact: true })).toHaveCount(0);

  // With Johns on the list, Today's setup card stops offering a draft.
  await page.goto("/today");
  await expect(page.getByTestId("setup-johns")).toContainText(words('today.nextUp.onTheList', { count: family.length - 1 }));
  await expect(page.getByTestId("setup-describe")).toHaveCount(0);
});

test("start from a list without writing anything", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ben Describe"));
  await newHouse(page, `Flat ${rightNow().getTime() % 10_000}`);
  await page.goto("/house/johns");
  await page.getByTestId("describe-house").click();
  await page.getByTestId("starter-flat_share").click();
  await expect(page.getByText(words('ask.draft.fromStarter'))).toBeVisible();
  await page.getByTestId("describe-keep").click();
  await page.getByTestId("chat-open-list").click();
  await expect(page).toHaveURL(/\/house\/johns$/);
  await expect(page.getByTestId("john-def")).toHaveCount(STARTER_LISTS.flat_share.length);
});

test("ask Jonz from Today to change the list, and apply what's ticked", async ({ context, page }) => {
  made.push(await signInToClient(context, "Cal Describe"));
  await newHouse(page, `Mews ${rightNow().getTime() % 10_000}`);
  await page.goto("/house/describe");
  await page.getByTestId("starter-couple").click();
  await page.getByTestId("describe-keep").click();
  await expect(page.getByTestId("chat-open-list")).toBeVisible();
  const couple = STARTER_LISTS.couple;

  // There's no gateway here, so Jonz's answer is written in: the first John
  // worth more, the second taken off, and one new.
  await page.route("**/v1/houses/*/ask", async (route) => {
    const { draft } = route.request().postDataJSON() as { draft: HouseDraft };
    const johns = draft.johns
      .filter((j) => j.name !== couple[1].name)
      .map((j) => (j.name === couple[0].name ? { ...j, points: j.points + 2 } : j));
    const windows = { ...couple[0], name: "Windows", why: "" };
    const changed = { ...draft, johns: [...johns, windows] };
    await route.fulfill({ json: { reply: "Done.", ask: null, draft: changed, source: "ai" } });
  });

  await page.goto("/today");
  await page.getByTestId("ask-jonz").click();
  await chatOpened(page);
  await expect(page.getByRole("heading", { name: words('common.title.ask') })).toBeVisible();
  await page.getByTestId("chat-input").fill(`${couple[0].name} is more work, no ${couple[1].name}, and add windows`);
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("draft-change")).toContainText(`${couple[0].points} → `);
  await expect(page.getByTestId("draft-remove")).toContainText(couple[1].name);
  await expect(page.getByTestId("draft-john")).toContainText("Windows");
  await page.getByTestId("describe-keep").click();
  await expect(page.getByText(words('ask.draft.applied', { n: 3 }))).toBeVisible();
  await page.getByTestId("chat-open-list").click();

  await expect(page).toHaveURL(/\/house\/johns$/);
  await expect(page.getByTestId("john-def")).toHaveCount(couple.length);
  await expect(page.getByTestId("john-def").filter({ hasText: "Windows" })).toBeVisible();
  await expect(page.getByText(couple[1].name, { exact: true })).toHaveCount(0);
});
