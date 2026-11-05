/**
 * How Jonz works, for Ask Jonz to explain: one short piece per topic, with
 * this house's own numbers in it (its Stake, its forfeits, its hours, its
 * prices). The words come from the app's own copy and the rules in code
 * (stake.ts, pass.ts, the deal), so Jonz explains what the app does, not
 * what a model guesses it does. Claude reads a topic with the how_it_works
 * tool, then walks the person through it with their numbers from the other
 * reads (balances, stake, why_john).
 */
import { APP_NAME, HOUSE_PAGE_COPY, PASS_COPY, STEADY_COPY } from "./copy";
import type { HouseRules } from "./domain";
import { formatMoney } from "./money";
import { PASS_ENFORCED, PASS_PRICES, PASS_TRIAL_DAYS } from "./pass";

export const HOW_TOPICS = [
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

/** "2 hours", "1 hour". */
const hours = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;

/** One topic, in plain lines, with the house's numbers. */
export function howItWorks(
  topic: HowTopic,
  { rules, family, awayMakeup }: HowFacts,
): string {
  const money = (minor: number) => formatMoney(minor, rules.currency);
  const makeup =
    HOUSE_PAGE_COPY.makeup[awayMakeup] ?? HOUSE_PAGE_COPY.makeup[100];
  const prices = PASS_PRICES[rules.currency];
  switch (topic) {
    case "fair_shares":
      return [
        HOUSE_PAGE_COPY.rulesSharesBody(makeup),
        "The maths, per person, from the day they joined:",
        "- Their share: for every John dealt, its points are split between everyone who shares it (everyone at home that day, or the group it belongs to), and their part is added to their share.",
        "- Done: the points of every John they actually did, on time or late, plus any they covered for someone else. A John done together splits its points between the people who did it.",
        "- A missed John counts for nobody: it adds to the share but nobody's done.",
        "- Standing = done minus share. Below zero is behind, above zero is ahead. The balances read gives each person's numbers.",
        "- The deal hands the next John to whoever is furthest behind, so standings drift back towards even. Someone behind gets a little more, but never more than half as much again as a usual week.",
        `- Time away is made up ${makeup}: the share for days away ${awayMakeup >= 100 ? "is caught up a little each week once back" : awayMakeup > 0 ? "is half caught up, a little each week once back" : "goes to whoever is home, so there's nothing to catch up"}.`,
      ].join("\n");
    case "deal":
      return [
        `The deal: at the start of each week ${APP_NAME} deals the John list out between the people at home. This house uses ${STEADY_COPY.modeName[rules.dealMode]}.`,
        `- Smart: ${STEADY_COPY.modeMeta.smart}`,
        `- Classic: ${STEADY_COPY.modeMeta.classic}`,
        `- ${STEADY_COPY.modeFoot}`,
        `- Effort each week: ${STEADY_COPY.budgetEach(rules.dealBudget)}. ${STEADY_COPY.budgetFoot}`,
        "- Who gets a John is decided by fair shares: whoever is furthest behind, skipping anyone who did it last time when someone else is as far behind, and anyone already handed the most extra a week gives.",
        "- People away that day are left out. Every John on the list has a day; a John that keeps its day is always dealt on it.",
        "- Each John's sheet has a Why? that shows exactly how its deal added up; the why_john read gives the same.",
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
        `${hours(rules.coverGraceHours)} after it's due, a housemate can cover it instead (see covering).`,
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
            "- Only the differences change hands: the app adds up who owes whom and suggests the fewest payments (see settle_up). The app never moves money itself.",
            `- Worked example: four people, ${money(rules.stakeMinor)} each. Sam is late once and misses once: ${money(rules.lateForfeitMinor)} + ${money(rules.missedForfeitMinor)} = ${money(rules.lateForfeitMinor + rules.missedForfeitMinor)}. The other three get a third each, about ${money(Math.floor((rules.lateForfeitMinor + rules.missedForfeitMinor) / 3))}, and Sam owes that between them.`,
            "The stake read gives this month's real numbers so far.",
          ].join("\n");
    case "settle_up":
      return [
        "At the end of each month the forfeits are shared out and everyone's balance is added up: negative owes, positive is owed.",
        "The app suggests the fewest payments that clear every balance. Whoever is owed marks a payment as arrived; nothing is taken automatically.",
        "A house can settle in Jonz, or copy the amounts to Splitwise instead.",
      ].join("\n");
    case "house_pass":
      return [
        `${PASS_COPY.lead}`,
        `What it adds: ${PASS_COPY.stake} (${PASS_COPY.stakeMeta.toLowerCase()}), ${PASS_COPY.table} (${PASS_COPY.tableMeta.toLowerCase()}), ${PASS_COPY.photos} (${PASS_COPY.photosMeta.toLowerCase()}), ${PASS_COPY.history.toLowerCase()}, and changing the John list with Ask Jonz.`,
        PASS_COPY.free,
        `Prices: ${formatMoney(prices.yearly, rules.currency)} a year (about ${formatMoney(Math.round(prices.yearly / 12), rules.currency)} a month), or ${formatMoney(prices.monthly, rules.currency)} a month; Founding houses ${formatMoney(prices.founding, rules.currency)} once, for life. Every new house gets a free month (${PASS_TRIAL_DAYS} days) first.`,
        `Why it costs anything: ${PASS_COPY.money.replace("Where the money goes: ", "")}`,
        PASS_COPY.hardship,
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
        "You can ask a housemate to swap one of your Johns this week for one of theirs. Nothing changes until they say yes.",
        HOUSE_PAGE_COPY.rulesSwapBody,
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
