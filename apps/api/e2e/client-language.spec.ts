import { wordsFor } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, signInToClient } from "./auth";

// Each person's language (docs/specs/translation.md): the app saves the
// phone's the first time, then reads every line in the one saved for them.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

const english = wordsFor("en", "housemates");
const testLanguage = wordsFor("en-XA", "housemates");

async function savedLanguage(userId: string) {
  const { data } = await admin().from("profiles").select("language").eq("id", userId).single();
  return data?.language ?? null;
}

test("saves the phone's language the first time, then reads in the one saved for you", async ({ context, page }) => {
  const id = await signInToClient(context, "Lena Language");
  made.push(id);
  expect(await savedLanguage(id)).toBeNull();

  await page.goto("/");
  await expect(page.getByRole("link", { name: english("door.welcome.startInstead") })).toBeVisible();
  // The browser speaks English, so English is saved.
  await expect.poll(() => savedLanguage(id)).toBe("en");

  // Picked elsewhere (on another device, say): the app reads in it once it's opened again.
  await admin().from("profiles").update({ language: "en-XA" }).eq("id", id);
  await page.reload();
  await expect(page.getByRole("link", { name: testLanguage("door.welcome.startInstead") })).toBeVisible();
  expect(testLanguage("door.welcome.startInstead")).not.toBe(english("door.welcome.startInstead"));
});
