import { describe, expect, it } from "vitest";
import { wordsFor } from "./words-for";

import type { AwayPeriod } from "./away";
import { NEW_JOHN, type JohnDef } from "./board";
import { GROUPS_COPY, RULES_COPY } from "./copy";
import type { HouseRules } from "./domain";
import { humanError } from "./errors";
import {
  adminsLine,
  awayMeta,
  bookingWeeks,
  canRedeal,
  checkRules,
  dayName,
  johnFacts,
  johnsByKind,
  johnsComing,
  membersLine,
  monthsSpanned,
  monthWeeks,
  myTrips,
  rulesChanged,
  rulesDraft,
  rulesRefusalField,
  rulesRows,
  listLine,
  scheduleLine,
  tripMeta,
  tripStarted,
  upcomingTrips,
  zonePlace,
} from "./setup";

const words = wordsFor("en", "housemates");

const john = (overrides: Partial<JohnDef>): JohnDef => ({ ...NEW_JOHN, id: "j", name: "A John", ...overrides });

const RULES: HouseRules = {
  timezone: "Europe/London",
  currency: "GBP",
  weekStarts: 1,
  stakeMinor: 2000,
  lateForfeitMinor: 100,
  missedForfeitMinor: 300,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: "smart",
  dealBudget: 4,
};

describe("johnsByKind", () => {
  it("puts the list under its kinds, in the kinds' order, counting each", () => {
    const list = [
      john({ id: "a", category: "bins" }),
      john({ id: "b", category: "kitchen" }),
      john({ id: "c", category: "bins" }),
      john({ id: "d", category: "other" }),
    ];
    const kinds = johnsByKind(list);
    expect(kinds.map((k) => k.label)).toEqual(["Kitchen (1)", "Bins & recycling (2)", "Everything else (1)"]);
    // Within a kind, the list's own order.
    expect(kinds[1].johns.map((j) => j.id)).toEqual(["a", "c"]);
  });

  it("has nothing to show for an empty list", () => {
    expect(johnsByKind([])).toEqual([]);
  });
});

describe("listLine", () => {
  it("says when a weekly John is due and nothing more", () => {
    expect(listLine(john({ everyWeeks: 1, dueDow: 7, dueTime: "21:00" }))).toBe("Sun 21:00");
  });

  it("adds what sets it apart: how often, the photo, the group", () => {
    expect(listLine(john({ everyWeeks: 2, dueDow: 4, dueTime: "07:00", needsPhoto: true }), "Upstairs bathroom")).toBe(
      "Thu 07:00, every 2 weeks, photo, Upstairs bathroom",
    );
    expect(listLine(john({ everyMonths: 6, weekOfMonth: 5, dueDow: 7, dueTime: "10:00" }))).toBe("last Sun 10:00, twice a year");
  });

  it("says an on-call John's window", () => {
    expect(listLine(john({ when: "on_call", respondHours: 12, perWeek: 3 }), "Downstairs")).toBe("On call, within 12 hours, Downstairs");
    expect(listLine(john({ when: "on_call", respondHours: 1 }))).toBe("On call, within 1 hour");
  });
});

describe("scheduleLine", () => {
  it("says how often, the day and time, and the photo", () => {
    expect(scheduleLine(john({ everyWeeks: 1, dueDow: 7, dueTime: "21:00", needsPhoto: true }))).toBe(
      "Every week, Sun 21:00, photo",
    );
  });

  it("leaves out the photo when there's none, and adds the group that shares it", () => {
    expect(scheduleLine(john({ everyWeeks: 2, dueDow: 4, dueTime: "07:00" }), "Upstairs bathroom")).toBe(
      "Every 2 weeks, Thu 07:00, Upstairs bathroom",
    );
    expect(scheduleLine(john({ everyWeeks: 1, dueDow: 1, dueTime: "09:30" }), null)).toBe("Every week, Mon 09:30");
  });

  it("says a cadence the list doesn't name", () => {
    expect(scheduleLine(john({ everyWeeks: 6, dueDow: 3, dueTime: "12:00" }))).toBe("Every 6 weeks, Wed 12:00");
  });

  it("says a monthly John's period and which of its weekday", () => {
    expect(scheduleLine(john({ everyMonths: 3, weekOfMonth: 1, dueDow: 6, dueTime: "21:00" }))).toBe("Every 3 months, first Sat 21:00");
    expect(scheduleLine(john({ everyMonths: 6, weekOfMonth: 5, dueDow: 7, dueTime: "10:00" }))).toBe("Twice a year, last Sun 10:00");
    expect(scheduleLine(john({ everyMonths: 12, weekOfMonth: 2, dueDow: 1, dueTime: "09:00" }))).toBe("Every year, second Mon 09:00");
  });

  it("says an on-call John's window and how often, not a day", () => {
    expect(scheduleLine(john({ when: "on_call", respondHours: 12, perWeek: 3 }), "Downstairs")).toBe(
      "On call, within 12 hours, about 3 times a week, Downstairs",
    );
    expect(scheduleLine(john({ when: "on_call", respondHours: 1, perWeek: 1 }))).toBe("On call, within 1 hour, about once a week");
  });
});

describe("johnFacts", () => {
  it("reads a John out in full", () => {
    expect(johnFacts(john({ category: "bathroom", points: 1, everyWeeks: 2, dueDow: 5, dueTime: "18:00", needsPhoto: true }), "Upstairs", words)).toEqual([
      { label: "Kind", value: "Bathroom" },
      { label: "Who it’s for", value: "Upstairs" },
      { label: "Effort", value: "1 pt" },
      { label: "How often", value: "Every 2 weeks" },
      { label: "Due", value: "Friday 18:00" },
      { label: "Photo", value: "Needed to tick it" },
    ]);
  });

  it("reads a monthly John's day as which of its weekday", () => {
    const facts = johnFacts(john({ everyMonths: 3, weekOfMonth: 1, dueDow: 6, dueTime: "21:00" }), null, words);
    expect(facts.slice(3, 5)).toEqual([
      { label: "How often", value: "Every 3 months" },
      { label: "Due", value: "First Saturday 21:00" },
    ]);
  });

  it("reads an on-call John's window in place of its day", () => {
    const facts = johnFacts(john({ when: "on_call", respondHours: 8, perWeek: 4 }), null, words);
    expect(facts.slice(3, 6)).toEqual([
      { label: "When", value: "On call" },
      { label: "Do it within", value: "8 hours" },
      { label: "About how often", value: "4 times a week" },
    ]);
  });

  it("shares a John with no group among everyone", () => {
    const facts = johnFacts(john({}), null, words);
    expect(facts[1]).toEqual({ label: "Who it’s for", value: "Everyone" });
    expect(facts[5]).toEqual({ label: "Photo", value: "Not needed" });
  });
});

describe("rulesRows", () => {
  it("reads the rules out in plain words", () => {
    expect(rulesRows(RULES, 100)).toEqual([
      { label: "How you share Johns", value: "Smart" },
      { label: "Effort each week", value: "Usual, 4 points each" },
      { label: "Stake", value: "£20 a month" },
      { label: "Late John", value: "−£1" },
      { label: "Missed John", value: "−£3" },
      { label: "Disputes", value: "within 24 hours" },
      { label: "Done late", value: "up to 24 hours after it’s due" },
      { label: "Covering", value: "3 hours after it’s due" },
      { label: "Time away", value: "made up in full" },
      { label: "Weeks start", value: "Monday, London time" },
    ]);
  });

  it("says pence, other currencies, places and make-up rates as they are", () => {
    const rows = rulesRows(
      {
        ...RULES,
        currency: "CAD",
        stakeMinor: 2550,
        lateForfeitMinor: 75,
        timezone: "America/New_York",
        weekStarts: 3,
        disputeHours: 1,
        coverGraceHours: 1,
        lateHours: 48,
        dealMode: "classic",
        dealBudget: 0,
      },
      50,
    );
    expect(rows.map((r) => r.value)).toEqual([
      "Classic",
      "No limit",
      "$25.50 a month",
      "−$0.75",
      "−$3",
      "within 1 hour",
      "up to 48 hours after it’s due",
      "1 hour after it’s due",
      "half made up",
      "Wednesday, New York time",
    ]);
  });

  it("says when there's nothing at stake, nothing to forfeit, no disputes or nothing to make up", () => {
    const rows = rulesRows(
      { ...RULES, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0, coverGraceHours: 0 },
      0,
    );
    expect(rows.map((r) => r.value).slice(2, 9)).toEqual([
      "None",
      "Nothing",
      "Nothing",
      "Not allowed",
      "up to 24 hours after it’s due",
      "As soon as it’s due",
      "not made up",
    ]);
  });

  it("says a make-up rate it has no words for as a share", () => {
    expect(rulesRows(RULES, 75)[8].value).toBe("75% made up");
  });
});

describe("zonePlace", () => {
  it("names the place a zone is named after", () => {
    expect(zonePlace("Europe/London")).toBe("London");
    expect(zonePlace("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zonePlace("UTC")).toBe("UTC");
  });
});

describe("adminsLine", () => {
  const sam = { userId: "sam", name: "Sam Carter", role: "admin" };
  const priya = { userId: "priya", name: "Priya Shah", role: "member" };
  const tom = { userId: "tom", name: "Tom Reilly", role: "admin" };
  const megan = { userId: "megan", name: "Megan Doyle", role: "admin" };

  it("names the one admin, by first name", () => {
    expect(adminsLine([sam, priya], "priya", wordsFor("en", "housemates"))).toBe("Sam (admin) can change these.");
  });

  it("tells the one admin it's them", () => {
    expect(adminsLine([sam, priya], "sam", wordsFor("en", "housemates"))).toBe("You can change these.");
  });

  it("names several admins, you first", () => {
    expect(adminsLine([sam, priya, tom], "priya", wordsFor("en", "housemates"))).toBe("Sam and Tom (admins) can change these.");
    expect(adminsLine([sam, priya, tom], "tom", wordsFor("en", "housemates"))).toBe("You and Sam (admins) can change these.");
    expect(adminsLine([sam, tom, megan], "priya", wordsFor("en", "housemates"))).toBe("Sam, Tom and Megan (admins) can change these.");
  });

  it("still says who can when nobody listed is an admin", () => {
    expect(adminsLine([priya], "priya", wordsFor("en", "housemates"))).toBe("Only admins can change these.");
    expect(adminsLine([], "priya", wordsFor("en", "housemates"))).toBe("Only admins can change these.");
  });
});

describe("johnsComing", () => {
  const sam = { userId: "sam", name: "Sam Carter", role: "admin" };
  const priya = { userId: "priya", name: "Priya Shah", role: "member" };
  const tom = { userId: "tom", name: "Tom Reilly", role: "admin" };

  it("names whoever will add the Johns", () => {
    expect(johnsComing([sam, priya], "priya", wordsFor("en", "housemates"))).toBe("Sam will add the Johns.");
    expect(johnsComing([sam, priya, tom], "priya", wordsFor("en", "housemates"))).toBe("Sam and Tom will add the Johns.");
  });

  it("leaves you out, and says an admin will when nobody else is one", () => {
    expect(johnsComing([sam, priya, tom], "sam", wordsFor("en", "housemates"))).toBe("Tom will add the Johns.");
    expect(johnsComing([sam, priya], "sam", wordsFor("en", "housemates"))).toBe("An admin will add the Johns.");
    expect(johnsComing([], "priya", wordsFor("en", "housemates"))).toBe("An admin will add the Johns.");
  });
});

describe("canRedeal", () => {
  const open = { doneAt: null, outcome: null };
  const week = { id: "w1" };

  it("re-deals a dealt week while nothing in it is ticked", () => {
    expect(canRedeal({ week, items: [open, open] })).toBe(true);
    // A week dealt to nobody can be dealt again too.
    expect(canRedeal({ week, items: [] })).toBe(true);
  });

  it("won't once anything is ticked or settled, even a tick that was struck", () => {
    expect(canRedeal({ week, items: [open, { doneAt: new Date(), outcome: null }] })).toBe(false);
    expect(canRedeal({ week, items: [open, { doneAt: null, outcome: "missed" }] })).toBe(false);
  });

  it("has nothing to re-deal before the week is dealt", () => {
    expect(canRedeal({ week: null, items: [] })).toBe(false);
  });
});

describe("membersLine", () => {
  const people = [
    { userId: "sam", name: "Sam Carter" },
    { userId: "priya", name: "Priya Shah" },
    { userId: "megan", name: "Megan Doyle" },
  ];

  it("names who's in a group, you first, then in the house's order", () => {
    expect(membersLine(["megan", "sam", "priya"], people, "priya")).toBe("You, Sam and Megan");
    expect(membersLine(["megan"], people, "priya")).toBe("Megan");
  });

  it("says so when nobody is left in it", () => {
    expect(membersLine([], people, "priya")).toBe(GROUPS_COPY.nobody);
  });

  it("names someone who has left as someone who left", () => {
    expect(membersLine(["sam", "gone"], people, "priya")).toBe("Sam and someone who left");
    expect(membersLine(["gone"], people, "priya")).toBe("Someone who left");
  });
});

describe("time away lines", () => {
  const trip: AwayPeriod = { id: "p", userId: "megan", startsOn: "2026-10-28", endsOn: "2026-10-31", note: "Mum's 60th in Cork" };

  it("says a trip has begun from its first day", () => {
    expect(tripStarted(trip, "2026-10-27")).toBe(false);
    expect(tripStarted(trip, "2026-10-28")).toBe(true);
    expect(tripStarted(trip, "2026-11-02")).toBe(true);
  });

  it("says where your trip is, and whether it's begun", () => {
    expect(tripMeta(trip, "2026-10-26")).toBe("Mum's 60th in Cork");
    expect(tripMeta(trip, "2026-10-28")).toBe("Away now, Mum's 60th in Cork");
    expect(tripMeta({ ...trip, note: null }, "2026-10-26")).toBe("");
  });

  it("gives a housemate's trip its dates and where", () => {
    expect(awayMeta(trip)).toBe("28–31 Oct, Mum's 60th in Cork");
    expect(awayMeta({ ...trip, endsOn: "2026-11-01", note: "" })).toBe("28 Oct–1 Nov");
  });
});

describe("trips still to come", () => {
  const trip = (id: string, userId: string, startsOn: string, endsOn: string): AwayPeriod => ({ id, userId, startsOn, endsOn, note: null });
  const periods = [
    trip("later", "sam", "2026-11-10", "2026-11-12"),
    trip("over", "priya", "2026-10-20", "2026-10-25"),
    trip("ends-today", "priya", "2026-10-22", "2026-10-26"),
    trip("starts-today", "sam", "2026-10-26", "2026-10-30"),
  ];

  it("keeps the house's trips that aren't over, soonest first, one ending today included", () => {
    expect(upcomingTrips(periods, "2026-10-26").map((p) => p.id)).toEqual(["ends-today", "starts-today", "later"]);
  });

  it("keeps only yours for your own list", () => {
    expect(myTrips(periods, "sam", "2026-10-26").map((p) => p.id)).toEqual(["starts-today", "later"]);
    expect(myTrips(periods, "priya", "2026-10-27")).toEqual([]);
  });

  it("has nothing to show for no trips", () => {
    expect(upcomingTrips([], "2026-10-26")).toEqual([]);
    expect(myTrips([], "sam", "2026-10-26")).toEqual([]);
  });
});

describe("bookingWeeks", () => {
  it("opens on the week that holds today, on the house's first day", () => {
    // Monday 26 October 2026, in a house whose weeks start on Wednesday.
    const weeks = bookingWeeks("2026-10-26", 3, 0, 2);
    expect(weeks[0]).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(weeks[1][0]).toBe("2026-10-28");
  });

  it("starts on today when today is the first day, and runs across months and years", () => {
    expect(bookingWeeks("2026-10-26", 1, 0, 1)[0][0]).toBe("2026-10-26");
    const later = bookingWeeks("2026-12-21", 1, 1, 2);
    expect(later[0][0]).toBe("2026-12-28");
    expect(later[1][6]).toBe("2027-01-10");
  });

  it("shows nothing for no weeks", () => {
    expect(bookingWeeks("2026-10-26", 1, 0, 0)).toEqual([]);
  });

  it("counts calendar days, so the clocks changing moves nothing", () => {
    // British Summer Time ends on Sunday 25 October 2026.
    expect(bookingWeeks("2026-10-25", 1, 0, 1)[0]).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });
});

describe("monthWeeks", () => {
  it("runs from the week that holds the 1st to the week that holds the last day", () => {
    // November 2026 starts on a Sunday and ends on a Monday: six Monday weeks.
    const weeks = monthWeeks("2026-11", 1);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(weeks[5]).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("starts each week on the house's first day", () => {
    // Weeks from Sunday: the 1st opens the first week, and five are enough.
    const weeks = monthWeeks("2026-11", 7);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks[4][6]).toBe("2026-12-05");
    expect(monthWeeks("2026-10", 3)[0][0]).toBe("2026-09-30");
  });

  it("fits a February that starts on the first day in four weeks", () => {
    expect(monthWeeks("2027-02", 1)).toHaveLength(4);
    expect(monthWeeks("2027-02", 1)[3][6]).toBe("2027-02-28");
  });

  it("crosses the new year and leap days", () => {
    expect(monthWeeks("2026-12", 1).at(-1)?.at(-1)).toBe("2027-01-03");
    expect(monthWeeks("2028-02", 1).at(-1)).toContain("2028-02-29");
  });
});

describe("monthsSpanned", () => {
  it("names one month, two in a year, or two across a new year", () => {
    expect(monthsSpanned("2026-10-01", "2026-10-31")).toBe("October 2026");
    expect(monthsSpanned("2026-10-21", "2026-11-24")).toBe("October–November 2026");
    expect(monthsSpanned("2026-12-21", "2027-01-24")).toBe("December 2026–January 2027");
  });
});

describe("dayName", () => {
  it("says a day in full", () => {
    expect(dayName("2026-10-26")).toBe("Monday 26 October");
    expect(dayName("2027-01-01")).toBe("Friday 1 January");
  });
});

describe("the rules form", () => {
  const start = rulesDraft("Flat 3", RULES, 100);

  it("starts from the house's rules, amounts as money is typed", () => {
    expect(start).toEqual({
      name: "Flat 3",
      timezone: "Europe/London",
      currency: "GBP",
      weekStarts: 1,
      disputeHours: 24,
      coverGraceHours: 3,
      lateHours: 24,
      awayMakeup: 100,
      settleIn: "jonz",
      dealMode: "smart",
      dealBudget: 4,
      stake: "20",
      late: "1",
      missed: "3",
    });
    expect(rulesDraft("Flat 3", { ...RULES, stakeMinor: 2550, lateForfeitMinor: 5 }, 0)).toMatchObject({ stake: "25.50", late: "0.05" });
  });

  it("waits for a change before it can be saved", () => {
    expect(rulesChanged(start, start)).toBe(false);
    // The same amount typed another way, or the same name with spaces, is no change.
    expect(rulesChanged({ ...start, stake: "20.00", name: " Flat 3 " }, start)).toBe(false);
    expect(rulesChanged({ ...start, stake: "20.5" }, start)).toBe(true);
    expect(rulesChanged({ ...start, disputeHours: 48 }, start)).toBe(true);
    expect(rulesChanged({ ...start, coverGraceHours: 0 }, start)).toBe(true);
    expect(rulesChanged({ ...start, lateHours: 48 }, start)).toBe(true);
    expect(rulesChanged({ ...start, currency: "EUR" }, start)).toBe(true);
    expect(rulesChanged({ ...start, settleIn: "splitwise" }, start)).toBe(true);
    expect(rulesChanged({ ...start, late: "a quid" }, start)).toBe(true);
    expect(rulesChanged({ ...start, dealMode: "classic" }, start)).toBe(true);
    expect(rulesChanged({ ...start, dealBudget: 2 }, start)).toBe(true);
  });

  it("gives the settings to save, money in minor units", () => {
    expect(checkRules({ ...start, stake: "25.50", missed: "£0" })).toEqual({
      problems: null,
      settings: {
        name: "Flat 3",
        timezone: "Europe/London",
        currency: "GBP",
        weekStarts: 1,
        stakeMinor: 2550,
        lateForfeitMinor: 100,
        missedForfeitMinor: 0,
        disputeHours: 24,
        coverGraceHours: 3,
        lateHours: 24,
        awayMakeup: 100,
        settleIn: "jonz",
        dealMode: "smart",
        dealBudget: 4,
      },
    });
  });

  it("puts each problem under its own field", () => {
    const checked = checkRules({ ...start, name: "  ", late: "a quid", missed: "1001" });
    expect(checked.settings).toBeNull();
    expect(checked.problems).toEqual({
      name: "Give the house a name.",
      late: RULES_COPY.badAmount,
      missed: "Amounts are up to 1,000.",
    });
  });

  it("asks for a time zone", () => {
    expect(checkRules({ ...start, timezone: "" }).problems).toEqual({ timezone: "Say which time zone the house is in." });
  });

  it("says a problem no field owns by Save", () => {
    expect(checkRules({ ...start, awayMakeup: 75 }).problems).toEqual({ form: RULES_COPY.check });
  });

  it("won't take a negative amount, whichever minus is typed", () => {
    for (const late of ["-5", "\u22125", "\u20135", "£-1.50"]) {
      expect(checkRules({ ...start, late }).problems).toEqual({ late: RULES_COPY.badAmount });
    }
    // Nor does it pass for the same amount the other way round: Save is offered, and says why.
    expect(rulesChanged({ ...start, late: "-1" }, start)).toBe(true);
  });

  it("takes zero and pence as they are", () => {
    expect(checkRules({ ...start, late: "0", missed: "0.05" }).settings).toMatchObject({ lateForfeitMinor: 0, missedForfeitMinor: 5 });
  });
});

describe("rulesRefusalField", () => {
  it("puts a time zone the database doesn't know under Time zone", () => {
    expect(rulesRefusalField(humanError({ message: "unknown_timezone" }))).toBe("timezone");
  });

  it("puts anything else by Save", () => {
    expect(rulesRefusalField(humanError({ message: "admins_only" }))).toBe("form");
    expect(rulesRefusalField("")).toBe("form");
  });
});
