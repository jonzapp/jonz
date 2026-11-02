import type { Locator, Page } from "@playwright/test";

// House's pages are reached two ways: on a phone (or a narrow window) by a
// row on House and the title bar's back to it; on a laptop by the list of
// House's pages beside them, where House's setup rows and those backs give
// way to the list. These find whichever the page shows, so a test walks
// House the same way at any width.


/** The row on House that opens one of its setup pages ("to-johns"), or that page in the list beside House on a laptop. */
export function toHousePage(page: Page, row: string): Locator {
  return page
    .getByTestId(row)
    .filter({ visible: true })
    .or(page.getByTestId("house-nav").getByTestId(row.replace(/^to-/, "nav-")));
}

/** The way back to House from one of its pages: the title bar's back, or Overview in the list beside it on a laptop. */
export function backToHouse(page: Page, back: Locator = page.getByTestId("back").filter({ visible: true })): Locator {
  return back.or(page.getByTestId("house-nav").getByTestId("nav-overview"));
}
