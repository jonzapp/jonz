import { REPORT_COPY } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";
import { photo } from "./photo";

// Report a problem in the Expo app's web build (docs/specs/report-a-problem.md):
// a housemate sends one from House with a screenshot and the details, sees
// it under Your reports, reads the owner's reply and writes back. The
// owner's side is checked by tests/db/reports.test.ts and the app's own
// tests; here the reply is written as the database would write it.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
const reports: string[] = [];
test.afterAll(async () => {
  const db = admin();
  const { data } = await db.from("reports").select("shots").in("id", reports);
  const shots = (data ?? []).flatMap((r) => r.shots);
  if (shots.length) await db.storage.from("report-shots").remove(shots);
  await db.from("reports").delete().in("id", reports);
  await cleanUp(made);
});

test("sends a problem with a screenshot from You, then reads the reply and writes back", async ({ browser }) => {
  const context = await browser.newContext();
  const { userId } = await dealtHouseInClient(context, "Ava Reports", "Flat 40", [{ name: "Wipe the hob", category: "kitchen" }]);
  made.push(userId);
  const page = await context.newPage();
  await page.goto("/house/you");

  // You > Help > Report a problem opens the sheet, listing what it will send.
  await page.getByTestId("to-report").filter({ visible: true }).click();
  const form = page.getByTestId("report-form");
  await expect(form).toBeVisible();
  await expect(form.getByTestId("report-send-details")).toContainText("Flat 40");
  await form.getByLabel(REPORT_COPY.words.problem).fill("The hob John vanished from Today after I ticked it.");
  const chooser = page.waitForEvent("filechooser");
  await form.getByTestId("report-add-shot").click();
  await (await chooser).setFiles({ name: "screenshot.png", mimeType: "image/png", buffer: photo() });
  await expect(form.getByTestId("report-shot-0")).toBeVisible();
  await form.getByTestId("report-send").click();

  // Sent, it opens under Your reports.
  await expect(page).toHaveURL(/\/house\/reports\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("your-report-state")).toHaveText(REPORT_COPY.state.new);
  const id = page.url().split("/").pop()!;
  reports.push(id);
  const { data: sent } = await admin().from("reports").select("user_id, kind, state, shots, details").eq("id", id).single();
  expect(sent).toMatchObject({ user_id: userId, kind: "problem", state: "new", details: expect.objectContaining({ house: "Flat 40" }) });
  expect(sent!.shots).toHaveLength(1);
  expect(sent!.shots[0]).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`));

  // The owner replies (as owner_reply_report would).
  await admin().from("report_messages").insert({ report_id: id, from_owner: true, author_name: "Glyn", body: "Thanks Ava, fixed in today's update." });
  await admin().from("reports").update({ state: "replied", updated_at: new Date().toISOString() }).eq("id", id);

  // You says a reply is waiting; the report shows it, and writing back sends it to the Inbox as new.
  await page.goto("/house/you");
  await expect(page.getByTestId("to-reports").filter({ visible: true })).toContainText(REPORT_COPY.yoursMeta(1, 1));
  await page.goto(`/house/reports/${id}`);
  const thread = page.getByTestId("report-thread");
  await expect(thread).toContainText("Glyn at Jonz");
  await expect(thread).toContainText("Thanks Ava, fixed in today's update.");
  await expect(page.getByTestId("your-report-state")).toHaveText(REPORT_COPY.state.replied);
  await page.getByTestId("write-back-input").fill("Thank you!");
  await page.getByTestId("write-back-send").click();
  await expect(thread).toContainText("Thank you!");
  await expect(page.getByTestId("your-report-state")).toHaveText(REPORT_COPY.state.new);

  // Read now: You no longer says a reply is waiting.
  await page.goto("/house/you");
  await expect(page.getByTestId("to-reports").filter({ visible: true })).not.toContainText(REPORT_COPY.yoursMeta(1, 1));
  await context.close();
});
