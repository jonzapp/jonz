import { describe, expect, it } from "vitest";

import { DEFAULT_RULES, type HouseRules } from "./domain";
import { HOW_TOPICS, howItWorks, type HowFacts } from "./how-it-works";
import { formatMoney } from "./money";
import { PASS_PRICES } from "./pass";

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
              });
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
    const stake = howItWorks("stake", { ...facts, rules: own });
    for (const m of [1500, 50, 200, 250])
      expect(stake).toContain(formatMoney(m, "GBP"));
    const late = howItWorks("late_and_missed", { ...facts, rules: own });
    expect(late).toContain("12 hours");
    expect(late).toContain("2 hours");
  });

  it("says there is nothing to pay in a house with no Stake", () => {
    const none = { ...facts, rules: { ...rules, stakeMinor: 0 } };
    expect(howItWorks("stake", none)).toMatch(/no Stake/);
    expect(howItWorks("late_and_missed", none)).not.toMatch(/£/);
    expect(howItWorks("covering", none)).not.toMatch(/forfeit/);
  });

  it("gives the Pass's real prices in the house's currency", () => {
    for (const currency of ["GBP", "USD"] as const) {
      const said = howItWorks("house_pass", {
        ...facts,
        rules: { ...rules, currency },
      });
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
    expect(howItWorks("time_away", { ...facts, awayMakeup: 0 })).toContain(
      "not at all",
    );
    expect(howItWorks("fair_shares", { ...facts, awayMakeup: 50 })).toContain(
      "by half",
    );
  });

  it("only talks about parents and kids in a family", () => {
    expect(howItWorks("family", facts)).toMatch(/not a family/);
    expect(howItWorks("family", { ...facts, family: true })).toMatch(
      /parent's OK/,
    );
  });
});
