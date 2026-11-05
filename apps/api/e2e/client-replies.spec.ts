import { REPLY_SAMPLES } from "@app/core";
import { expect, test, type Page } from "@playwright/test";

import { CLIENT_URL } from "./auth";

// Ask Jonz's replies (packages/core reply-format.ts, apps/client
// components/reply), drawn by the hidden gallery at /style/replies from the
// sample replies in packages/core reply-samples.ts: Markdown, chips, cards
// and the messy things Claude might write. Two kinds of check, as the style
// page's:
//
// - Rules, measured, for every sample at every width: nothing wider than the
//   screen, no words cut off, no Markdown marks showing, every chip whole,
//   on its line and named, the cards each sample asks for.
// - Pictures: each sample at each width and look, compared with the ones
//   kept beside this file. Remake them on purpose with
//   `npx playwright test client-replies --project=laptop-chrome --update-snapshots`
//
// Chromium on a laptop only: the page sets its own widths, and pictures are
// only comparable from one browser.
test.use({ baseURL: CLIENT_URL });

const WIDTHS = [
  { name: "small-phone", width: 320 },
  { name: "phone", width: 390 },
  { name: "panel", width: 400 },
] as const;

/** The cards each sample shows, in order (only the ones the gallery's house has data for). */
const CARDS: Record<string, string[]> = {
  week: ["week", "shares"],
  mine: ["week"],
  list: ["johns"],
  family: ["week"],
};

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-chrome", "The replies are checked in Chromium on a laptop only.");
});

/** The gallery's height once it has stopped changing: the same over half a second, fonts and every request done. */
async function settledHeight(page: Page): Promise<number> {
  await page.waitForLoadState("networkidle");
  // The app adds its fonts itself once it starts, so fonts.ready alone can come before them: wait for Overpass.
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes("Overpass") && f.status === "loaded"));
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(async () => {
    const gallery = document.querySelector('[data-testid="reply-gallery"]')!;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    let last = -1;
    let still = 0;
    // 30 frames (about half a second) the same, or give up after five seconds and take what's there.
    for (let n = 0; n < 300 && still < 30; n++) {
      await frame();
      const now = gallery.scrollHeight;
      still = now === last ? still + 1 : 0;
      last = now;
    }
    return last;
  });
}

/**
 * The gallery at a width and look, the window as tall as all of it. Measured
 * only once nothing is still loading, and again after the resize, so a late
 * font or request can't change the height between measuring and the pictures.
 */
async function open(page: Page, width: number, colorScheme: "light" | "dark") {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  // A notice left on by another test (a banner over every page) is no part of the replies.
  await page.route("**/api/notices", (route) => route.fulfill({ json: { notices: [] } }));
  await page.goto("/style/replies");
  await expect(page.getByTestId("reply-gallery")).toBeVisible();
  for (let tries = 0; tries < 3; tries++) {
    const height = await settledHeight(page);
    await page.setViewportSize({ width, height });
    if ((await settledHeight(page)) === height) return;
  }
}

for (const { name, width } of WIDTHS) {
  test(`every sample reply at ${name} (${width}) keeps the rules`, async ({ page }) => {
    await open(page, width, "light");

    // Nothing wider than the screen.
    const wide = await page.evaluate(
      (w) =>
        [...document.querySelectorAll('[data-testid="chat-reply"] *')]
          .filter((e) => e.getBoundingClientRect().right > w + 0.5)
          .map((e) => `${e.getAttribute("data-testid") ?? e.tagName}: ${(e.textContent ?? "").slice(0, 40)}`),
      width,
    );
    expect(wide).toEqual([]);

    // No words cut off: an ellipsis or clamp with words left over.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="chat-reply"] *')]
        .filter((e) => {
          const style = getComputedStyle(e);
          const clipped = style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none";
          const line = parseFloat(style.lineHeight) || 20;
          return clipped && !!e.textContent && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + line / 2);
        })
        .map((e) => e.textContent),
    );
    expect(cut).toEqual([]);

    for (const sample of REPLY_SAMPLES) {
      const box = page.getByTestId(`reply-sample-${sample.id}`);
      const reply = box.getByTestId("chat-reply");
      await expect(reply, sample.id).toBeVisible();

      // No Markdown marks showing (the messy sample's own words aside).
      const text = (await reply.innerText()).replace("<b>raw HTML</b>", "").replace("< 5 pts > 2 pts", "").replace("**Unclosed", "Unclosed");
      expect(text.match(/\*\*|__|::|\]\(|^#+ |```|\| -/gm), `${sample.id} shows Markdown`).toBeNull();

      // Every chip whole, one line tall, inside the reply, and named for a screen reader.
      const replyBox = (await reply.boundingBox())!;
      for (const chip of await reply.locator('[data-testid^="reply-chip-"]').all()) {
        const b = (await chip.boundingBox())!;
        const label = await chip.getAttribute("aria-label");
        expect(label, `${sample.id}: a chip with no name`).toBeTruthy();
        expect(b.height, `${sample.id}: ${label} is one line`).toBeLessThanOrEqual(30);
        expect(b.x, `${sample.id}: ${label} inside`).toBeGreaterThanOrEqual(replyBox.x - 0.5);
        expect(b.x + b.width, `${sample.id}: ${label} inside`).toBeLessThanOrEqual(replyBox.x + replyBox.width + 0.5);
      }

      // The cards it asks for, and no others.
      const cards = await reply.locator('[data-testid^="reply-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice("reply-card-".length)));
      expect(cards, sample.id).toEqual(CARDS[sample.id] ?? []);
    }

    // The messy sample: a web link is words, not a link.
    await expect(page.getByTestId("reply-sample-messy").getByRole("link")).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`sample replies at ${name} (${width}) in ${colorScheme === "light" ? "Day" : "Night"} look as they did`, async ({ page }) => {
      await open(page, width, colorScheme);
      // One picture a sample, so a change shows up as the sample it's in, and the rest still compare.
      for (const sample of REPLY_SAMPLES) {
        await expect.soft(page.getByTestId(`reply-sample-${sample.id}`), sample.id).toHaveScreenshot(`${name}-${colorScheme}-${sample.id}.png`, {
          animations: "disabled",
          caret: "hide",
          // Fonts are drawn a hair differently from one Chromium build to the next.
          maxDiffPixelRatio: 0.01,
        });
      }
    });
  }
}
