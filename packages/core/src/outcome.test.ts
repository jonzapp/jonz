import { describe, expect, it } from "vitest";

import {
  canCover,
  closesAt,
  coverOpensAt,
  liveStatus,
  settleOutcome,
  standsAt,
  tickWouldBe,
  type AssignmentFacts,
} from "./outcome";

const due = new Date("2026-10-08T18:00:00Z");
const weekEnds = new Date("2026-10-11T23:00:00Z");
const base: AssignmentFacts = {
  dueAt: due,
  doneAt: null,
  excused: false,
  disputeOpen: false,
  weekEndsAt: weekEnds,
};
const at = (iso: string) => new Date(iso);

describe("settleOutcome", () => {
  it("waits while a tick is inside the dispute window", () => {
    const a = { ...base, doneAt: at("2026-10-08T12:00:00Z") };
    expect(settleOutcome(a, at("2026-10-09T11:59:00Z"), 24)).toBeNull();
    expect(settleOutcome(a, at("2026-10-09T12:00:00Z"), 24)).toBe("done");
  });

  it("calls a tick after the due time late", () => {
    const a = { ...base, doneAt: at("2026-10-09T09:00:00Z") };
    expect(settleOutcome(a, at("2026-10-10T09:00:00Z"), 24)).toBe("late");
  });

  it("counts a tick exactly on the due time as on time", () => {
    const a = { ...base, doneAt: due };
    expect(settleOutcome(a, at("2026-10-10T00:00:00Z"), 24)).toBe("done");
  });

  it("holds while a dispute is open, however long", () => {
    const a = { ...base, doneAt: at("2026-10-08T12:00:00Z"), disputeOpen: true };
    expect(settleOutcome(a, at("2026-10-20T00:00:00Z"), 24)).toBeNull();
  });

  it("misses a John the week closed on", () => {
    expect(settleOutcome(base, at("2026-10-11T22:59:59Z"), 24)).toBeNull();
    expect(settleOutcome(base, weekEnds, 24)).toBe("missed");
  });

  it("lets a late-night tick stand after the week ends", () => {
    const a = { ...base, doneAt: at("2026-10-11T22:00:00Z") };
    expect(settleOutcome(a, at("2026-10-12T08:00:00Z"), 24)).toBeNull();
    expect(settleOutcome(a, at("2026-10-12T22:00:00Z"), 24)).toBe("late");
  });

  it("excuses whatever else is true", () => {
    expect(settleOutcome({ ...base, excused: true }, at("2026-10-01T00:00:00Z"), 24)).toBe("excused");
  });

  it("settles instantly with no dispute window", () => {
    const a = { ...base, doneAt: at("2026-10-08T12:00:00Z") };
    expect(settleOutcome(a, at("2026-10-08T12:00:00Z"), 0)).toBe("done");
  });
});

describe("liveStatus", () => {
  const live = (over: Partial<AssignmentFacts>, now: string) =>
    liveStatus({ ...base, ...over, outcome: null }, at(now), 24);

  it("reads the open states", () => {
    expect(live({}, "2026-10-06T12:00:00Z")).toBe("upcoming");
    expect(live({}, "2026-10-07T19:00:00Z")).toBe("due-soon");
    expect(live({}, "2026-10-08T18:00:01Z")).toBe("overdue");
  });

  it("reads the ticked states", () => {
    expect(live({ doneAt: at("2026-10-08T12:00:00Z") }, "2026-10-08T13:00:00Z")).toBe("checking");
    expect(
      live({ doneAt: at("2026-10-08T12:00:00Z"), disputeOpen: true }, "2026-10-08T13:00:00Z"),
    ).toBe("disputed");
  });

  it("prefers a stamped outcome", () => {
    expect(liveStatus({ ...base, outcome: "late" }, at("2026-10-06T00:00:00Z"), 24)).toBe("late");
  });
});

describe("helpers", () => {
  it("stands a day after the tick", () => {
    expect(standsAt(at("2026-10-08T12:00:00Z"), 24).toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("says what a tick now would be", () => {
    expect(tickWouldBe(due, at("2026-10-08T17:00:00Z"), weekEnds)).toBe("on-time");
    expect(tickWouldBe(due, at("2026-10-09T17:00:00Z"), weekEnds)).toBe("late");
    expect(tickWouldBe(due, weekEnds, weekEnds)).toBe("closed");
  });
});

describe("the late window", () => {
  it("closes a John due on a day its late window after it was due, whatever the day", () => {
    // Due Thursday 6pm with a day to do it late: missed Friday 6pm, not Sunday night.
    const thursday = { ...base, closesAt: at("2026-10-09T18:00:00Z") };
    expect(closesAt(thursday)).toEqual(at("2026-10-09T18:00:00Z"));
    expect(settleOutcome(thursday, at("2026-10-09T17:59:00Z"), 24)).toBeNull();
    expect(settleOutcome(thursday, at("2026-10-09T18:00:00Z"), 24)).toBe("missed");
  });

  it("keeps a Sunday-night John open into the next week for its late window", () => {
    const sunday = { ...base, dueAt: at("2026-10-11T21:00:00Z"), closesAt: at("2026-10-12T21:00:00Z") };
    expect(liveStatus({ ...sunday, outcome: null }, at("2026-10-12T08:00:00Z"), 24)).toBe("overdue");
    expect(settleOutcome(sunday, at("2026-10-12T21:00:00Z"), 24)).toBe("missed");
    expect(tickWouldBe(sunday.dueAt, at("2026-10-12T08:00:00Z"), closesAt(sunday))).toBe("late");
  });
});

describe("flags (on-call Johns)", () => {
  // Raised Thursday 8pm with 12 hours: due Friday 8am, missed Friday 8pm.
  const flaggedAt = at("2026-10-08T20:00:00Z");
  const flag: AssignmentFacts = { ...base, flaggedAt, dueAt: at("2026-10-09T08:00:00Z") };

  it("closes an older John due on a day when its week ends", () => {
    expect(closesAt(base)).toEqual(weekEnds);
    expect(closesAt({ ...base, flaggedAt: null })).toEqual(weekEnds);
  });

  it("misses a flag at twice its window", () => {
    expect(closesAt(flag).toISOString()).toBe("2026-10-09T20:00:00.000Z");
    expect(settleOutcome(flag, at("2026-10-09T19:59:00Z"), 24)).toBeNull();
    expect(settleOutcome(flag, at("2026-10-09T20:00:00Z"), 24)).toBe("missed");
  });

  it("gives a struck flag at least its time to redo it", () => {
    // Struck Friday 6pm: 12 hours to redo, past its own close at 8pm.
    const struck = { ...flag, closesAt: at("2026-10-10T06:00:00Z") };
    expect(closesAt(struck)).toEqual(at("2026-10-10T06:00:00Z"));
    // A redo time earlier than its own close changes nothing.
    expect(closesAt({ ...flag, closesAt: at("2026-10-09T10:00:00Z") }).toISOString()).toBe("2026-10-09T20:00:00.000Z");
  });

  it("misses an overdue flag when its week ends first", () => {
    // Raised Sunday 4am, due 4pm; the week ends 11pm, before 4am Monday.
    const late = { ...base, flaggedAt: at("2026-10-11T04:00:00Z"), dueAt: at("2026-10-11T16:00:00Z") };
    expect(closesAt(late)).toEqual(weekEnds);
  });

  it("keeps a flag open past its week's end while it is still in time", () => {
    // Raised Sunday 8pm: due 8am Monday, in the next week, and still the same person's.
    const straddling = { ...base, flaggedAt: at("2026-10-11T20:00:00Z"), dueAt: at("2026-10-12T08:00:00Z") };
    expect(closesAt(straddling).toISOString()).toBe("2026-10-12T20:00:00.000Z");
    expect(liveStatus({ ...straddling, outcome: null }, at("2026-10-12T01:00:00Z"), 24)).toBe("due-soon");
    expect(liveStatus({ ...straddling, outcome: null }, at("2026-10-12T09:00:00Z"), 24)).toBe("overdue");
    expect(settleOutcome(straddling, at("2026-10-12T20:00:00Z"), 24)).toBe("missed");
  });

  it("settles a ticked flag like any John", () => {
    const ticked = { ...flag, doneAt: at("2026-10-09T09:00:00Z") };
    expect(settleOutcome(ticked, at("2026-10-10T09:00:00Z"), 24)).toBe("late");
  });
});

describe("covering", () => {
  const covered = { ...base, doneAt: at("2026-10-08T22:00:00Z"), coveredBy: "glyn" };

  it("settles a cover as covered once it stands, never done or late", () => {
    expect(settleOutcome(covered, at("2026-10-09T21:59:00Z"), 24)).toBeNull();
    expect(settleOutcome(covered, at("2026-10-09T22:00:00Z"), 24)).toBe("covered");
    expect(settleOutcome(covered, at("2026-10-12T00:00:00Z"), 0)).toBe("covered");
  });

  it("holds a disputed cover like any tick", () => {
    expect(settleOutcome({ ...covered, disputeOpen: true }, at("2026-10-20T00:00:00Z"), 24)).toBeNull();
  });

  it("shows covered from the moment it's covered, and disputed while it's argued", () => {
    const now = at("2026-10-08T23:00:00Z");
    expect(liveStatus({ ...covered, outcome: null }, now, 24)).toBe("covered");
    expect(liveStatus({ ...covered, disputeOpen: true, outcome: null }, now, 24)).toBe("disputed");
    expect(liveStatus({ ...covered, outcome: "covered" }, now, 24)).toBe("covered");
  });

  const closes = at("2026-10-09T18:00:00Z");

  it("opens the grace period after the due time", () => {
    expect(coverOpensAt(due, 3, closes)).toEqual(at("2026-10-08T21:00:00Z"));
    expect(coverOpensAt(due, 0, closes)).toEqual(due);
  });

  it("opens halfway to the miss when the grace is longer than that", () => {
    // Sunday 9pm with the week ending at 11pm: the old rule never opened it.
    const sunday = at("2026-10-11T21:00:00Z");
    expect(coverOpensAt(sunday, 3, weekEnds)).toEqual(at("2026-10-11T22:00:00Z"));
    expect(coverOpensAt(due, 24, closes)).toEqual(at("2026-10-09T06:00:00Z"));
  });

  it("lets anyone else cover an undone John once the grace is up, until it's missed", () => {
    const a = { userId: "sam", doneAt: null, outcome: null, dueAt: due, closesAt: closes };
    expect(canCover(a, "glyn", at("2026-10-08T20:59:59Z"), 3)).toBe(false);
    expect(canCover(a, "glyn", at("2026-10-08T21:00:00Z"), 3)).toBe(true);
    expect(canCover(a, "glyn", due, 0)).toBe(true);
    expect(canCover(a, "glyn", closes, 3)).toBe(false);
  });

  it("never offers a cover of your own, a ticked, excused or settled John", () => {
    const now = at("2026-10-09T00:00:00Z");
    const a = { userId: "sam", doneAt: null, outcome: null, dueAt: due, closesAt: closes };
    expect(canCover(a, "sam", now, 3)).toBe(false);
    expect(canCover({ ...a, doneAt: at("2026-10-09T00:00:00Z") }, "glyn", now, 3)).toBe(false);
    expect(canCover({ ...a, excused: true }, "glyn", now, 3)).toBe(false);
    expect(canCover({ ...a, outcome: "missed" }, "glyn", now, 3)).toBe(false);
  });
});
