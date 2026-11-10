import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, ownerInClient } from "./auth";

// Every admin list's one search box, in a real browser: typing in it never
// takes the cursor out of it, whatever the list does as you go (reads, finds
// nothing, finds rows again). The audit log on a laptop once moved its list
// out of the two columns when nothing matched, which drew the box afresh and
// dropped the cursor mid-word. Every page with the box is checked the same
// way, on a phone and a laptop, by src/__tests__/app/admin-search-focus.test.tsx
// in the client; this is the browser's own word on the focus.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => {
  await cleanUp(made);
});

test("keeps the cursor in the audit log's search box as you type, when nothing matches and when rows come back", async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await ownerInClient(context, "Glyn Owner");
  made.push(owner.id);
  // An entry of the owner's own, so the list (and on a laptop the entry beside it) has something to show.
  const title = `Search focus ${randomUUID().slice(0, 6)}`;
  const { data: entry, error } = await admin()
    .from("admin_audit")
    .insert({ actor: owner.id, action: "notice.save", target_kind: "notice", target_id: randomUUID(), after: { kind: "news", title } })
    .select("id")
    .single();
  if (error) throw error;

  const page = await context.newPage();
  await page.goto("/admin/audit?who=you");
  const audit = page.getByTestId("admin-audit");
  const row = audit.getByTestId(`audit-row-${entry!.id}`);
  await expect(row).toBeVisible();

  const box = audit.getByTestId("audit-search-input");
  await box.click();
  // Typed a key at a time, as a person does, so the list searches between keys.
  await box.pressSequentially("zzqx", { delay: 120 });
  await expect(audit.getByTestId("audit-no-match")).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("zzqx");

  for (let i = 0; i < 4; i++) await box.press("Backspace", { delay: 120 });
  await expect(row).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");

  // And on with the next words, still in the box.
  await box.pressSequentially("zz", { delay: 120 });
  await expect(audit.getByTestId("audit-no-match")).toBeVisible();
  await expect(box).toBeFocused();
  await context.close();
});
