import { describe, expect, it } from "vitest";

import { EN, type WordId } from "./locales";
import { languageOf, wordsFor } from "./words-for";

describe("the test language (en-XA)", () => {
  const test = wordsFor("en-XA", "housemates");
  const family = wordsFor("en-XA", "family");

  it("accents every letter and brackets the line, keeping gaps and counts", () => {
    expect(test("common.members", { count: 1 })).toMatch(/^\[.*\]$/);
    expect(test("common.members", { count: 1 })).not.toMatch(/[a-z]{2}/);
    expect(test("common.members", { count: 5 })).toContain("5");
  });

  it("fills a gap with what it's given, unaccented", () => {
    const line = Object.entries(EN).find(([, l]) => l.includes("{name}"))![0] as WordId;
    expect(test(line, { name: "Priya" })).toContain("Priya");
  });

  it("still gives a family its own sentence", () => {
    expect(test("today.nextUp.invite")).not.toBe(family("today.nextUp.invite"));
  });

  // family-words.test.ts reads every line every way in every language.
});

describe("languageOf", () => {
  it("reads a saved choice or a phone's tag as a language Jonz has", () => {
    expect(languageOf("en")).toBe("en");
    expect(languageOf("en-GB")).toBe("en");
    expect(languageOf("en_US")).toBe("en");
    expect(languageOf("en-XA")).toBe("en-XA");
    expect(languageOf("EN-xa")).toBe("en-XA");
  });

  it("reads English for a language Jonz hasn't got, or none", () => {
    expect(languageOf("fr-FR")).toBe("en");
    expect(languageOf("")).toBe("en");
    expect(languageOf(null)).toBe("en");
    expect(languageOf(undefined)).toBe("en");
  });
});
