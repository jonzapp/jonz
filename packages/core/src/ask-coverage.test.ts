import { describe, expect, it } from "vitest";

import { ASK_COVERAGE, ASK_ELSEWHERE_GUIDE } from "./ask-coverage";
import { PERMISSION_NAMES } from "./permissions";
import { chipOf } from "./reply-format";

describe("ASK_COVERAGE", () => {
  it("says how Ask Jonz handles every permission", () => {
    expect(Object.keys(ASK_COVERAGE).sort()).toEqual([...PERMISSION_NAMES].sort());
  });

  it("gives every move not on the card a page chip the app can open", () => {
    const pages = Object.values(ASK_COVERAGE).filter((c) => c.by === "page");
    const links = [...ASK_ELSEWHERE_GUIDE.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    expect(links).toHaveLength(pages.length);
    for (const [, label, href] of links) expect(chipOf(href, label)).toMatchObject({ t: "chip", kind: "page" });
  });
});
