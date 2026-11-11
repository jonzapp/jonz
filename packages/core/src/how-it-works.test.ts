import { describe, expect, it } from "vitest";

import { DEFAULT_RULES, type HouseRules } from "./domain";
import { guideMarkdown, guideTopic, guideSections, HOW_TOPICS, howItWorks, isHowTopic, type HowFacts } from "./how-it-works";
import { TOURS, tourStepWords } from "./tours";
import { formatMoney } from "./money";
import { PASS_PRICES } from "./pass";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const rules: HouseRules = {
  ...DEFAULT_RULES,
  timezone: "Europe/London",
  currency: "GBP",
};
const facts: HowFacts = { rules, family: false, awayMakeup: 100 };

describe("howItWorks", () => {
  it("says something real for every topic, in every kind of house", () => {
    for (const currency of ["GBP", "USD", "EUR", "CAD"] as const)
      for (const family of [false, true])
        for (const awayMakeup of [0, 50, 100])
          for (const stakeMinor of [0, 2000])
            for (const topic of HOW_TOPICS) {
              const said = howItWorks(topic, {
                rules: { ...rules, currency, stakeMinor },
                family,
                awayMakeup,
              }, words);
              expect(said.length, topic).toBeGreaterThan(30);
              expect(said, topic).not.toMatch(/undefined|NaN|null|\[object/);
            }
  });

  it("uses the house's own Stake, forfeits and hours", () => {
    const own = {
      ...rules,
      stakeMinor: 1500,
      lateForfeitMinor: 50,
      missedForfeitMinor: 200,
      lateHours: 12,
      coverGraceHours: 2,
    };
    const stake = howItWorks("stake", { ...facts, rules: own }, words);
    for (const m of [1500, 50, 200, 250])
      expect(stake).toContain(formatMoney(m, "GBP"));
    const late = howItWorks("late_and_missed", { ...facts, rules: own }, words);
    expect(late).toContain("12 hours");
    expect(late).toContain("2 hours");
  });

  it("says there is nothing to pay in a house with no Stake", () => {
    const none = { ...facts, rules: { ...rules, stakeMinor: 0 } };
    expect(howItWorks("stake", none, words)).toMatch(/no Stake/);
    expect(howItWorks("late_and_missed", none, words)).not.toMatch(/£/);
    expect(howItWorks("covering", none, words)).not.toMatch(/forfeit/);
  });

  it("gives the Pass's real prices in the house's currency", () => {
    for (const currency of ["GBP", "USD"] as const) {
      const said = howItWorks("house_pass", {
        ...facts,
        rules: { ...rules, currency },
      }, words);
      expect(said).toContain(
        formatMoney(PASS_PRICES[currency].yearly, currency),
      );
      expect(said).toContain(
        formatMoney(PASS_PRICES[currency].monthly, currency),
      );
      expect(said).toMatch(/Where the money goes|servers/);
    }
  });

  it("says how time away is made up, as the house has it", () => {
    expect(howItWorks("time_away", { ...facts, awayMakeup: 0 }, words)).toContain(
      "not at all",
    );
    expect(howItWorks("fair_shares", { ...facts, awayMakeup: 50 }, words)).toContain(
      "by half",
    );
  });

  it("only talks about parents and kids in a family", () => {
    expect(howItWorks("family", facts, words)).toMatch(/not a family/);
    expect(howItWorks("family", { ...facts, family: true }, words)).toMatch(
      /parent’s OK/,
    );
  });
});

describe("the guide", () => {
  it("lists every topic once, with a title and a line, for the kind of house", () => {
    for (const family of [false, true]) {
      const topics = guideSections(family, words).flatMap((s) => s.topics);
      expect(new Set(topics).size).toBe(topics.length);
      expect(topics.includes("family")).toBe(family);
      expect(topics.includes("stake")).toBe(!family);
      for (const t of HOW_TOPICS) if (!(family ? ["stake", "settle_up"] : ["family"]).includes(t)) expect(topics, t).toContain(t);
    }
    for (const t of HOW_TOPICS) expect(guideTopic(t, words).title.length, t).toBeGreaterThan(2);
  });

  it("reads each page from its tour, so the guide and the tour say the same", () => {
    const today = howItWorks("today", facts, words);
    for (const step of TOURS.today.steps) expect(today).toContain(tourStepWords("today", step, words).body);
    expect(howItWorks("house", facts, words)).toContain(tourStepWords("setUp", TOURS.setUp.steps[0], words).body);
  });

  it("never talks about the tools Jonz reads with", () => {
    for (const t of HOW_TOPICS) expect(howItWorks(t, facts, words), t).not.toMatch(/\bread\b gives|why_john|settle_up\)|\(see /);
  });

  it("writes a piece as paragraphs and lists", () => {
    expect(guideMarkdown("Lead\n- one\n\n- two\nAfter *this*")).toBe("Lead\n\n- one\n- two\n\nAfter \\*this\\*");
  });

  it("knows a topic from anything else in an address", () => {
    expect(isHowTopic("covering")).toBe(true);
    expect(isHowTopic("nope")).toBe(false);
  });
});
