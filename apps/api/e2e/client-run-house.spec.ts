import {
  DEAL_COPY,
  FOCUS_SHELL_COPY,
  formatMoney,
  FRONT_DOOR_COPY,
  JOHN_LIST_COPY,
  MOVING_COPY,
  NEXT_UP_COPY,
  PERSON_COPY,
  pointsLabel,
  RULES_COPY,
  scheduleLine,
  SECTION_LABEL,
  SETUP_COPY,
  SIGN_IN_COPY,
  type Currency,
} from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, signInToClient } from "./auth";
import { backToHouse, toHousePage } from "./house-pages";

// A house from nothing, in the Expo app's web build alone: start it, write
// the John list, let a housemate in, hand out the week, change the rules
// and the roles, rename yourself, and leave. Every step goes through the
// real UI against the real local stack, and the database is read back.
test.use({ baseURL: CLIENT_URL });

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

/** A setting's row in a form, which opens into its choices: "Effort, 2 pts". */
function pickRow(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}, `) });
}

async function addJohn(page: Page, name: string, points: number) {
  const list = page.getByTestId("johns-screen");
  await list.getByTestId("add-john").click();
  const form = page.getByTestId("john-form");
  await form.getByLabel(JOHN_LIST_COPY.name).fill(name);
  await pickRow(page, JOHN_LIST_COPY.effort).click();
  await form.getByRole("radio", { name: pointsLabel(points), exact: true }).click();
  await form.getByTestId("save-john").click();
  await expect(form).toBeHidden();
  await expect(list.getByTestId("john-def").filter({ hasText: name })).toBeVisible();
}

test("run a house from nothing on the phone", async ({ browser }) => {
  const avaContext = await browser.newContext();
  const benContext = await browser.newContext();
  const ava = await signInToClient(avaContext, "Ava Runner");
  const ben = await signInToClient(benContext, "Ben Runner");
  made.push(ava, ben);
  const db = admin();
  const name = `Flat ${Date.now() % 10_000}`;

  // Ava starts the house; Today's setup checklist sends her to the John list.
  const page = await avaContext.newPage();
  await page.goto("/welcome");
  await page.getByRole("link", { name: FRONT_DOOR_COPY.startInstead }).click();
  await page.getByLabel(FRONT_DOOR_COPY.name).fill(name);
  await page.getByTestId("create-house").click();
  await expect(page).toHaveURL(/\/today$/);
  const today = page.getByTestId("today-screen");
  await expect(today.getByTestId("next-up")).toContainText(NEXT_UP_COPY.setUp(name));
  await today.getByTestId("setup-johns").getByRole("link").click();
  await expect(page).toHaveURL(/\/house\/johns$/);
  const list = page.getByTestId("johns-screen");
  await expect(list.getByText(SETUP_COPY.noJohns)).toBeVisible();
  await expect(list.getByText(SETUP_COPY.noJohnsBody)).toBeVisible();

  // The John list: two Johns, then one edited.
  await addJohn(page, "Bins", 2);
  await addJohn(page, "Bathroom", 4);
  await list.getByRole("button", { name: JOHN_LIST_COPY.edit("Bins") }).click();
  // When it comes round is a sentence; its day opens the days, and Done goes back to it.
  await page.getByTestId("john-form").getByTestId("timing-day").click();
  await page.getByTestId("timing-days").getByRole("radio", { name: "Thursday" }).click();
  await page.getByTestId("timing-done").click();
  await page.getByTestId("john-form").getByTestId("save-john").click();
  await expect(list.getByTestId("john-def").filter({ hasText: "Bins" })).toContainText(
    scheduleLine({ everyWeeks: 1, dueDow: 4, dueTime: "21:00", needsPhoto: false }),
  );
  const { data: houseRow } = await db.from("houses").select("id, join_code, currency").eq("name", name).single();
  const { data: johns } = await db.from("johns").select("name, points, due_dow").eq("house_id", houseRow!.id).order("name");
  expect(johns).toEqual([
    { name: "Bathroom", points: 4, due_dow: 7 },
    { name: "Bins", points: 2, due_dow: 4 },
  ]);

  // Ben joins by the link House's invite sheet shows. Nothing is dealt yet.
  await page.goto("/house");
  const house = page.getByTestId("house-screen");
  await house.getByTestId("invite").click();
  const inviteSheet = page.getByTestId("invite-sheet");
  const invite = (await inviteSheet.getByTestId("invite-url").textContent())!.trim();
  expect(invite).toMatch(new RegExp(`/join/${houseRow!.join_code}$`));
  await inviteSheet.getByTestId("sheet-close").click();
  const benPage = await benContext.newPage();
  await benPage.goto(new URL(invite).pathname);
  await benPage.getByRole("button", { name: FRONT_DOOR_COPY.join }).click();
  await expect(benPage).toHaveURL(/\/today$/);
  await expect(benPage.getByText(NEXT_UP_COPY.waiting("Ava"))).toBeVisible();

  // Ava hands out the week from the John list, by House's Johns row: two
  // Johns, two people, one each.
  await page.reload();
  await expect(house.getByTestId("standing")).toHaveCount(2);
  await toHousePage(page, "to-johns").click();
  await expect(page).toHaveURL(/\/house\/johns$/);
  await list.getByTestId("deal-week").click();
  await expect(list.getByTestId("deal-week")).toHaveText(new RegExp(DEAL_COPY.again));
  await page.getByRole("tab", { name: SECTION_LABEL.today }).click();
  await expect(today.getByTestId("next-up-name")).toBeVisible();
  await expect(today.getByTestId("my-john")).toHaveCount(0);
  await benPage.reload();
  const benToday = benPage.getByTestId("today-screen");
  await expect(benToday.getByTestId("next-up-name")).toBeVisible();
  await expect(benToday.getByTestId("my-john")).toHaveCount(0);

  // The house rules: a bigger stake, and no disputes.
  await page.goto("/house/rules");
  const rulesPage = page.getByTestId("rules-screen");
  await rulesPage.getByTestId("edit-rules").click();
  await rulesPage.getByTestId("house-stake").fill("25");
  await pickRow(page, SETUP_COPY.disputes).click();
  await rulesPage.getByRole("radio", { name: RULES_COPY.disputeHours(0) }).click();
  await rulesPage.getByTestId("save-rules").click();
  await expect(page.getByTestId("toast")).toHaveText(SETUP_COPY.saved);
  const { data: rules } = await db.from("houses").select("stake_minor, dispute_hours").eq("id", houseRow!.id).single();
  expect(rules).toEqual({ stake_minor: 2500, dispute_hours: 0 });
  const stake = SETUP_COPY.perMonth(formatMoney(2500, houseRow!.currency as Currency));

  // Ben reads the rules but can't change them, nor the list.
  await benPage.goto("/house/rules");
  const benRules = benPage.getByTestId("rules-screen");
  await expect(benRules.getByTestId("rule").filter({ hasText: SETUP_COPY.stake })).toContainText(stake);
  await expect(benRules.getByTestId("rule").filter({ hasText: SETUP_COPY.disputes })).toContainText(SETUP_COPY.disputeWindow(0));
  // Beside the rules, the admins who can change them.
  await expect(benRules.getByTestId("admins-section").getByTestId("admin-row")).toHaveText(/Ava/);
  await expect(benRules.getByTestId("admins-section").getByTestId("add-admin")).toHaveCount(0);
  await expect(benRules.getByTestId("edit-rules")).toHaveCount(0);
  await expect(benRules.getByTestId("house-stake")).toHaveCount(0);
  await benPage.goto("/house/johns");
  await expect(benPage.getByTestId("johns-screen").getByTestId("john-def")).toHaveCount(2);
  await expect(benPage.getByTestId("johns-screen").getByTestId("add-john")).toHaveCount(0);

  // Ava makes Ben an admin too, from his page off the Table, and renames herself on House.
  await page.goto("/house");
  await house.getByTestId("standing").filter({ hasText: "Ben" }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/house/people/${ben}$`));
  const person = page.getByTestId("person-screen");
  await person.getByTestId("toggle-admin").getByRole("button", { name: PERSON_COPY.makeAdmin }).click();
  await expect(person.getByTestId("title-bar")).toContainText(PERSON_COPY.sub(true, false));
  await expect(person.getByTestId("toggle-admin")).toContainText(PERSON_COPY.makeHousemate);
  await backToHouse(page, person.getByRole("button", { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) })).click();
  await expect(page).toHaveURL(/\/house$/);
  // Your name is on You, a row at the foot of House on a phone and a page in its list on a laptop.
  await toHousePage(page, "to-you").click();
  await expect(page).toHaveURL(/\/house\/you$/);
  const you = page.getByTestId("you-screen");
  await you.getByTestId("to-name").click();
  const nameSheet = page.getByTestId("name-sheet");
  await nameSheet.getByTestId("my-name").fill("Ava R");
  await nameSheet.getByTestId("save-name").click();
  await expect(nameSheet).toBeHidden();
  await expect(you.getByTestId("to-name")).toContainText("Ava R");
  const { data: roles } = await db.from("members").select("user_id, role").eq("house_id", houseRow!.id);
  expect(roles).toContainEqual({ user_id: ben, role: "admin" });
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", ava).single();
  expect(profile!.display_name).toBe("Ava R");

  // Ben leaves, after its confirm, and is back at starting or joining one.
  await benPage.goto("/house/you");
  await benPage.getByTestId("you-screen").getByTestId("leave").click();
  await benPage.getByTestId("leave-sheet").getByTestId("confirm").click();
  await expect(benPage).toHaveURL(/\/welcome$/);
  const { data: left } = await db.from("members").select("user_id").eq("house_id", houseRow!.id);
  expect(left).toEqual([{ user_id: ava }]);

  // It's the Moving on screen: Ben starts his new place, and the John list comes too.
  await expect(benPage.getByRole("heading", { name: MOVING_COPY.heading })).toBeVisible();
  await benPage.getByTestId("start-from").click();
  await expect(benPage.getByRole("heading", { name: MOVING_COPY.newHeading })).toBeVisible();
  await benPage.getByTestId("house-name").fill("Ben's new place");
  await benPage.getByTestId("create-house").click();
  await expect(benPage).toHaveURL(/\/today$/);
  const { data: next } = await db.from("members").select("house_id").eq("user_id", ben).single();
  const [{ data: oldList }, { data: newList }] = await Promise.all([
    db.from("johns").select("name").eq("house_id", houseRow!.id).is("archived_at", null).order("name"),
    db.from("johns").select("name").eq("house_id", next!.house_id).order("name"),
  ]);
  expect(newList).toEqual(oldList);
  expect(newList!.length).toBeGreaterThan(0);

  // Ava signs out from You.
  await you.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("button", { name: SIGN_IN_COPY.google })).toBeVisible();

  await avaContext.close();
  await benContext.close();
});
