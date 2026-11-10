import { TOUR_COPY, TOURS, tourSteps, type TourFacts, type TourId } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { admin, CLIENT_URL, cleanUp, dealtHouseInClient } from "./auth";

// Help and tours in the Expo app's web build: the title bar's question mark
// opens Help, and every tour plays through on a phone and a laptop with each
// step's spot lit on screen. A page that changes so a tour's spot goes
// missing fails here, rather than leaving a dim page with nothing lit.
// Today offers its tour once to someone new, and Not now puts it away for good.
// SHOTS=<folder> also saves a step of each tour and the Help sheet, in daylight and after dark.
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
 * A tab you've been to stays drawn behind the one showing, at the same place
 * on screen, with its wrapper aria-hidden: this finds the copy on the tab
 * that's showing.
 */
const shown = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:not([aria-hidden="true"] *)`);

/** The question mark on the page showing (its screen's testID): every tab has one. */
const helpButton = (page: Page, screen: string) => page.getByTestId(screen).getByTestId("help-button");

/**
 * Plays a tour from the Help sheet to its end, checking each step: its
 * words, its count, and the lit ring sitting round its spot, on screen.
 */
async function playTour(page: Page, id: TourId, facts: TourFacts, shotName?: string) {
  const steps = tourSteps(id, facts);
  const card = page.getByTestId("tour-card");
  for (const [i, step] of steps.entries()) {
    await expect(card.getByText(step.title, { exact: true })).toBeVisible();
    await expect(page.getByTestId("tour-count")).toHaveText(`${i + 1} of ${steps.length}`);
    await expect(page).toHaveURL(new RegExp(`${step.page}$`));
    // The ring is round a spot of that name that's on screen.
    const spot = shown(page, `tour-spot-${step.spot}`).first();
    const ring = await page.getByTestId("tour-ring").boundingBox();
    const box = await spot.boundingBox();
    expect(ring, `${id}: step ${i + 1} lights ${step.spot}`).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs(ring!.x + 8 - box!.x)).toBeLessThan(2);
    expect(Math.abs(ring!.y + 8 - box!.y)).toBeLessThan(2);
    // The card doesn't cover the spot, unless the window hasn't room for both (a tall spot on a small phone).
    const viewport = page.viewportSize()!;
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(viewport.height);
    const below = box!.y + box!.height + 8 + 12 + cardBox.height <= viewport.height - 16;
    const above = box!.y - 8 - 12 - cardBox.height >= 16;
    if (below || above) {
      const overlaps =
        cardBox.x < box!.x + box!.width && box!.x < cardBox.x + cardBox.width && cardBox.y < box!.y + box!.height && box!.y < cardBox.y + cardBox.height;
      expect(overlaps, `${id}: step ${i + 1}'s card is clear of ${step.spot}`).toBe(false);
    }
    if (i === 0 && shotName) await shoot(page, shotName);
    await page.getByTestId("tour-next").click();
  }
  await expect(page.getByTestId("tour")).toHaveCount(0);
}

/** Opens Help and starts a tour from it, under Show me around. */
async function startFromHelp(page: Page, screen: string, id: TourId) {
  await helpButton(page, screen).click();
  const sheet = page.getByTestId("help-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(`help-tour-${id}`).click();
}

test("every tour plays through, each step lit on screen", async ({ context, page }, info) => {
  test.setTimeout(120_000);
  const mate = await context.browser()!.newContext();
  const { userId, housemateIds } = await dealtHouseInClient(
    context,
    "Tour Admin",
    "Tour House",
    [
      { name: "Bins out", category: "bins", dueTime: "20:00" },
      { name: "Clean the bath", category: "bathroom" },
      { name: "Kitchen floor", category: "floors" },
      { name: "Wipe the hob", category: "kitchen" },
    ],
    [{ context: mate, name: "Tour Mate" }],
  );
  made.push(userId, ...housemateIds);
  const wide = info.project.name === "laptop-chrome" || info.project.name === "desktop-firefox";
  const facts: TourFacts = { admin: true, wide, toCheck: false, hasJohns: true };

  await page.goto("/today");
  await expect(page.getByTestId("today-screen").getByTestId("next-up")).toBeVisible();

  // Help from the question mark: Ask Jonz and the guide first, then Today's tour first, the rest, and the ways to report.
  await helpButton(page, "today-screen").click();
  const sheet = page.getByTestId("help-sheet");
  await expect(sheet.getByTestId("help-ask")).toBeVisible();
  await expect(sheet.getByTestId("help-guide")).toBeVisible();
  await expect(sheet.getByTestId("help-guides").getByTestId(/^help-tour-/).first()).toContainText(TOURS.today.name);
  await expect(sheet.getByTestId("help-tour-setUp")).toBeVisible();
  await expect(sheet.getByTestId("help-report")).toBeVisible();
  await shoot(page, `help-${wide ? "laptop" : "phone"}`);

  // Read the guide: the list, then a page in the house's own words, the same Jonz reads.
  await sheet.getByTestId("help-guide").click();
  await expect(page.getByTestId("guide")).toBeVisible();
  await page.getByTestId("guide-today").click();
  await expect(page.getByTestId("guide-words")).toContainText(TOURS.today.steps[0].body);
  // On a laptop the topic opens beside the list; on a phone it's a page of its own.
  await expect(page.getByTestId(wide ? "guide-open" : "guide-page").getByTestId("guide-ask")).toBeVisible();
  await page.goto("/today");
  await expect(page.getByTestId("today-screen").getByTestId("next-up")).toBeVisible();

  await startFromHelp(page, "today-screen", "today");
  await playTour(page, "today", facts, `today-${wide ? "laptop" : "phone"}`);

  await page.getByTestId("tab-week").click();
  await startFromHelp(page, "week-screen", "week");
  await playTour(page, "week", facts, `week-${wide ? "laptop" : "phone"}`);

  await page.getByTestId("tab-house").click();
  await startFromHelp(page, "house-screen", "house");
  await playTour(page, "house", facts, `house-${wide ? "laptop" : "phone"}`);

  // The admins' tour walks across pages: the John list, the rules, Week and Today.
  await startFromHelp(page, "house-screen", "setUp");
  await playTour(page, "setUp", facts, `setup-${wide ? "laptop" : "phone"}`);

  // Each is saved as seen on the account, and Help says so.
  await expect
    .poll(async () => (await admin().auth.admin.getUserById(userId)).data.user?.user_metadata.tours.seen)
    .toEqual(expect.arrayContaining(["today", "week", "house", "setUp"]));
  await helpButton(page, "today-screen").click();
  await expect(page.getByTestId("help-sheet").getByTestId("help-tour-week")).toContainText(TOUR_COPY.seen);
  await mate.close();
});

test("Today offers its tour once to someone new; Skip and Escape end it", async ({ context, page }) => {
  // New, and not yet offered (everyone else in these tests says they've had it).
  const { userId } = await dealtHouseInClient(context, "New Person", "New House", [{ name: "Bins out", category: "bins" }], [], {
    newToTours: true,
  });
  made.push(userId);

  await page.goto("/today");
  const offer = page.getByTestId("tour-offer");
  await expect(offer).toBeVisible();
  await expect(offer).toContainText(TOUR_COPY.offerTitle);
  await shoot(page, "offer");

  // Show me starts it; Escape ends it, as Skip does, and the offer has gone.
  await offer.getByTestId("tour-offer-yes").click();
  await expect(page.getByTestId("tour-card")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tour-count")).toHaveText(/^2 of /);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("tour-count")).toHaveText(/^1 of /);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await expect(offer).toHaveCount(0);

  // It stays gone after a reload: it's saved on the account.
  await expect
    .poll(async () => (await admin().auth.admin.getUserById(userId)).data.user?.user_metadata.tours)
    .toEqual({ seen: ["today"], offerDone: true });
  await page.reload();
  await expect(page.getByTestId("today-screen").getByTestId("next-up")).toBeVisible();
  await expect(page.getByTestId("tour-offer")).toHaveCount(0);
});

test("Not now puts the offer away for good", async ({ context, page }) => {
  const { userId } = await dealtHouseInClient(context, "Not Now", "Later House", [{ name: "Bins out", category: "bins" }], [], {
    newToTours: true,
  });
  made.push(userId);

  await page.goto("/today");
  await page.getByTestId("tour-offer-no").click();
  await expect(page.getByTestId("tour-offer")).toHaveCount(0);
  await expect
    .poll(async () => (await admin().auth.admin.getUserById(userId)).data.user?.user_metadata.tours)
    .toEqual({ seen: [], offerDone: true });
  // The You page's Help has the tours too.
  await page.goto("/house/you");
  await page.getByTestId("you-screen").getByTestId("to-guides").click();
  await expect(page.getByTestId("help-sheet")).toBeVisible();
});
