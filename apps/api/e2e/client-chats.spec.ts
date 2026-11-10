import { ASK_CHATS_COPY, type HouseDraft, wordsFor } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL, cleanUp, signInToClient } from "./auth";

const words = wordsFor("en", "housemates");

// Ask Jonz chats are kept until you delete them: the clock on the bar's
// leading edge opens Your chats, a chat comes back from there, a reply that
// had a card says to ask again, and Your chats deletes one.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** The chat, wherever it opened: its own page on a phone, the panel beside the page from laptop width. */
function chat(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024 ? page.getByTestId("ask-panel") : page;
}

test("a chat is kept, comes back from Your chats, and can be deleted", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ava Chats"));
  await page.goto("/house/new");
  await page.getByLabel(words('door.welcome.name')).fill(`Lodge ${Date.now() % 10_000}`);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
  // A list to ask about: a starter one, kept.
  await page.goto("/house/describe");
  await page.getByTestId("starter-couple").click();
  await page.getByTestId("describe-keep").click();
  await expect(page.getByTestId("chat-open-list")).toBeVisible();

  // No gateway here, so Jonz's answer is written in: a John added, which comes with a card.
  await page.route("**/v1/houses/*/ask", async (route) => {
    const { draft } = route.request().postDataJSON() as { draft: HouseDraft };
    const windows = { ...draft.johns[0], id: undefined, name: "Windows", why: "" };
    await route.fulfill({ json: { reply: "Here’s windows.", ask: null, draft: { ...draft, johns: [...draft.johns, windows] }, source: "ai" } });
  });

  await page.goto("/today");
  await page.getByTestId("ask-jonz").click();
  const here = chat(page);
  await expect(here.getByRole("heading", { name: words('common.title.ask') })).toBeVisible();

  const said = "Add windows every month";
  await here.getByTestId("chat-input").fill(said);
  const kept = page.waitForResponse((r) => r.url().endsWith("/me/ask-chats") && r.request().method() === "POST");
  await here.getByTestId("chat-send").click();
  await expect(here.getByTestId("draft-card")).toBeVisible();
  expect((await kept).status()).toBe(201);

  // A new chat starts empty: no list on its start (the starter list tapped earlier had nothing written, so isn't kept).
  await here.getByTestId("chat-new").click();
  await expect(here.getByTestId("draft-card")).toHaveCount(0);
  await expect(here.getByTestId("saved-chat")).toHaveCount(0);
  // With nothing in it yet, New chat has nothing to clear: it waits, dimmed, until something's written.
  await expect(here.getByTestId("chat-new")).toBeDisabled();
  await here.getByTestId("chat-input").fill("Who has the bins?");
  await expect(here.getByTestId("chat-new")).toBeEnabled();
  await here.getByTestId("chat-new").click();
  await expect(here.getByTestId("chat-input")).toHaveValue("");

  // Your chats, from the clock on the bar's leading edge: the kept one, under Today.
  await here.getByTestId("chats-open").click();
  await expect(here.getByRole("heading", { name: ASK_CHATS_COPY.all, level: 1 })).toBeVisible();
  const mine = here.getByTestId("all-chats").getByTestId("saved-chat").filter({ hasText: said });
  await expect(here.getByTestId("all-chats").getByTestId("saved-chat")).toHaveCount(1);
  await expect(mine).toContainText(ASK_CHATS_COPY.today);

  // Opened again: what was said is back, and the card isn't, so it says to ask again.
  await mine.click();
  await expect(here.getByText(said)).toBeVisible();
  await expect(here.getByTestId("chat-old-card")).toHaveText(ASK_CHATS_COPY.oldCard);
  await expect(here.getByTestId("draft-card")).toHaveCount(0);

  // Your chats again: delete it, after the sheet, then back to the chat.
  await here.getByTestId("chats-open").click();
  await here.getByRole("button", { name: ASK_CHATS_COPY.deleteChat(said) }).click();
  await expect(page.getByText(ASK_CHATS_COPY.deleteBody)).toBeVisible();
  await page.getByTestId("chat-delete-sheet").getByTestId("confirm").click();
  await expect(here.getByTestId("chats-none")).toBeVisible();
  await here.getByRole("button", { name: words('common.shell.backTo', { place: words('common.title.ask') }) }).click();
  await expect(here.getByRole("heading", { name: words('common.title.ask') })).toBeVisible();
});

test("on a computer Enter sends and Shift+Enter starts a new line; on a phone Return is a new line", async ({ context, page }) => {
  made.push(await signInToClient(context, "Ava Enter"));
  await page.goto("/house/new");
  await page.getByLabel(words('door.welcome.name')).fill(`Lodge ${Date.now() % 10_000}`);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/house/describe");
  await page.getByTestId("starter-couple").click();
  await page.getByTestId("describe-keep").click();
  await expect(page.getByTestId("chat-open-list")).toBeVisible();

  const asked: unknown[] = [];
  await page.route("**/v1/houses/*/ask", async (route) => {
    const { draft, messages } = route.request().postDataJSON() as { draft: HouseDraft; messages: unknown };
    asked.push(messages);
    await route.fulfill({ json: { reply: "Noted.", ask: null, draft, source: "ai" } });
  });

  await page.goto("/today");
  await page.getByTestId("ask-jonz").click();
  const here = chat(page);
  const input = here.getByTestId("chat-input");
  await input.click();
  await page.keyboard.type("Bins on Monday");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("and Thursday");
  await expect(input).toHaveValue("Bins on Monday\nand Thursday");

  // A laptop has a keyboard; a phone (touch, no mouse) keeps Return for new lines.
  const touchOnly = await page.evaluate(() => window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  if ((page.viewportSize()?.width ?? 0) >= 1024) expect(touchOnly).toBe(false);
  await page.keyboard.press("Enter");
  if (touchOnly) {
    await expect(input).toHaveValue("Bins on Monday\nand Thursday\n");
    expect(asked).toHaveLength(0);
  } else {
    await expect(here.getByText("Noted.")).toBeVisible();
    await expect(input).toHaveValue("");
    expect(asked).toHaveLength(1);
    // Enter in an empty box sends nothing and adds no line.
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("");
    expect(asked).toHaveLength(1);
  }
});
