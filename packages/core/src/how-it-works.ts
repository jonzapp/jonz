/**
 * How Jonz works, for Ask Jonz to explain: one short piece per topic, with
 * this house's own numbers in it (its Stake, its forfeits, its hours, its
 * prices). The words come from the app's own copy and the rules in code
 * (stake.ts, pass.ts, the deal), so Jonz explains what the app does, not
 * what a model guesses it does. Claude reads a topic with the how_it_works
 * tool, then walks the person through it with their numbers from the other
 * reads (balances, stake, why_john).
 */
import { APP_NAME } from "./copy";
import type { HouseRules } from "./domain";
import { formatMoney } from "./money";
import { PASS_ENFORCED, PASS_PRICES, PASS_TRIAL_DAYS } from "./pass";
import { TOURS, type TourId } from "./tours";
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
const tourLines = (id: TourId) => TOURS[id].steps.map((step) => `- ${step.title}: ${step.body}`);

/** "2 hours", "1 hour". */
const hours = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;

/** One topic, in plain lines, with the house's numbers. */
export function howItWorks(
  topic: HowTopic,
  { rules, family, awayMakeup }: HowFacts, words: Words,
): string {
  const money = (minor: number) => formatMoney(minor, rules.currency);
  const makeup =
    words(`house.page.makeup.${makeupKey(awayMakeup)}`);
  const prices = PASS_PRICES[rules.currency];
  switch (topic) {
    case "today":
      return ["Today is your own page: what's yours to do, and what needs you.", ...tourLines("today")].join("\n");
    case "week":
      return ["The week shows the whole house: who has which John, and how it's going.", ...tourLines("week")].join("\n");
    case "house":
      return [
        "House is the house as a whole: how everyone's doing, what's been happening, and how it's set up.",
        ...tourLines("house"),
        "Admins set the house up:",
        ...tourLines("setUp"),
      ].join("\n");
    case "fair_shares":
      return [
        words('house.page.rulesSharesBody', { makeup }),
        "The maths, per person, from the day they joined:",
        "- Their share: for every John dealt, its points are split between everyone who shares it (everyone at home that day, or the group it belongs to), and their part is added to their share.",
        "- Done: the points of every John they actually did, on time or late, plus any they covered for someone else. A John done together splits its points between the people who did it.",
        "- A missed John counts for nobody: it adds to the share but nobody's done.",
        "- Standing = done minus share. Below zero is behind, above zero is ahead. Everyone's numbers are under Is it fair? on the Week page.",
        "- The deal hands the next John to whoever is furthest behind, so standings drift back towards even. Someone behind gets a little more, but never more than half as much again as a usual week.",
        `- Time away is made up ${makeup}: the share for days away ${awayMakeup >= 100 ? "is caught up a little each week once back" : awayMakeup > 0 ? "is half caught up, a little each week once back" : "goes to whoever is home, so there's nothing to catch up"}.`,
      ].join("\n");
    case "deal":
      return [
        `The deal: at the start of each week ${APP_NAME} deals the John list out between the people at home. This house uses ${words(`week.steady.modeName.${rules.dealMode}`)}.`,
        `- Smart: ${words('week.steady.modeMeta.smart')}`,
        `- Classic: ${words('week.steady.modeMeta.classic')}`,
        `- ${words('week.steady.modeFoot')}`,
        `- Effort each week: ${words('week.steady.budgetEach', { budget: rules.dealBudget })}. ${words('week.steady.budgetFoot')}`,
        "- Who gets a John is decided by fair shares: whoever is furthest behind, skipping anyone who did it last time when someone else is as far behind, and anyone already handed the most extra a week gives.",
        "- People away that day are left out. Every John on the list has a day; a John that keeps its day is always dealt on it.",
        "- Each John's sheet has a Why? that shows exactly how its deal added up.",
      ].join("\n");
    case "points":
      return [
        "Points are effort, not time exactly: 1 is about 5 minutes, 2 about 15, 3 about 30, 5 about an hour, 8 to 10 half a day, up to 20 a whole day.",
        "Fair shares and the weekly budget both count points, so a big John counts for more than a small one. Similar jobs should have similar points; an admin can change a John's points on the John list.",
      ].join("\n");
    case "late_and_missed":
      return [
        `A John is late once its due time passes. It can still be done late for ${hours(rules.lateHours)}; after that it's missed.`,
        `Late still counts as done for fair shares${rules.stakeMinor > 0 ? `, but costs ${money(rules.lateForfeitMinor)} from the Stake` : ""}. Missed counts for nobody${rules.stakeMinor > 0 ? ` and costs ${money(rules.missedForfeitMinor)}` : ""}.`,
        `${hours(rules.coverGraceHours)} after it's due, someone else can cover it instead.`,
      ].join("\n");
    case "covering":
      return [
        `For ${hours(rules.coverGraceHours)} after its due time a John is only its holder's. After that anyone in the house can do it for them: that's covering.`,
        "A covered John counts as the coverer's work in fair shares, not the holder's.",
        rules.stakeMinor > 0
          ? "The holder's forfeit for it goes whole to whoever covered it, instead of being shared round the house."
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "stake":
      return rules.stakeMinor <= 0
        ? "This house has no Stake: nothing costs money. An admin can set one in House rules."
        : [
            `The Stake: everyone in the house stakes ${money(rules.stakeMinor)} a month. Nobody pays it in; it's just the most anyone can lose in a month.`,
            `- Finish your Johns and you keep it all. A late John forfeits ${money(rules.lateForfeitMinor)}, a missed one ${money(rules.missedForfeitMinor)}.`,
            `- Nobody loses more than ${money(rules.stakeMinor)} in a month: anything over that is given back at month end.`,
            "- What someone forfeits is shared equally between the rest of the house at month end. A forfeit for a John someone else covered goes whole to the coverer instead. If it doesn't split evenly, the odd pennies take turns month by month.",
            "- Only the differences change hands: the app adds up who owes whom and suggests the fewest payments. The app never moves money itself.",
            `- Worked example: four people, ${money(rules.stakeMinor)} each. Sam is late once and misses once: ${money(rules.lateForfeitMinor)} + ${money(rules.missedForfeitMinor)} = ${money(rules.lateForfeitMinor + rules.missedForfeitMinor)}. The other three get a third each, about ${money(Math.floor((rules.lateForfeitMinor + rules.missedForfeitMinor) / 3))}, and Sam owes that between them.`,
            "This month's real numbers so far are on the Stake page.",
          ].join("\n");
    case "settle_up":
      return [
        "At the end of each month the forfeits are shared out and everyone's balance is added up: negative owes, positive is owed.",
        "The app suggests the fewest payments that clear every balance. Whoever is owed marks a payment as arrived; nothing is taken automatically.",
        "A house can settle in Jonz, or copy the amounts to Splitwise instead.",
      ].join("\n");
    case "house_pass":
      return [
        `${words('house.pass.lead')}`,
        `What it adds: ${words('house.pass.stake')} (${words('house.pass.stakeMeta').toLowerCase()}), ${words('house.pass.table')} (${words('house.pass.tableMeta').toLowerCase()}), ${words('house.pass.photos')} (${words('house.pass.photosMeta').toLowerCase()}), ${words('house.pass.history').toLowerCase()}, and changing the John list with Ask Jonz.`,
        words('house.pass.free'),
        `Prices: ${formatMoney(prices.yearly, rules.currency)} a year (about ${formatMoney(Math.round(prices.yearly / 12), rules.currency)} a month), or ${formatMoney(prices.monthly, rules.currency)} a month; Founding houses ${formatMoney(prices.founding, rules.currency)} once, for life. Every new house gets a free month (${PASS_TRIAL_DAYS} days) first.`,
        `Why it costs anything: ${words('house.pass.money').replace("Where the money goes: ", "")}`,
        words('house.pass.hardship'),
        PASS_ENFORCED
          ? ""
          : "Right now nothing is locked: every house keeps everything while the Pass is new.",
      ]
        .filter(Boolean)
        .join("\n");
    case "time_away":
      return [
        "Book time away on the Days and time away page. On days away you're left out of the deal, so nothing is dealt to you.",
        `Your share for those days is made up ${makeup} (an admin sets this in House rules).`,
      ].join("\n");
    case "on_call":
      return [
        "On-call Johns are done when they're needed (the bin when it's full) rather than on a day. Each week one person is on call for each.",
        "Anyone can flag that it needs doing; whoever is on call then has a set number of hours to do it. It counts towards fair shares like any other John.",
      ].join("\n");
    case "swaps":
      return [
        "You can ask someone to swap one of your Johns this week for one of theirs. Nothing changes until they say yes.",
        words('house.page.rulesSwapBody'),
      ].join("\n");
    case "ticks_and_questions":
      return [
        `Tick a John when it's done. A housemate can question a tick for ${hours(rules.disputeHours)}: it goes to a house vote, and if the house agrees it wasn't done, the John opens again.`,
        "Some Johns need a photo with the tick.",
      ].join("\n");
    case "history_and_resets":
      return [
        "History lists every move in the house, newest first, and most moves can be undone from it.",
        "Admins can put mistakes right with resets: change a John's result, open someone's week again, re-deal or skip a week, or let off a month's forfeits.",
      ].join("\n");
    case "family":
      return family
        ? [
            "In a family, admins are called parents and members kids.",
            "A kid's tick waits for a parent's OK before it counts.",
            "Johns can earn pocket money, up to a monthly cap a parent sets.",
          ].join("\n")
        : "This house is housemates, not a family.";
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

const GUIDE_SECTIONS: readonly { label: string; topics: readonly HowTopic[] }[] = [
  { label: "Getting started", topics: ["today", "week", "house"] },
  {
    label: "How it works",
    topics: ["deal", "points", "fair_shares", "ticks_and_questions", "late_and_missed", "covering", "swaps", "on_call", "time_away", "history_and_resets"],
  },
  { label: "Money", topics: ["stake", "settle_up", "house_pass"] },
  { label: "Your family", topics: ["family"] },
];

/** The guide's sections for this kind of house: a family has no Stake to settle, and only a family reads about families. */
export function guideSections(family: boolean): { label: string; topics: HowTopic[] }[] {
  const leftOut: readonly HowTopic[] = family ? ["stake", "settle_up"] : ["family"];
  return GUIDE_SECTIONS.map((s) => ({ label: s.label, topics: s.topics.filter((t) => !leftOut.includes(t)) })).filter((s) => s.topics.length > 0);
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
