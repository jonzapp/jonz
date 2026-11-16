import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, ownerInClient } from "./auth";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// The owner's notice editor in the Expo app's web build: a notice that
// starts later and ends on a date picks each day with the date picker and
// each time from a list of the day's half hours, never typing 2026-11-30
// 09:00 (docs/style/controls.md, Inputs). The time list opens scrolled to
// the chosen time. Picking a day in the calendar, a saved time between the
// half hours and the checks are notice-editor.test.tsx.
//
// With SHOTS=<folder> it also takes the PR's pictures there, Day and Night.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
const titles: string[] = [];
test.afterAll(async () => {
  if (titles.length) await admin().from("notices").delete().in("title", titles);
  await cleanUp(made);
});

async function shoot(page: Page, name: string) {
  const folder = process.env.SHOTS;
  if (!folder) return;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${folder}/${name}-${test.info().project.name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("a notice starts later and ends on a date, each a day and a time picked, not typed", async ({ browser }) => {
  // One clock all year, so a week on is always seven days of hours.
  const context = await browser.newContext({ timezoneId: "UTC" });
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  const title = `Jonz is on iPhone ${randomUUID().slice(0, 4)}`;
  titles.push(title);

  const page = await context.newPage();
  await page.goto("/admin/notices");
  await expect(page.getByTestId("admin-notices")).toBeVisible();
  // Beside the list on a laptop, a sheet on a phone.
  await page.getByTestId("start-news").click();
  const editor = page.getByTestId("notice-editor");
  await expect(editor).toBeVisible();
  await editor.getByTestId("notice-title").fill(title);

  await expect(editor.getByTestId("notice-starts-day")).toHaveCount(0);
  await editor.getByRole("radio", { name: words("admin.shell.startsLater") }).click();
  const day = editor.getByTestId("notice-starts-day");
  const time = editor.getByTestId("notice-starts-time");
  await expect(day).toBeVisible();
  // A day in words with its year, and a time on the half hour: nothing to type.
  await expect(day).toHaveText(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  await expect(time).toHaveText(/^\d{2}:(00|30)$/);
  await expect(day).toHaveAttribute("aria-haspopup", "dialog");
  await expect(time).toHaveAttribute("aria-haspopup", "listbox");

  // The list opens on the chosen time, not on midnight.
  const chosen = (await time.textContent())!;
  await time.click();
  await expect(page.getByTestId(`notice-starts-time-${chosen}`)).toBeInViewport();
  await page.getByTestId("notice-starts-time-14:30").click();
  await expect(time).toHaveText("14:30");

  await editor.getByRole("radio", { name: "On a date" }).click();
  const ends = editor.getByTestId("notice-ends-time");
  await expect(editor.getByTestId("notice-ends-day")).toBeVisible();
  await expect(ends).toHaveText("14:30");
  await ends.click();
  await expect(page.getByTestId("notice-ends-time-14:30")).toBeInViewport();
  await page.getByTestId("notice-ends-time-18:00").click();
  await expect(ends).toHaveText("18:00");
  await shoot(page, "notice-when");

  await editor.getByTestId("notice-save").click();
  // Saved as the moments picked, on this browser's clock.
  await expect.poll(async () => (await admin().from("notices").select("starts_at, ends_at").eq("title", title)).data?.length ?? 0).toBe(1);
  const { data } = await admin().from("notices").select("starts_at, ends_at").eq("title", title).single();
  const clock = await page.evaluate(
    ([starts, ends]) => [starts, ends].map((at) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }),
    [data!.starts_at, data!.ends_at] as const,
  );
  expect(clock).toEqual(["14:30", "18:00"]);
  expect(Date.parse(data!.ends_at) - Date.parse(data!.starts_at)).toBe(7 * 86_400_000 + 3.5 * 3_600_000);
});
