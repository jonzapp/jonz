import { describe, expect, it } from "vitest";

import * as copy from "./copy";
import {
  APP_NAME,
  ERROR_COPY,
  AWAY_COPY,
  FOCUS_SHELL_COPY,
  DEAL_COPY,
  FRONT_DOOR,
  GROUPS_COPY,
  INVITE_COPY,
  JOHN_LIST_COPY,
  JOIN_COPY,
  LOOK_LABEL,
  LOOKS,
  lookOf,
  NEW_HOUSE_COPY,
  NOT_FOUND_COPY,
  NO_HOUSE_COPY,
  PAGE_TITLE,
  pageTitle,
  REMINDERS_COPY,
  RULES_COPY,
  SECTION_LABEL,
  SECTIONS,
  SHELL_COPY,
  SIGN_IN_COPY,
  STAKE_HISTORY_COPY,
  TABLE_COPY,
  TAGLINE,
} from "./copy";
import { EN, type WordId } from "./locales";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const signIn = Object.values(SIGN_IN_COPY).flatMap((value) =>
  typeof value === "function" ? [value("Google"), value("Apple")] : [value],
);
const house = [
  ...Object.values(NEW_HOUSE_COPY),
  ...Object.values(NO_HOUSE_COPY),
  ...Object.values(JOIN_COPY).filter((value) => typeof value === "string"),
  JOIN_COPY.alreadyIn("Flat 3"),
  JOIN_COPY.livesHere(1),
  JOIN_COPY.livesHere(4),
  JOIN_COPY.join("Flat 3"),
];
const today = [
  ...Object.values(INVITE_COPY).filter((v) => typeof v === "string"),
  ...(Object.keys(EN) as WordId[]).filter((id) => /^(today\.page|john\.row)\./.test(id) && !EN[id].includes("{")).map((id) => words(id)),
  words('today.page.thisWeekRange', { range: "12–18 Oct" }),
  words('today.page.left', { count: 1 }),
  words('today.page.left', { count: 3 }),
  words('today.page.streak', { weeks: 1 }),
  words('today.page.streak', { weeks: 4 }),
  words('john.row.standsIn', { when: "in 3 hours" }),
  words('john.row.disputed', { reason: "Still filthy" }),
  words('john.row.votes', { uphold: 1, reject: 2, closes: "in 5 hours" }),
  words('john.row.dueBeforeYouGo', { was: "Fri 21:00" }),
  words('today.notDealt.nothingThisWeek'),
  words('today.notDealt.nothingThisWeekBody'),
  INVITE_COPY.shareTitle("Flat 3"),
];
const lines = [
  APP_NAME,
  TAGLINE,
  FRONT_DOOR.headline,
  FRONT_DOOR.signIn,
  ...signIn,
  ...house,
  ...today,
];

describe("the words before signing in", () => {
  it("never call it a rota or a chore app", () => {
    for (const text of lines) expect(text).not.toMatch(/\brota\b|chore app/i);
  });

  it("carry no emoji", () => {
    for (const text of lines) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("SIGN_IN_COPY", () => {
  it("names the provider that didn’t finish", () => {
    expect(SIGN_IN_COPY.failed("Google")).toBe("Google didn’t finish signing you in. Try again.");
    expect(SIGN_IN_COPY.failed("Apple")).toBe("Apple didn’t finish signing you in. Try again.");
  });
});

describe("JOIN_COPY", () => {
  it("counts the house in words", () => {
    expect(JOIN_COPY.livesHere(1)).toBe("1 person lives here. Join and you’re dealt Johns from next week.");
    expect(JOIN_COPY.livesHere(3)).toBe("3 people live here. Join and you’re dealt Johns from next week.");
    expect(JOIN_COPY.alreadyIn("Flat 3")).toBe("You’re already in Flat 3");
    expect(JOIN_COPY.join("Flat 3")).toBe("Join Flat 3");
  });
});

describe("Today’s words", () => {
  it("counts in words", () => {
    expect(words('today.page.left', { count: 1 })).toBe("John left this week");
    expect(words('today.page.left', { count: 0 })).toBe("Johns left this week");
    expect(words('today.page.streak', { weeks: 1 })).toBe("1 week");
    expect(words('today.page.streak', { weeks: 2 })).toBe("2 weeks");
  });
});

describe("a John’s row, on time away", () => {
  it("says whose trip pulled a John forward", () => {
    expect(words('john.row.dueBeforeYouGo', { was: "sat 09:00" })).toBe("Due before you go: it was due sat 09:00, while you’re away.");
    expect(words('john.row.dueBeforeTheyGo', { owner: "Ben", was: "sat 09:00" })).toBe("Due before Ben goes: it was due sat 09:00, while they’re away.");
  });
});

describe("Week’s table words", () => {
  it("counts and tallies in words", () => {
    expect(words('week.table.doneOf', { done: 0, total: 0 })).toBe("0 of 0");
    expect(words('week.table.doneOf', { done: 3, total: 7 })).toBe("3 of 7");
    expect(words('week.table.tally', { uphold: 1, reject: 0, closes: "in 5h" })).toBe("0 done, 1 not done, closes in 5h");
    expect(words('week.table.disputeOn', { john: "Bins", reason: "Still full" })).toBe("Bins: “Still full”");
  });
});

describe("a dispute’s words", () => {
  it("names the John and whose tick it is", () => {
    expect(words('john.dispute.title', { john: "Bins" })).toBe("Was Bins really done?");
    expect(words('john.dispute.body', { owner: "Ben" })).toBe(
      "Ben’s tick goes to a house vote. If the house agrees with you, the John opens again.",
    );
  });
});

describe("SECTIONS", () => {
  it("names every screen once, in the house’s words", () => {
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
    expect(SECTIONS.map((s) => SECTION_LABEL[s])).toEqual(["Today", "Week", "Wall", "Table", "Stake", "House"]);
  });

  it("counts the house and your standing in words", () => {
    expect(SHELL_COPY.standing(0, 1)).toBe("0-week streak, 1 skip");
    expect(SHELL_COPY.standing(5, 0)).toBe("5-week streak, 0 skips");
  });
});

describe("TABLE_COPY", () => {
  it("tells a record without the zeros", () => {
    expect(TABLE_COPY.record({ done: 3, late: 0, missed: 0 })).toBe("3 done");
    expect(TABLE_COPY.record({ done: 0, late: 1, missed: 2 })).toBe("0 done, 1 late, 2 missed");
  });

  it("says where you stand against your share", () => {
    expect(TABLE_COPY.shareLine(-4, 1)).toMatch(/for about 1 week\.$/);
    expect(TABLE_COPY.shareLine(-0.5, 3)).toMatch(/^Points behind your share.*about 3 weeks\.$/);
    expect(TABLE_COPY.shareLine(0.5, 0)).toBe("Points ahead of your share, so the next weeks go a little easier on you.");
    expect(TABLE_COPY.shareLine(0.49, 0)).toBe("You’ve done your share.");
    expect(TABLE_COPY.shareLine(-0.49, 0)).toBe("You’ve done your share.");
  });

  it("names the rules’ numbers from the rules", () => {
    expect(TABLE_COPY.sharesBody).toMatch(/since you joined/);
    expect(TABLE_COPY.rules[1].body).toMatch(/^Every 4 clean weeks/);
    expect(TABLE_COPY.weeks(1)).toBe("1 week");
  });
});

describe("JOHN_LIST_COPY", () => {
  it("says how often and when, short", () => {
    expect(JOHN_LIST_COPY.when(1, "Sunday", "21:00")).toBe("Every week, due Sun 21:00");
    expect(JOHN_LIST_COPY.when(4, "Monday", "09:30")).toBe("Every 4 weeks, due Mon 09:30");
    expect(JOHN_LIST_COPY.when(6, "Friday", "18:00")).toBe("Every 6 weeks, due Fri 18:00");
  });

  it("rounds the house’s weekly effort", () => {
    expect(JOHN_LIST_COPY.perWeek(0)).toMatch(/^About 0 points a week/);
    expect(JOHN_LIST_COPY.perWeek(7.5)).toMatch(/^About 8 points a week/);
  });
});

describe("DEAL_COPY", () => {
  it("calls giving out the week the deal", () => {
    expect(DEAL_COPY.again).toBe("Re-deal this week");
  });
});

describe("RULES_COPY", () => {
  it("names the amounts in the house’s currency", () => {
    expect(RULES_COPY.stake("£")).toBe("Monthly stake (£)");
    expect(RULES_COPY.missed("€")).toBe("Missed forfeit (€)");
  });

  it("says each dispute window and make-up rate", () => {
    expect(RULES_COPY.disputeHours(0)).toBe("No disputes (honour system)");
    expect(RULES_COPY.disputeHours(48)).toBe("48 hours after a tick");
    for (const n of [100, 50, 0]) expect(RULES_COPY.makeupHint[n]).toBeTruthy();
    expect(RULES_COPY.phoneZone("America/New_York")).toBe("Use this phone’s: America/New York");
  });
});

describe("GROUPS_COPY", () => {
  it("names the group being edited", () => {
    expect(GROUPS_COPY.edit("Upstairs")).toBe("Edit Upstairs");
  });
});

describe("AWAY_COPY", () => {
  it("counts the Johns booking moved", () => {
    expect(AWAY_COPY.moved(1)).toBe("1 of your Johns falls due while you’re away, so it’s now due before you go.");
    expect(AWAY_COPY.moved(3)).toBe("3 of your Johns fall due while you’re away, so they’re now due before you go.");
    expect(AWAY_COPY.moved(0, 1, 0)).toBe(
      "1 was due too soon to do first, so it’s gone to someone else, who’s been told. Cancel and it comes back to you.",
    );
    expect(AWAY_COPY.moved(1, 0, 2)).toBe(
      "1 of your Johns falls due while you’re away, so it’s now due before you go. 2 were skipped, with nobody home to take them.",
    );
  });

  it("tells you on Today when you’re away, and what your share does", () => {
    expect(AWAY_COPY.banner("26–28 Oct", false)).toBe("You’re away 26–28 Oct.");
    expect(AWAY_COPY.banner("Wed 28 Oct", true)).toBe("You’re away until Wed 28 Oct.");
    expect(AWAY_COPY.bannerBody(100)).toMatch(/, but your share still counts/);
    expect(AWAY_COPY.bannerBody(50)).toMatch(/, but half your share still counts/);
    expect(AWAY_COPY.bannerBody(0)).toBe("Nobody hands you a John due while you’re gone.");
  });

  it("says a day of the month calendar, its key and its sheet", () => {
    expect(AWAY_COPY.dayLabel("Sunday 8 November", 3)).toBe("Sunday 8 November, 3 away");
    expect(AWAY_COPY.dayLabel("Monday 2 November", 0)).toBe("Monday 2 November, everyone home");
    expect([1, 2, 3, 5].map(AWAY_COPY.shade)).toEqual(["1 away", "2 away", "3 or more", "3 or more"]);
    expect(AWAY_COPY.dayCount(3, 2)).toBe("3 away, 2 home");
    expect(AWAY_COPY.backOn("Tue 10 Nov")).toBe("Back Tue 10 Nov");
  });
});

describe("pageTitle", () => {
  it("names the page, then the app, as the web’s tab does", () => {
    expect(pageTitle(PAGE_TITLE.today)).toBe("Today · Jonz");
    expect(pageTitle(PAGE_TITLE.week)).toBe("This week · Jonz");
    expect(pageTitle()).toBe("Jonz");
    expect(pageTitle("")).toBe("Jonz");
  });
});

describe("the pages around the house", () => {
  it("has not-found and error words", () => {
    expect(NOT_FOUND_COPY.back).toBe("Back to your Johns");
    expect(NOT_FOUND_COPY.backToDoor).toBe("Back to the front door");
    expect(PAGE_TITLE.welcome).toBe(NO_HOUSE_COPY.heading);
    expect(ERROR_COPY.retry).toBe("Try again");
  });
});

describe("looks", () => {
  it("names day, night and auto", () => {
    expect(LOOKS.map((l) => LOOK_LABEL[l])).toEqual(["Day", "Night", "Auto"]);
  });

  it("reads a saved look, and anything else as following the device", () => {
    expect(lookOf("dark")).toBe("dark");
    expect(lookOf("light")).toBe("light");
    expect(lookOf("system")).toBe("system");
    expect(lookOf(null)).toBe("system");
    expect(lookOf(undefined)).toBe("system");
    expect(lookOf("sepia")).toBe("system");
  });
});

describe("REMINDERS_COPY", () => {
  it("tells an iPhone to install first", () => {
    expect(REMINDERS_COPY.unsupported).toMatch(/home screen/);
  });
});

describe("FOCUS_SHELL_COPY", () => {
  it("speaks Today’s badge, and leaves a tab with none as its name", () => {
    expect(FOCUS_SHELL_COPY.tab("Today", 2)).toBe("Today, 2 waiting for your vote");
    expect(FOCUS_SHELL_COPY.tab("Today", 0)).toBe("Today");
    expect(FOCUS_SHELL_COPY.tab("Week", 0)).toBe("Week");
  });

  it("counts what a fold holds", () => {
    expect(FOCUS_SHELL_COPY.done(0)).toBe("Done (0)");
    expect(FOCUS_SHELL_COPY.done(2)).toBe("Done (2)");
  });
});

describe("STAKE_HISTORY_COPY", () => {
  it("says the stake under its title", () => {
    expect(STAKE_HISTORY_COPY.sub("£20")).toBe("£20 a month each");
  });
});

describe("Focus’s word objects", () => {
  const FOCUS = [
    "HOUSE_PAGE_COPY",
    "PERSON_COPY",
    "STAKE_HISTORY_COPY",
    "WALL_FEED_COPY",
    "HOUSE_LOWER_COPY",
    "SETUP_COPY",
    "FRONT_DOOR_COPY",
  ];

  it("sit together in the order of the app, one per part of it", () => {
    // Vitest keeps the module's exports in the order they're written.
    const names = Object.keys(copy).filter((name) => FOCUS.includes(name));
    expect(names).toEqual(FOCUS);
    for (const name of names) expect(typeof copy[name as keyof typeof copy]).toBe("object");
  });
});

/** Every sentence an export holds: strings, lists and objects of them (functions are tested one by one). */
function sentences(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(sentences);
  if (value && typeof value === "object") return Object.values(value).flatMap(sentences);
  return [];
}

/** What each sentence-making function says with stand-in words in its places: enough to read its own words. */
function spoken(value: unknown): string[] {
  if (typeof value === "function") {
    try {
      const out: unknown = value("Sam", "Priya", "Tom");
      return typeof out === "string" ? [out] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap(spoken);
  if (value && typeof value === "object") return Object.values(value).flatMap(spoken);
  return [];
}

describe("every word in copy.ts", () => {
  const all = Object.values(copy).flatMap(sentences);
  const said = Object.values(copy).flatMap(spoken);

  it("is there to check", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("never calls it a rota or a chore app", () => {
    for (const text of all) expect(text).not.toMatch(/\brota\b|chore app/i);
  });

  it("carries no emoji", () => {
    for (const text of all) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("writes every apostrophe curly, in the sentences that take names too", () => {
    expect(said.length).toBeGreaterThan(100);
    for (const text of [...all, ...said]) expect(text).not.toContain("'");
  });
});
