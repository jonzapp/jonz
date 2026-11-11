import { expect, type Page } from "@playwright/test";

// The button rules (docs/style/controls.md), measured on a real page. Every
// Button says on the web how it was placed (data-button) and its kind
// (data-variant):
//
// - "full": a ButtonRow put it across its column; it must span the column.
// - "share": one of a row sharing the line; their widths are checked by the
//   style page.
// - "own": on its own in a wide column, which only a laptop has.
// - "loose": nothing placed it. Fine beside other things on a line (Next
//   up's Photo, a toolbar's Add a John, the tour's Next); a loose button on a
//   line of its own, narrower than its column, is the bug Week's Deal week 1
//   had on a phone.
// - "icon": an icon alone, a square anywhere.
//
// And at most one amber (primary) button shows at once (the style page,
// which shows every kind, says not to count). A button waiting on the server
// (aria-busy) keeps its own colour: pale reads as switched off
// (docs/style/states.md, "Waiting").

/** What breaks the button rules on the page as it is now, in words. Empty when nothing does. */
export async function buttonBreaks(page: Page, { oneAmber = true }: { oneAmber?: boolean } = {}): Promise<string[]> {
  return page.evaluate((oneAmber) => {
    const breaks: string[] = [];
    const shown = (element: Element) => {
      // A tab you've left stays drawn behind: aria-hidden before expo-router 58.0.31, inert on web since.
      if (element.closest('[aria-hidden="true"], [inert]')) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const name = (element: Element) =>
      `"${element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "?"}"${element.getAttribute("data-testid") ? ` (${element.getAttribute("data-testid")})` : ""}`;
    /** The width a child may fill: the parent's box less its padding. */
    const room = (parent: Element) => {
      const style = getComputedStyle(parent);
      return parent.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    };
    const wide = window.innerWidth >= 1024;
    const across = (element: Element) => {
      const style = getComputedStyle(element);
      return style.flexDirection === "row" || style.flexDirection === "row-reverse";
    };
    /**
     * The column something sits in: the nearest box holding something else
     * beside it, and the child of that box it sits in. A wrapper around one
     * thing (EmptyState's action) is looked through, so a wrapper hugging
     * the button is caught too.
     */
    const columnOf = (element: Element): [Element, Element | null] => {
      let child = element;
      let at = element.parentElement;
      while (at && [...at.children].filter(shown).length < 2) {
        child = at;
        at = at.parentElement;
      }
      return [child, at];
    };
    const buttons = [...document.querySelectorAll("[data-button]")].filter(shown);
    for (const button of buttons) {
      const placed = button.getAttribute("data-button");
      const parent = button.parentElement;
      if (!parent) continue;
      const width = button.getBoundingClientRect().width;
      if (placed === "full") {
        // Across the ButtonRow, and the ButtonRow across its column.
        if (Math.abs(width - room(parent)) > 1) {
          breaks.push(`${name(button)} should span its row (${Math.round(width)} of ${Math.round(room(parent))})`);
        }
        const [child, column] = columnOf(parent);
        const span = child.getBoundingClientRect().width;
        if (column && !across(column) && Math.abs(span - room(column)) > 1) {
          breaks.push(`${name(button)} should span its column (${Math.round(span)} of ${Math.round(room(column))})`);
        }
      }
      if (button.getAttribute("aria-busy") === "true" && parseFloat(getComputedStyle(button).opacity) < 1) {
        breaks.push(`${name(button)} is busy but pale: a busy button keeps its own colour`);
      }
      if (placed === "own" && !wide) breaks.push(`${name(button)} keeps its own width below a laptop`);
      if (placed === "loose") {
        const [, column] = columnOf(button);
        if (column && !across(column) && width < room(column) - 1) {
          breaks.push(`${name(button)} sits alone at its own width (${Math.round(width)} of ${Math.round(room(column))}): put it in a ButtonRow`);
        }
      }
    }
    const amber = buttons.filter((button) => button.getAttribute("data-variant") === "primary");
    if (oneAmber && amber.length > 1) breaks.push(`more than one amber button shows: ${amber.map(name).join(", ")}`);
    return breaks;
  }, oneAmber);
}

/** Fails, naming them, if anything on the page breaks the button rules. */
export async function expectButtonRules(page: Page, where: string) {
  expect(await buttonBreaks(page), `buttons on ${where}`).toEqual([]);
}
