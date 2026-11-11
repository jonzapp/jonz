import { expect, type Locator, type Page } from "@playwright/test";
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// House's pages are reached two ways: on a phone (or a narrow window) by a
// row on House and the title bar's back to it; on a laptop by the list of
// House's pages beside them, where House's setup rows and those backs give
// way to the list. These find whichever the page shows, so a test walks
// House the same way at any width.


/**
 * The row on House that opens one of its setup pages ("to-johns"), or that
 * page in the list beside House on a laptop. On a phone the setup rows are
 * the other half of House's switch ("Setup and you"): `click()` shows that
 * half first when the row isn't on screen.
 */
export function toHousePage(page: Page, row: string): { click: () => Promise<void> } {
  const target = page
    .getByTestId(row)
    .filter({ visible: true })
    .or(page.getByTestId("house-nav").getByTestId(row.replace(/^to-/, "nav-")));
  const setup = page.getByTestId("house-shows").filter({ visible: true }).getByRole("radio", { name: words('house.shows.setup') });
  return {
    click: async () => {
      await expect(target.or(setup).first()).toBeVisible();
      if (!(await target.first().isVisible())) await setup.click();
      // On a laptop a row can show in both places (the Pass row closes the
      // Free and House Pass card on House, beside the list): either opens it.
      await target.first().click();
    },
  };
}

/** House's Overview half on a phone (the Table, the Wall), after a test has been to "Setup and you". Nothing to do on a laptop. */
export async function showHouseOverview(page: Page): Promise<void> {
  const overview = page.getByTestId("house-shows").filter({ visible: true }).getByRole("radio", { name: words('house.shows.overview') });
  if (await overview.isVisible()) await overview.click();
}

/** The way back to House from one of its pages: the title bar's back, or Overview in the list beside it on a laptop. */
export function backToHouse(page: Page, back: Locator = page.getByTestId("back").filter({ visible: true })): Locator {
  return back.or(page.getByTestId("house-nav").getByTestId("nav-overview"));
}
