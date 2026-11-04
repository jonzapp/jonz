import { describe, expect, it } from "vitest";

import {
  joinRange,
  dateRange,
  dayLabel,
  dueInLine,
  dueLabel,
  firstName,
  formatBalance,
  initials,
  monthLabel,
  NAME_MAX,
  nameFromParts,
  pointsLabel,
  relative,
  sinceLabel,
  STATUS_LABEL,
  STATUS_MARK,
  weekRange,
} from "./format";
import { weekWindow } from "./week";

const LONDON = "Europe/London";
// Wednesday 8 Oct 2026, 10:00 BST.
const now = new Date("2026-10-08T09:00:00Z");

describe("dueLabel", () => {
  it("reads relative days in the house's zone", () => {
    expect(dueLabel(new Date("2026-10-08T20:00:00Z"), now, LONDON)).toBe("Today 21:00");
    expect(dueLabel(new Date("2026-10-09T06:30:00Z"), now, LONDON)).toBe("Tomorrow 07:30");
    expect(dueLabel(new Date("2026-10-11T20:00:00Z"), now, LONDON)).toBe("Sun 21:00");
    expect(dueLabel(new Date("2026-10-07T17:00:00Z"), now, LONDON)).toBe("Yesterday 18:00");
    expect(dueLabel(new Date("2026-10-20T17:00:00Z"), now, LONDON)).toBe("Tue 20 Oct");
  });

  it("counts a late-night UTC time as the next local day", () => {
    // 23:30 UTC on the 8th is 00:30 BST on the 9th.
    expect(dueLabel(new Date("2026-10-08T23:30:00Z"), now, LONDON)).toBe("Tomorrow 00:30");
  });
});

describe("dueInLine", () => {
  it("is the due label mid-sentence: today, tomorrow and yesterday in lower case, days as they are", () => {
    expect(dueInLine(new Date("2026-10-08T20:00:00Z"), now, LONDON)).toBe("today 21:00");
    expect(dueInLine(new Date("2026-10-09T06:30:00Z"), now, LONDON)).toBe("tomorrow 07:30");
    expect(dueInLine(new Date("2026-10-07T17:00:00Z"), now, LONDON)).toBe("yesterday 18:00");
    expect(dueInLine(new Date("2026-10-11T20:00:00Z"), now, LONDON)).toBe("Sun 21:00");
    expect(dueInLine(new Date("2026-10-20T17:00:00Z"), now, LONDON)).toBe("Tue 20 Oct");
  });
});

describe("sinceLabel", () => {
  it("is the time today, the weekday within the week, and the date before that", () => {
    expect(sinceLabel(new Date("2026-10-08T07:00:00Z"), now, LONDON)).toBe("08:00");
    expect(sinceLabel(new Date("2026-10-06T19:00:00Z"), now, LONDON)).toBe("Tue");
    expect(sinceLabel(new Date("2026-10-02T19:00:00Z"), now, LONDON)).toBe("Fri");
    expect(sinceLabel(new Date("2026-10-01T19:00:00Z"), now, LONDON)).toBe("Thu 1 Oct");
  });

  it("counts days in the house's zone", () => {
    // 23:30 UTC on the 7th is 00:30 BST on the 8th: today.
    expect(sinceLabel(new Date("2026-10-07T23:30:00Z"), now, LONDON)).toBe("00:30");
  });
});

describe("relative", () => {
  it("says how far off, either way", () => {
    expect(relative(new Date(now.getTime() + 3 * 3_600_000), now)).toBe("in 3h");
    expect(relative(new Date(now.getTime() - 20 * 60_000), now)).toBe("20 min ago");
    expect(relative(new Date(now.getTime() + 3 * 86_400_000), now)).toBe("in 3 days");
    // 35h45m is past the hours cut-off but rounds to one day.
    expect(relative(new Date(now.getTime() - 35.75 * 3_600_000), now)).toBe("1 day ago");
  });
});

describe("weekRange", () => {
  it("shows the last day, not the midnight after it", () => {
    const w = weekWindow(now, LONDON, 1);
    expect(weekRange(w.startsAt, w.endsAt, LONDON)).toBe("5–11 Oct");
    const spanning = weekWindow(new Date("2026-09-30T12:00:00Z"), LONDON, 1);
    expect(weekRange(spanning.startsAt, spanning.endsAt, LONDON)).toBe("28 Sep–4 Oct");
  });
});

describe("names", () => {
  it("makes initials and first names", () => {
    expect(initials("Priya Shah")).toBe("PS");
    expect(initials("tom")).toBe("TO");
    expect(firstName("Priya Shah")).toBe("Priya");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("pointsLabel", () => {
  it("counts one point as a pt", () => {
    expect(pointsLabel(1)).toBe("1 pt");
    expect(pointsLabel(4)).toBe("4 pts");
  });
});

describe("joinRange", () => {
  it("writes every range one way: an en dash, no spaces, whatever its ends hold", () => {
    expect(joinRange("6", "12 Oct")).toBe("6–12 Oct");
    expect(joinRange("29 Oct", "1 Nov")).toBe("29 Oct–1 Nov");
  });
});

describe("dateRange", () => {
  it("reads like a calendar", () => {
    expect(dateRange("2026-10-14", "2026-10-21")).toBe("14–21 Oct");
    expect(dateRange("2026-10-28", "2026-11-02")).toBe("28 Oct–2 Nov");
    expect(dateRange("2026-10-16", "2026-10-16")).toBe("Fri 16 Oct");
  });
});

describe("formatBalance", () => {
  it("signs a balance to the half point", () => {
    expect(formatBalance(3.4)).toBe("+3.5");
    expect(formatBalance(-9)).toBe("−9");
    expect(formatBalance(0.1)).toBe("level");
  });
});

describe("nameFromParts", () => {
  it("joins Apple's given, middle and family names", () => {
    expect(nameFromParts(["Priya", null, "Shah"])).toBe("Priya Shah");
    expect(nameFromParts(["Priya", "Anjali", "Shah"])).toBe("Priya Anjali Shah");
    expect(nameFromParts(["Tom"])).toBe("Tom");
  });

  it("drops blank parts and closes up whitespace", () => {
    expect(nameFromParts(["  Priya ", "", "   ", "Shah  "])).toBe("Priya Shah");
    expect(nameFromParts(["Mary\tJane", undefined, "Watson"])).toBe("Mary Jane Watson");
  });

  it("is null when there is no name to keep", () => {
    expect(nameFromParts([])).toBeNull();
    expect(nameFromParts([null, undefined, ""])).toBeNull();
    expect(nameFromParts(["   ", "\n"])).toBeNull();
  });

  it("stops at the profile's limit, counting characters as Postgres does", () => {
    const long = nameFromParts(["A".repeat(40), "B".repeat(40)]);
    expect(long).toHaveLength(NAME_MAX);
    // One code point, two UTF-16 units: never split in half.
    const astral = nameFromParts(["𠀋".repeat(70)])!;
    expect(Array.from(astral)).toHaveLength(NAME_MAX);
    expect(astral).toBe("𠀋".repeat(NAME_MAX));
  });

  it("never ends on a space when the limit falls between words", () => {
    const name = nameFromParts(["A".repeat(59), "Shah"])!;
    expect(name).toBe("A".repeat(59));
  });
});

describe("STATUS_MARK", () => {
  const statuses = Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[];

  it("marks every live status, and only those", () => {
    expect(Object.keys(STATUS_MARK).sort()).toEqual([...statuses].sort());
  });

  it("shows nothing for an upcoming John: its time is in the meta line", () => {
    expect(STATUS_MARK.upcoming).toEqual({ tone: "none", icon: null, label: "Upcoming" });
  });

  it("keeps hazard for late, overdue, missed, covered and disputed", () => {
    const hazard = statuses.filter((s) => STATUS_MARK[s].tone === "hazard").sort();
    expect(hazard).toEqual(["covered", "disputed", "late", "missed", "overdue"]);
    expect(STATUS_MARK.late.label).toBe("Late");
  });

  it("keeps green for done alone", () => {
    expect(statuses.filter((s) => STATUS_MARK[s].tone === "good")).toEqual(["done"]);
  });

  it("gives every mark that shows an icon and a word", () => {
    for (const status of statuses) {
      const mark = STATUS_MARK[status];
      if (mark.tone === "none") continue;
      expect(mark.icon).not.toBeNull();
      expect(mark.label.length).toBeGreaterThan(0);
    }
    expect(STATUS_MARK.overdue.icon).toBe("triangle");
    expect(STATUS_MARK.missed.icon).toBe("x");
    expect(STATUS_MARK.disputed.icon).toBe("flag");
    expect(STATUS_MARK.excused).toEqual({ tone: "quiet", icon: "shield", label: "Skipped" });
  });

  it("writes its words in sentence case, leaving caps to the style", () => {
    for (const status of statuses) expect(STATUS_MARK[status].label).toMatch(/^[A-Z][a-z]*( [a-z]+)*$/);
  });
});

describe("dayLabel", () => {
  it("names the day in the house's zone", () => {
    expect(dayLabel(now, LONDON)).toBe("Thu 8 Oct");
    // 23:30 UTC on the 8th is already the 9th in London, and still the 8th in New York.
    expect(dayLabel(new Date("2026-10-08T23:30:00Z"), LONDON)).toBe("Fri 9 Oct");
    expect(dayLabel(new Date("2026-10-08T23:30:00Z"), "America/New_York")).toBe("Thu 8 Oct");
  });
});
