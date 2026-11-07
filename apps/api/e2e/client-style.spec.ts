import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL } from "./auth";
import { buttonBreaks } from "./button-rules";

// The style page (/style, apps/client/src/components/style-page): every
// building block and sample pages, checked at the widths the house style
// names (docs/style/layout.md) in Day and Night. Two kinds of check:
//
// - Layout rules, measured: buttons in a row are one width and one height,
//   side by side or stacked; no label is cut off; icon buttons are a 48
//   square; two columns start at the same top edge.
// - Pictures: each width and look is compared with the one kept beside this
//   file (client-style.spec.ts-snapshots). A change to how something looks
//   fails here until the pictures are made again, on purpose:
//   `npx playwright test client-style --project=laptop-chrome --update-snapshots`
//
// Chromium on a laptop only: the page sets its own widths, and pictures
// are only comparable from one browser.
test.use({ baseURL: CLIENT_URL });

const WIDTHS = [
  { name: "small-phone", width: 320, path: "/style" },
  { name: "phone", width: 390, path: "/style" },
  { name: "laptop-panel", width: 1024, path: "/style?panel=1" },
  { name: "laptop", width: 1440, path: "/style" },
] as const;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-chrome", "The style page is checked in Chromium on a laptop only.");
});

async function open(page: Page, width: number, path: string, colorScheme: "light" | "dark") {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto(path);
  await expect(page.getByTestId("style-page")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Makes the window as tall as the page, so one picture holds all of it. */
async function fitHeight(page: Page, width: number) {
  const height = await page.evaluate(() =>
    Math.max(
      900,
      ...[
        ...document.querySelectorAll(
          '[data-testid="page-scroll"], [data-testid="column-main-scroll"], [data-testid="column-side"], [data-testid="style-panel"] > div',
        ),
      ].map((scroll) => scroll.scrollHeight),
    ),
  );
  await page.setViewportSize({ width, height });
  await page.evaluate(() => document.fonts.ready);
}

/** Each ButtonRow's buttons, as boxes. */
async function buttonRows(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="button-row-"], [data-testid^="panel-row-"]')].map((row) => ({
      row: row.getAttribute("data-testid"),
      buttons: [...row.querySelectorAll('[role="button"]')].map((button) => {
        const box = button.getBoundingClientRect();
        return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
      }),
    })),
  );
}

/** Text that the page cut short: an ellipsis, or lines clamped, with words left over. */
async function cutOff(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="style-page"] *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipped = style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none";
        if (!clipped || !element.textContent) return false;
        // A tall face pokes a pixel or two out of its line, so a clamped line counts as cut only when half a line is hidden.
        const line = parseFloat(style.lineHeight) || 20;
        return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + line / 2;
      })
      .map((element) => element.textContent),
  );
}

for (const { name, width, path } of WIDTHS) {
  test(`style page at ${name} (${width}) keeps the layout rules`, async ({ page }) => {
    await open(page, width, path, "light");
    await fitHeight(page, width);

    // Buttons in a row: one width, one height; side by side or stacked, never ragged.
    const rows = await buttonRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(path.includes("panel") ? 6 : 4);
    for (const { row, buttons } of rows) {
      expect(buttons.length, `${row} has its buttons`).toBeGreaterThanOrEqual(2);
      const [first] = buttons;
      for (const button of buttons) {
        expect(Math.abs(button.width - first.width), `${row}: buttons one width`).toBeLessThanOrEqual(1);
        expect(Math.abs(button.height - first.height), `${row}: buttons one height`).toBeLessThanOrEqual(1);
      }
      const sideBySide = buttons.every((button) => Math.abs(button.y - first.y) <= 1);
      const stacked = buttons.every((button) => Math.abs(button.x - first.x) <= 1);
      expect(sideBySide || stacked, `${row}: side by side or stacked`).toBe(true);
    }
    // Below NARROW every row stacks.
    if (width < 360) {
      for (const { row, buttons } of rows) expect(new Set(buttons.map((b) => b.x)).size, `${row} stacks`).toBe(1);
    }

    // A button on its own spans the column on a phone and keeps its own width in a wide one on a laptop.
    const lone = await page.getByTestId("lone-button").getByRole("button").first().boundingBox();
    const column = await page.getByTestId("lone-button").boundingBox();
    if (width < 1024) expect(Math.abs((lone?.width ?? 0) - (column?.width ?? 0)), "lone button spans").toBeLessThanOrEqual(1);
    else expect(lone?.width ?? 0, "lone button keeps its own width").toBeLessThan((column?.width ?? 0) / 2);
    expect(await buttonBreaks(page, { oneAmber: false })).toEqual([]);

    // No words cut off.
    expect(await cutOff(page)).toEqual([]);

    // Icon buttons: a 48 square.
    for (const id of ["icon-close", "icon-more", "icon-ask", "icon-outline"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.width, id).toBe(48);
      expect(box?.height, id).toBe(48);
    }

    // On a laptop the page is in two columns whose first sections share a top edge.
    if (width >= 1440) {
      const tops = await page.evaluate(() =>
        ["column-main", "column-side"].map((id) => {
          const column = document.querySelector(`[data-testid="${id}"]`);
          const first = id === "column-main" ? column?.firstElementChild : column?.querySelector('[data-testid="sample-today"]');
          return Math.round(first?.getBoundingClientRect().y ?? Number.NaN);
        }),
      );
      expect(tops[0]).toBe(tops[1]);
    }
    // With the panel open, it takes PANEL (400) from the window's edge.
    if (path.includes("panel")) {
      const panel = await page.getByTestId("style-panel").boundingBox();
      expect(panel?.width).toBe(400);
      expect(Math.round((panel?.x ?? 0) + (panel?.width ?? 0))).toBe(width);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`style page at ${name} (${width}) in ${colorScheme === "light" ? "Day" : "Night"} looks as it did`, async ({ page }) => {
      await open(page, width, path, colorScheme);
      await fitHeight(page, width);
      await expect(page).toHaveScreenshot(`${name}-${colorScheme}.png`, {
        animations: "disabled",
        caret: "hide",
        // Fonts are drawn a hair differently from one Chromium build to the next.
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}
