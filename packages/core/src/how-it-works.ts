/**
 * How Jonz works, for Ask Jonz to explain: one short piece per topic, with
 * this house's own numbers in it (its Stake, its forfeits, its hours, its
 * prices). The words come from the app's own copy and the rules in code
 * (stake.ts, pass.ts, the deal), so Jonz explains what the app does, not
 * what a model guesses it does. Claude reads a topic with the how_it_works
 * tool, then walks the person through it with their numbers from the other
 * reads (balances, stake, why_john).
 */
import { APP_NAME } from "./app";
import type { HouseRules } from "./domain";
import { formatMoney } from "./money";
import { PASS_ENFORCED, PASS_PRICES, PASS_TRIAL_DAYS } from "./pass";
import { TOURS, tourStepWords, type TourId } from "./tours";
import { makeupKey } from "./word-keys";
import type { Words } from "./words-for";

export const HOW_TOPICS = [
  "today",
  "week",
  "house",
  "fair_shares",
  "deal",
  "points",
  "late_and_missed",
  "covering",
  "stake",
  "settle_up",
  "house_pass",
  "time_away",
  "on_call",
  "swaps",
  "ticks_and_questions",
  "history_and_resets",
  "family",
] as const;
export type HowTopic = (typeof HOW_TOPICS)[number];

/** What the pieces need to know about the house to use its own numbers. */
export interface HowFacts {
  rules: HouseRules;
  family: boolean;
  /** houses.away_makeup: 100 in full, 50 by half, 0 not at all. */
  awayMakeup: number;
}

/** A page's tour as the guide's lines: what each lit thing is, and what it's for. */
const tourLines = (id: TourId, words: Words) =>
  TOURS[id].steps.map((step) => words("door.guide.page.tourStep", tourStepWords(id, step, words)));

/** One topic, in plain lines, with the house's numbers. */
export function howItWorks(topic: HowTopic, { rules, family, awayMakeup }: HowFacts, words: Words): string {
  const money = (minor: number) => formatMoney(minor, rules.currency, words);
  const makeup = words(`house.page.makeup.${makeupKey(awayMakeup)}`);
  const prices = PASS_PRICES[rules.currency];
  const staked = rules.stakeMinor > 0;
  const lines = (...said: string[]) => said.filter(Boolean).join("\n");
  switch (topic) {
    case "today":
      return lines(words("door.guide.page.today.lead"), ...tourLines("today", words));
    case "week":
      return lines(words("door.guide.page.week.lead"), ...tourLines("week", words));
    case "house":
      return lines(
        words("door.guide.page.house.lead"),
        ...tourLines("house", words),
        words("door.guide.page.house.setUp"),
        ...tourLines("setUp", words),
      );
    case "fair_shares":
      return lines(
        words("house.page.rulesSharesBody", { makeup }),
        words("door.guide.page.fair.maths"),
        words("door.guide.page.fair.share"),
        words("door.guide.page.fair.done"),
        words("door.guide.page.fair.missed"),
        words("door.guide.page.fair.standing"),
        words("door.guide.page.fair.deal"),
        words(`door.guide.page.fair.away.${awayMakeup >= 100 ? "full" : awayMakeup > 0 ? "half" : "none"}`, { makeup }),
      );
    case "deal":
      return lines(
        words("door.guide.page.deal.lead", { app: APP_NAME, mode: words(`week.steady.modeName.${rules.dealMode}`) }),
        words("door.guide.page.deal.smart", { meta: words("week.steady.modeMeta.smart") }),
        words("door.guide.page.deal.classic", { meta: words("week.steady.modeMeta.classic") }),
        words("door.guide.page.deal.line", { line: words("week.steady.modeFoot") }),
        words("door.guide.page.deal.effort", { budget: words("week.steady.budgetEach", { budget: rules.dealBudget }), foot: words("week.steady.budgetFoot") }),
        words("door.guide.page.deal.who"),
        words("door.guide.page.deal.away"),
        words("door.guide.page.deal.why"),
      );
    case "points":
      return lines(words("door.guide.page.points.scale"), words("door.guide.page.points.count"));
    case "late_and_missed":
      return lines(
        words("door.guide.page.late.late", { hours: rules.lateHours }),
        staked
          ? words("door.guide.page.late.countsStake", { late: money(rules.lateForfeitMinor), missed: money(rules.missedForfeitMinor) })
          : words("door.guide.page.late.counts"),
        words("door.guide.page.late.cover", { hours: rules.coverGraceHours }),
      );
    case "covering":
      return lines(
        words("door.guide.page.covering.lead", { hours: rules.coverGraceHours }),
        words("door.guide.page.covering.counts"),
        staked ? words("door.guide.page.covering.forfeit") : "",
      );
    case "stake": {
      if (!staked) return words("door.guide.page.stake.none");
      const stake = money(rules.stakeMinor);
      const late = money(rules.lateForfeitMinor);
      const missed = money(rules.missedForfeitMinor);
      const both = rules.lateForfeitMinor + rules.missedForfeitMinor;
      return lines(
        words("door.guide.page.stake.lead", { stake }),
        words("door.guide.page.stake.keep", { late, missed }),
        words("door.guide.page.stake.cap", { stake }),
        words("door.guide.page.stake.shared"),
        words("door.guide.page.stake.differences"),
        words("door.guide.page.stake.example", { stake, late, missed, both: money(both), third: money(Math.floor(both / 3)) }),
        words("door.guide.page.stake.real"),
      );
    }
    case "settle_up":
      return lines(words("door.guide.page.settle.balances"), words("door.guide.page.settle.payments"), words("door.guide.page.settle.splitwise"));
    case "house_pass":
      return lines(
        words("house.pass.lead"),
        words("door.guide.page.pass.adds", {
          stake: words("house.pass.stake"),
          stakeMeta: words("house.pass.stakeMeta").toLowerCase(),
          table: words("house.pass.table"),
          tableMeta: words("house.pass.tableMeta").toLowerCase(),
          photos: words("house.pass.photos"),
          photosMeta: words("house.pass.photosMeta").toLowerCase(),
          history: words("house.pass.history").toLowerCase(),
        }),
        words("house.pass.free"),
        words("door.guide.page.pass.prices", {
          yearly: money(prices.yearly),
          perMonth: money(Math.round(prices.yearly / 12)),
          monthly: money(prices.monthly),
          founding: money(prices.founding),
          days: PASS_TRIAL_DAYS,
        }),
        words("house.pass.money"),
        words("house.pass.hardship"),
        PASS_ENFORCED ? "" : words("door.guide.page.pass.open"),
      );
    case "time_away":
      return lines(words("door.guide.page.away.book"), words("door.guide.page.away.makeup", { makeup }));
    case "on_call":
      return lines(words("door.guide.page.onCall.what"), words("door.guide.page.onCall.flag"));
    case "swaps":
      return lines(words("door.guide.page.swaps.ask"), words("house.page.rulesSwapBody"));
    case "ticks_and_questions":
      return lines(words("door.guide.page.ticks.question", { hours: rules.disputeHours }), words("door.guide.page.ticks.photo"));
    case "history_and_resets":
      return lines(words("door.guide.page.history.list"), words("door.guide.page.history.resets"));
    case "family":
      return family
        ? lines(words("door.guide.page.family.parents"), words("door.guide.page.family.ok"), words("door.guide.page.family.money"))
        : words("door.guide.page.family.not");
  }
}

/**
 * The guide: the same pieces as Ask Jonz reads, for people to read, with
 * the house's own numbers. Each topic's title and a line on what it covers;
 * Help's Read the guide opens the list, grouped as here.
 */
export function guideTopic(topic: HowTopic, words: Words): { title: string; meta: string } {
  return { title: words(`door.guide.topic.${topic}.title`), meta: words(`door.guide.topic.${topic}.meta`) };
}

/** The guide's sections, each labelled door.guide.section.<key>. */
const GUIDE_SECTIONS: readonly { key: "start" | "how" | "money" | "family"; topics: readonly HowTopic[] }[] = [
  { key: "start", topics: ["today", "week", "house"] },
  {
    key: "how",
    topics: ["deal", "points", "fair_shares", "ticks_and_questions", "late_and_missed", "covering", "swaps", "on_call", "time_away", "history_and_resets"],
  },
  { key: "money", topics: ["stake", "settle_up", "house_pass"] },
  { key: "family", topics: ["family"] },
];

/** The guide's sections for this kind of house: a family has no Stake to settle, and only a family reads about families. */
export function guideSections(family: boolean, words: Words): { label: string; topics: HowTopic[] }[] {
  const leftOut: readonly HowTopic[] = family ? ["stake", "settle_up"] : ["family"];
  return GUIDE_SECTIONS.map((s) => ({ label: words(`door.guide.section.${s.key}`), topics: s.topics.filter((t) => !leftOut.includes(t)) })).filter((s) => s.topics.length > 0);
}

/** Whether a guide address names a topic. */
export function isHowTopic(topic: string): topic is HowTopic {
  return (HOW_TOPICS as readonly string[]).includes(topic);
}

/**
 * A piece as Markdown for the guide's page (drawn as Jonz's replies are):
 * its "- " lines a list, its other lines paragraphs.
 */
export function guideMarkdown(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines
    .map((line, i) => {
      const item = line.startsWith("- ");
      const after = i === 0 ? "" : item && lines[i - 1].startsWith("- ") ? "\n" : "\n\n";
      // A paragraph's own Markdown marks stay words: a leading number isn't a list, a star isn't bold.
      const said = line.replace(/([*_`[\]<>#])/g, "\\$1").replace(/^(\d+)\./, "$1\\.");
      return after + (item ? `- ${said.slice(2)}` : said);
    })
    .join("");
}
