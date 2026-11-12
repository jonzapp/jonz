import { describe, expect, it } from "vitest";

import { DEFAULT_RULES } from "./domain";
import { guideMarkdown, HOW_TOPICS, howItWorks } from "./how-it-works";
import { LEGAL, PRIVACY_POLICY, TERMS } from "./legal";
import { listPages, newHouseFacts, PAGE_IDS, pageMarkdown, READING_PAGES, readingMarkdown } from "./pages";
import { parseDoc } from "./reply-format";
import { HELP_PAGE } from "./reports";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");
const house = { rules: { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" as const }, family: false, awayMakeup: 100 };

describe("Jonz's pages", () => {
  it("lists every guide topic, then Help, Privacy and Terms, once each, each with a title, what it covers and where to read it", () => {
    expect([...PAGE_IDS]).toEqual([...HOW_TOPICS, "help", "privacy", "terms"]);
    const pages = listPages(words);
    expect(pages.map((p) => p.id)).toEqual([...PAGE_IDS]);
    for (const p of pages) {
      expect(p.title.trim(), p.id).not.toBe("");
      expect(p.about.trim(), p.id).not.toBe("");
      expect(p.url.startsWith(`${LEGAL.site}/`), p.id).toBe(true);
    }
    expect(pages.find((p) => p.id === "privacy")?.url).toBe(`${LEGAL.site}${LEGAL.privacyPath}`);
  });

  it("titles a guide topic in the reader's own words", () => {
    const fr = wordsFor("fr", "housemates");
    expect(listPages(fr).find((p) => p.id === "stake")?.title).toBe(fr("door.guide.topic.stake.title"));
  });

  it("reads every page as Markdown the app can draw", () => {
    for (const id of PAGE_IDS) {
      const md = pageMarkdown(id, { words, house });
      expect(md, id).toMatch(/^# \S/);
      expect(parseDoc(md).length, id).toBeGreaterThan(1);
    }
  });

  it("reads a guide topic as the guide screen shows it, with the house's own numbers", () => {
    const md = pageMarkdown("stake", { words, house });
    expect(md).toContain(guideMarkdown(howItWorks("stake", house, words)));
    const family = pageMarkdown("deal", { words: wordsFor("en", "family"), house: newHouseFacts("family", "Europe/London", "GBP") });
    expect(family).toContain(guideMarkdown(howItWorks("deal", { ...house, family: true }, wordsFor("en", "family"))));
  });

  it("reads Help, Privacy and Terms from the same words their screens show, so the two can't drift apart", () => {
    expect(READING_PAGES).toEqual({ help: HELP_PAGE, privacy: PRIVACY_POLICY, terms: TERMS });
    for (const [id, page] of Object.entries(READING_PAGES)) {
      const md = pageMarkdown(id as keyof typeof READING_PAGES, { words, house });
      expect(md).toBe(readingMarkdown(page));
      for (const s of page.sections) {
        expect(md, `${id}: ${s.heading}`).toContain(`## ${s.heading}\n\n${s.body}`);
        for (const l of s.links ?? []) expect(md, l.label).toContain(`[${l.label}](`);
      }
    }
  });

  it("gives an app path as a web address, for a reader outside the app", () => {
    const md = readingMarkdown(HELP_PAGE);
    expect(md).toContain(`(${LEGAL.site}/delete)`);
    expect(md).toContain(`(mailto:${LEGAL.email})`);
  });
});
