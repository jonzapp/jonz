import { ASK_CHATS_COPY, FRONT_DOOR_COPY, PAGE_TITLE, type HouseDraft } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, signInToClient } from "./auth";

// Ask Jonz chats are kept until you delete them: a chat comes back from the
// chat's start, a reply that had a card says to ask again, and Your chats
// deletes one.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** The chat, wherever it opened: its own page on a phone, the panel beside the page from laptop width. */
function chat(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024 ? page.getByTestId("ask-panel") : page;
}

test("a chat is kept, comes back from the start, and can be deleted", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ava Chats"));
  await page.goto("/house/new");
  await page.getByLabel(FRONT_DOOR_COPY.name).fill(`Lodge ${Date.now() % 10_000}`);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
  // A list to ask about: a starter one, kept.
  await page.goto("/house/describe");
  await page.getByTestId("starter-couple").click();
  await page.getByTestId("describe-keep").click();
  await expect(page.getByTestId("chat-open-list")).toBeVisible();

  // No gateway here, so Jonz's answer is written in: a John added, which comes with a card.
  await page.route("**/api/setup/draft", async (route) => {
    const { draft } = route.request().postDataJSON() as { draft: HouseDraft };
    const windows = { ...draft.johns[0], id: undefined, name: "Windows", why: "" };
    await route.fulfill({ json: { reply: "Here’s windows.", ask: null, draft: { ...draft, johns: [...draft.johns, windows] }, source: "ai" } });
  });

  await page.goto("/today");
  await page.getByTestId("ask-jonz").click();
  const here = chat(page);
  await expect(here.getByRole("heading", { name: PAGE_TITLE.ask })).toBeVisible();

  const said = "Add windows every month";
  await here.getByTestId("chat-input").fill(said);
  const kept = page.waitForResponse((r) => r.url().includes("/rest/v1/ask_chats") && r.request().method() === "POST");
  await here.getByTestId("chat-send").click();
  await expect(here.getByTestId("draft-card")).toBeVisible();
  expect((await kept).status()).toBe(201);

  // A new chat starts empty, with the kept one to pick up (the starter list tapped earlier had nothing written, so isn't kept).
  await here.getByTestId("chat-new").click();
  await expect(here.getByTestId("draft-card")).toHaveCount(0);
  const recent = here.getByTestId("recent-chats");
  await expect(recent.getByTestId("saved-chat")).toHaveCount(1);
  const mine = recent.getByTestId("saved-chat").filter({ hasText: said });
  await expect(mine).toContainText(ASK_CHATS_COPY.today);

  // Opened again: what was said is back, and the card isn't, so it says to ask again.
  await mine.click();
  await expect(here.getByText(said)).toBeVisible();
  await expect(here.getByTestId("chat-old-card")).toHaveText(ASK_CHATS_COPY.oldCard);
  await expect(here.getByTestId("draft-card")).toHaveCount(0);

  // Your chats: delete it, after the sheet.
  await here.getByTestId("chat-new").click();
  await here.getByTestId("chats-see-all").click();
  const all = here.getByTestId("all-chats").getByTestId("saved-chat");
  await expect(all).toHaveCount(1);
  await here.getByRole("button", { name: ASK_CHATS_COPY.deleteChat(said) }).click();
  await expect(page.getByText(ASK_CHATS_COPY.deleteBody)).toBeVisible();
  await page.getByTestId("chat-delete-sheet").getByTestId("confirm").click();
  await expect(here.getByTestId("chats-none")).toBeVisible();
  await here.getByTestId("chats-back").click();
  await expect(here.getByTestId("recent-chats")).toHaveCount(0);
});
