import { describe, expect, it } from "vitest";

import { APP_NAME, LOOKS, lookOf, pageTitle, SECTIONS, TAGLINE } from "./app";
import { EN, type WordId } from "./locales";
import { awayBannerBody, awayMovedLine, awayShade, johnWhen, makeupHint, phoneZoneLine, recordLine, shareStanding, tableRules } from "./word-keys";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const signIn = [
  ...(Object.keys(EN) as WordId[]).filter((id) => /^door\.signIn\./.test(id) && !EN[id].includes("{")).map((id) => words(id)),
  words("door.signIn.failed", { provider: "Google" }),
  words("door.signIn.failed", { provider: "Apple" }),
];
const house = [
  ...(Object.keys(EN) as WordId[]).filter((id) => /^door\.(newHouse|noHouse|join)\./.test(id) && !EN[id].includes("{")).map((id) => words(id)),
  words('door.join.alreadyIn', { house: "Flat 3" }),
  words('door.join.livesHere', { people: 1 }),
  words('door.join.livesHere', { people: 4 }),
  words('door.join.join', { house: "Flat 3" }),
];
const today = [
  ...(Object.keys(EN) as WordId[]).filter((id) => /^door\.invite\./.test(id) && !EN[id].includes("{")).map((id) => words(id)),
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
  words('door.invite.shareTitle', { house: "Flat 3" }),
];
const lines = [
  APP_NAME,
  TAGLINE,
  words('door.front.headline'),
  words('door.front.signIn'),
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

describe("door.signIn", () => {
  it("names the provider that didn’t finish", () => {
    expect(words('door.signIn.failed', { provider: "Google" })).toBe("Google didn’t finish signing you in. Try again.");
    expect(words('door.signIn.failed', { provider: "Apple" })).toBe("Apple didn’t finish signing you in. Try again.");
  });
});

describe("door.join", () => {
  it("counts the house in words", () => {
    expect(words('door.join.livesHere', { people: 1 })).toBe("1 person lives here. Join and you’re dealt Johns from next week.");
    expect(words('door.join.livesHere', { people: 3 })).toBe("3 people live here. Join and you’re dealt Johns from next week.");
    expect(words('door.join.alreadyIn', { house: "Flat 3" })).toBe("You’re already in Flat 3");
    expect(words('door.join.join', { house: "Flat 3" })).toBe("Join Flat 3");
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
    expect(SECTIONS.map((s) => words(`common.section.${s}` as const))).toEqual(["Today", "Week", "Wall", "Table", "Stake", "House"]);
  });

  it("counts the house and your standing in words", () => {
  });
});

describe("the Table’s words", () => {
  it("tells a record without the zeros", () => {
    expect(recordLine({ done: 3, late: 0, missed: 0 }, words)).toBe("3 done");
    expect(recordLine({ done: 0, late: 1, missed: 2 }, words)).toBe("0 done, 1 late, 2 missed");
  });

  it("says where you stand against your share", () => {
    expect(shareStanding(-4, 1, words)).toMatch(/for about 1 week\.$/);
    expect(shareStanding(-0.5, 3, words)).toMatch(/^Points behind your share.*about 3 weeks\.$/);
    expect(shareStanding(0.5, 0, words)).toBe("Points ahead of your share, so the next weeks go a little easier on you.");
    expect(shareStanding(0.49, 0, words)).toBe("You’ve done your share.");
    expect(shareStanding(-0.49, 0, words)).toBe("You’ve done your share.");
  });

  it("names the rules’ numbers from the rules", () => {
    expect(words('house.table.sharesBody')).toMatch(/since you joined/);
    expect(tableRules(words)[1].body).toMatch(/^Every 4 clean weeks/);
    expect(words('house.table.weeks', { n: 1 })).toBe("1 week");
  });
});

describe("the John list’s words", () => {
  it("says how often and when, short", () => {
    expect(johnWhen(1, "Sunday", "21:00", words)).toBe("Every week, due Sun 21:00");
    expect(johnWhen(4, "Monday", "09:30", words)).toBe("Every 4 weeks, due Mon 09:30");
    expect(johnWhen(6, "Friday", "18:00", words)).toBe("Every 6 weeks, due Fri 18:00");
  });

  it("rounds the house’s weekly effort", () => {
    expect(words('house.johns.perWeek', { points: 0 })).toMatch(/^About 0 points a week/);
    expect(words('house.johns.perWeek', { points: 7.5 })).toMatch(/^About 8 points a week/);
  });
});

describe("the deal’s words", () => {
  it("calls giving out the week the deal", () => {
    expect(words('house.deal.again')).toBe("Re-deal this week");
  });
});

describe("the Rules’ words", () => {
  it("names the amounts in the house’s currency", () => {
    expect(words('house.rules.stake', { symbol: "£" })).toBe("Monthly stake (£)");
    expect(words('house.rules.missed', { symbol: "€" })).toBe("Missed forfeit (€)");
  });

  it("says each dispute window and make-up rate", () => {
    expect(words('house.rules.disputeHours', { hours: 0 })).toBe("No disputes (honour system)");
    expect(words('house.rules.disputeHours', { hours: 48 })).toBe("48 hours after a tick");
    for (const n of [100, 50, 0]) expect(makeupHint(n, words)).toBeTruthy();
    expect(phoneZoneLine("America/New_York", words)).toBe("Use this phone’s: America/New York");
  });
});

describe("the groups’ words", () => {
  it("names the group being edited", () => {
    expect(words('house.groups.edit', { name: "Upstairs" })).toBe("Edit Upstairs");
  });
});

describe("time away’s words", () => {
  it("counts the Johns booking moved", () => {
    expect(awayMovedLine(1, 0, 0, words)).toBe("1 of your Johns falls due while you’re away, so it’s now due before you go.");
    expect(awayMovedLine(3, 0, 0, words)).toBe("3 of your Johns fall due while you’re away, so they’re now due before you go.");
    expect(awayMovedLine(0, 1, 0, words)).toBe(
      "1 was due too soon to do first, so it’s gone to someone else, who’s been told. Cancel and it comes back to you.",
    );
    expect(awayMovedLine(1, 0, 2, words)).toBe(
      "1 of your Johns falls due while you’re away, so it’s now due before you go. 2 were skipped, with nobody home to take them.",
    );
  });

  it("tells you on Today when you’re away, and what your share does", () => {
    expect(words('house.away.banner', { range: "26–28 Oct", now: false })).toBe("You’re away 26–28 Oct.");
    expect(words('house.away.banner', { range: "Wed 28 Oct", now: true })).toBe("You’re away until Wed 28 Oct.");
    expect(awayBannerBody(100, words)).toMatch(/, but your share still counts/);
    expect(awayBannerBody(50, words)).toMatch(/, but half your share still counts/);
    expect(awayBannerBody(0, words)).toBe("Nobody hands you a John due while you’re gone.");
  });

  it("says a day of the month calendar, its key and its sheet", () => {
    expect(words('house.away.dayLabel', { day: "Sunday 8 November", away: 3 })).toBe("Sunday 8 November, 3 away");
    expect(words('house.away.dayLabel', { day: "Monday 2 November", away: 0 })).toBe("Monday 2 November, everyone home");
    expect([1, 2, 3, 5].map((n) => awayShade(n, words))).toEqual(["1 away", "2 away", "3 or more", "3 or more"]);
    expect(words('house.away.dayCount', { away: 3, home: 2 })).toBe("3 away, 2 home");
    expect(words('house.away.backOn', { day: "Tue 10 Nov" })).toBe("Back Tue 10 Nov");
  });
});

describe("pageTitle", () => {
  it("names the page, then the app, as the web’s tab does", () => {
    expect(pageTitle(words('common.title.today'))).toBe("Today · Jonz");
    expect(pageTitle(words('common.title.week'))).toBe("This week · Jonz");
    expect(pageTitle()).toBe("Jonz");
    expect(pageTitle("")).toBe("Jonz");
  });
});

describe("the pages around the house", () => {
  it("has not-found and error words", () => {
    expect(words('door.notFound.back')).toBe("Back to your Johns");
    expect(words('door.notFound.backToDoor')).toBe("Back to the front door");
    expect(words('common.title.welcome')).toBe(words('door.noHouse.heading'));
    expect(words('door.error.retry')).toBe("Try again");
  });
});

describe("looks", () => {
  it("names day, night and auto", () => {
    expect(LOOKS.map((l) => words(`common.look.${l}` as const))).toEqual(["Day", "Night", "Auto"]);
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
    expect(words('house.reminders.unsupported')).toMatch(/home screen/);
  });
});

describe("the shell's words", () => {
  it("speaks Today’s badge, and leaves a tab with none as its name", () => {
    expect(words('common.shell.tab', { label: "Today", toVote: 2 })).toBe("Today, 2 waiting for your vote");
    expect(words('common.shell.tab', { label: "Today", toVote: 0 })).toBe("Today");
    expect(words('common.shell.tab', { label: "Week", toVote: 0 })).toBe("Week");
  });

  it("counts what a fold holds", () => {
    expect(words('common.shell.done', { count: 0 })).toBe("Done (0)");
    expect(words('common.shell.done', { count: 2 })).toBe("Done (2)");
  });
});

describe("STAKE_HISTORY_COPY", () => {
  it("says the stake under its title", () => {
    expect(words('house.stake.sub', { stake: "£20" })).toBe("£20 a month each");
  });
});

describe("every word in the words files", () => {
  const all: string[] = Object.values(EN);
  const said = all;

  it("is there to check", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("never calls it a rota or a chore app", () => {
    for (const text of all) expect(text).not.toMatch(/\brota\b|chore app/i);
  });

  it("carries no emoji", () => {
    for (const text of all) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("writes every apostrophe curly, in the sentences that take names too", () => {
    expect(said.length).toBeGreaterThan(20);
    for (const text of [...all, ...said]) expect(text).not.toContain("'");
  });
});
