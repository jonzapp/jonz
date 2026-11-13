import { describe, expect, it } from "vitest";

import type { BoardItem, DisputeView } from "./board";
import { CATEGORIES } from "./domain";
import { doneFold, johnKind, johnRow } from "./john-row";
import type { LiveStatus } from "./outcome";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const HOUR = 3_600_000;
// Thursday 22 Oct 2026, 15:00 in London (BST, an hour ahead of UTC).
const now = new Date("2026-10-22T14:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
const ZONE = "Europe/London";
const NAMES: Record<string, string> = { sam: "Sam Carter", priya: "Priya Shah", tom: "Tom Reilly", megan: "Megan Doyle" };
const nameOf = (id: string): string | null => NAMES[id] ?? null;

function item(id: string, overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id,
    flaggedAt: null,
    flaggedBy: null,
    carried: false,
    dealt: null,
    johnId: `j-${id}`,
    everyWeeks: 1,
    userId: "sam",
    name: id,
    category: "kitchen",
    points: 2,
    needsPhoto: false,
    dueAt: at(30),
    movedFrom: null,
    groupName: null,
    doneAt: null,
    photoPath: null,
    coveredBy: null,
    outcome: null,
    status: "upcoming",
    standsAt: null,
    dispute: null,
    // A day to do it late, as the house's default late window.
    closesAt: new Date((overrides.dueAt ?? at(30)).getTime() + 86_400_000),
    ...overrides,
  };
}

function dispute(overrides: Partial<DisputeView> = {}): DisputeView {
  return {
    id: "d1",
    assignmentId: "a1",
    raisedBy: "megan",
    reason: "Still grubby",
    closesAt: at(17),
    uphold: 1,
    reject: 1,
    myVote: null,
    ...overrides,
  };
}

/** Sam's row for a John. */
const row = (overrides: Partial<BoardItem>, viewer = "sam") => johnRow(item("a", overrides), { viewerId: viewer, now, zone: ZONE, nameOf, words });

describe("johnKind", () => {
  it("is the category's short word, one word for every kind", () => {
    expect(johnKind("bins")).toBe("Bins");
    expect(johnKind("floors")).toBe("Floors");
    expect(johnKind("errands")).toBe("Errands");
    expect(johnKind("kitchen")).toBe("Kitchen");
    expect(johnKind("other")).toBe("Other");
    for (const category of CATEGORIES) expect(johnKind(category)).toMatch(/^[A-Z][a-z]+$/);
  });

  it("calls a kind it doesn't know Other", () => {
    expect(johnKind("garden")).toBe("Other");
  });
});

describe("johnRow", () => {
  it("ticks your own open John from its tick box, overdue included, and names the move", () => {
    expect(row({ status: "due-soon" })).toEqual({
      tick: "open",
      tickLabel: "Mark a done",
      ticks: true,
      meta: "Kitchen, tomorrow 21:00",
      lid: true,
      trailing: "status",
      points: 2,
      focus: null,
      hazardEdge: false,
    });
    expect(row({ status: "upcoming" })).toMatchObject({ ticks: true, trailing: "points" });
    expect(row({ status: "overdue", needsPhoto: true })).toMatchObject({
      ticks: true,
      tickLabel: "Take a photo of a and mark it done",
      trailing: "status",
      hazardEdge: true,
    });
  });

  it("never ticks a housemate's John, a finished one or a missed one", () => {
    expect(row({ userId: "tom", status: "overdue" })).toMatchObject({ ticks: false, tickLabel: "Not done", hazardEdge: true });
    for (const status of ["checking", "disputed", "done", "late", "missed", "excused"] as const) {
      expect(row({ status }).ticks).toBe(false);
    }
    expect(row({ status: "missed" })).toMatchObject({ tick: "open", tickLabel: "Missed", hazardEdge: true, trailing: "status" });
  });

  it("offers Undo on your tick being checked, and a housemate's tick shows its mark and opens on Dispute", () => {
    expect(row({ status: "checking" })).toMatchObject({ tick: "checking", trailing: "undo", focus: null });
    expect(row({ userId: "megan", status: "checking" })).toMatchObject({
      tick: "checking",
      tickLabel: "Ticked, being checked",
      trailing: "status",
      focus: "dispute",
    });
  });

  it("asks for your vote on a dispute until you've given it; otherwise its flag says it, and the points trail", () => {
    const waiting = item("a", { userId: "priya", status: "disputed", dispute: dispute() });
    expect(johnRow(waiting, { viewerId: "sam", now, zone: ZONE, nameOf, words })).toMatchObject({ tick: "disputed", trailing: "vote", focus: "vote" });
    expect(row({ userId: "priya", status: "disputed", dispute: dispute({ myVote: false }) })).toMatchObject({
      trailing: "points",
      focus: "vote",
    });
    // Your own disputed John: you can't vote on it, so the sheet opens on nothing in particular.
    expect(row({ status: "disputed", dispute: dispute() })).toMatchObject({ trailing: "points", focus: null });
  });

  it("ends a finished John with what it earned, as the green box says done; late keeps its mark, excused has nothing", () => {
    expect(row({ status: "done", points: 3 })).toMatchObject({ tick: "done", tickLabel: "Done", trailing: "points", points: 3 });
    // Half, rounded up, for a late one.
    expect(row({ status: "late", points: 3 })).toMatchObject({ tick: "done", tickLabel: "Done late", trailing: "status", points: 2 });
    expect(row({ status: "excused", points: 3 })).toMatchObject({
      tick: "excused",
      tickLabel: "Skipped",
      trailing: null,
      points: 0,
    });
  });

  it("counts a John's points while it's still in play, and nothing once it's missed", () => {
    for (const status of ["upcoming", "due-soon", "overdue", "checking", "disputed"] as const) {
      expect(row({ status, points: 4 }).points).toBe(4);
    }
    expect(row({ status: "missed", points: 4 }).points).toBe(0);
  });

  it("draws the same John the same for whoever looks, but for the moves that are theirs", () => {
    const statuses: LiveStatus[] = ["upcoming", "due-soon", "overdue", "checking", "disputed", "done", "late", "missed", "excused"];
    for (const status of statuses) {
      const john = item("a", { userId: "tom", status, dispute: status === "disputed" ? dispute({ myVote: false }) : null, standsAt: at(5) });
      const mine = johnRow(john, { viewerId: "tom", now, zone: ZONE, nameOf, words });
      const theirs = johnRow(john, { viewerId: "sam", now, zone: ZONE, nameOf, words });
      expect([theirs.tick, theirs.meta, theirs.lid, theirs.points, theirs.hazardEdge]).toEqual([
        mine.tick,
        mine.meta,
        mine.lid,
        mine.points,
        mine.hazardEdge,
      ]);
    }
  });
});

describe("johnRow's meta line", () => {
  const meta = (overrides: Partial<BoardItem>, viewer = "sam") => row(overrides, viewer).meta;

  it("leads with the kind, then when it's due, mid-sentence", () => {
    expect(meta({ category: "bathroom", status: "due-soon", dueAt: new Date("2026-10-22T20:00:00Z") })).toBe("Bathroom, today 21:00");
    expect(meta({ category: "floors", dueAt: new Date("2026-10-23T06:30:00Z") })).toBe("Floors, tomorrow 07:30");
  });

  it("says when an overdue or missed John was due, short enough to sit beside its mark", () => {
    expect(meta({ category: "other", status: "overdue", dueAt: new Date("2026-10-20T20:00:00Z") })).toBe("Other, was due Tue");
    expect(meta({ status: "missed", dueAt: new Date("2026-10-21T22:30:00Z") })).toBe("Kitchen, was due Wed");
    expect(meta({ status: "overdue", dueAt: new Date("2026-10-22T08:00:00Z") })).toBe("Kitchen, was due 09:00");
    // A week or more back, the date too.
    expect(meta({ status: "missed", dueAt: new Date("2026-10-15T08:00:00Z") })).toBe("Kitchen, was due Thu 15 Oct");
  });

  it("says when a tick stands, yours or a housemate's", () => {
    expect(meta({ userId: "megan", category: "bins", status: "checking", standsAt: at(21) })).toBe("Bins, stands in 21h");
    expect(meta({ status: "checking", standsAt: at(0.5) })).toBe("Kitchen, stands in 30 min");
    expect(meta({ status: "checking", standsAt: at(-1) })).toBe("Kitchen, stands any minute");
    expect(meta({ status: "checking", standsAt: null })).toBe("Kitchen");
    // A kid's tick in a family: no closing time, it waits for a parent.
    expect(meta({ status: "checking", standsAt: null, awaitsOk: true })).toBe("Kitchen, waiting for a parent’s OK");
  });

  it("says who disputed it and how long is left, with no lid dot", () => {
    expect(row({ userId: "priya", status: "disputed", dispute: dispute() })).toMatchObject({
      meta: "Disputed by Megan, 17h left",
      lid: false,
    });
    expect(meta({ userId: "priya", status: "disputed", dispute: dispute({ raisedBy: "sam", myVote: true }) })).toBe(
      "Disputed by you, 17h left",
    );
    expect(meta({ status: "disputed", dispute: dispute({ raisedBy: null, closesAt: at(-1) }) })).toBe(
      "Disputed by someone who left, closing now",
    );
    expect(row({ status: "disputed", dispute: null })).toMatchObject({ meta: "Disputed", lid: false });
  });

  it("says when a finished one was done, and that a skip skipped one", () => {
    expect(meta({ status: "done", doneAt: new Date("2026-10-21T13:10:00Z") })).toBe("Kitchen, done yesterday 14:10");
    expect(meta({ status: "late", doneAt: new Date("2026-10-12T13:10:00Z") })).toBe("Kitchen, done Mon 12 Oct");
    expect(meta({ status: "late", doneAt: null, dueAt: new Date("2026-10-22T08:00:00Z") })).toBe("Kitchen, today 09:00");
    expect(meta({ status: "excused" })).toBe("Kitchen, skipped");
  });

  it("says a John pulled forward by time away is due before they go", () => {
    const moved = { status: "due-soon" as const, dueAt: new Date("2026-10-22T22:59:00Z"), movedFrom: at(48) };
    expect(meta(moved)).toBe("Kitchen, today 23:59, before you go");
    expect(meta({ ...moved, userId: "megan" })).toBe("Kitchen, today 23:59, before Megan goes");
    expect(meta({ ...moved, userId: "cal" })).toBe("Kitchen, today 23:59, before someone who left goes");
  });
});

describe("johnRow's meta line in Smart", () => {
  const dealt = (last: string, mode: "smart" | "classic" = "smart") => ({
    to: "sam",
    by: "mostRoom" as const,
    mode,
    budget: 4,
    away: [],
    weighed: [
      { userId: "sam", standing: -1 },
      { userId: last, standing: 1, last: true as const },
    ],
  });
  const meta = (overrides: Partial<BoardItem>, viewer = "sam") => johnRow(item("a", overrides), { viewerId: viewer, now, zone: ZONE, nameOf, words }).meta;
  const dueAt = new Date("2026-10-23T06:30:00Z");

  it("says who had it before, while it's still to do", () => {
    expect(meta({ dueAt, dealt: dealt("megan") })).toBe("Kitchen, tomorrow 07:30, after Megan");
    expect(meta({ dueAt, userId: "megan", dealt: { ...dealt("sam"), to: "megan" } })).toBe("Kitchen, tomorrow 07:30, after you");
  });

  it("says nothing of it in Classic, for the same person again, or once it's done", () => {
    expect(meta({ dueAt, dealt: dealt("megan", "classic") })).toBe("Kitchen, tomorrow 07:30");
    expect(meta({ dueAt, dealt: dealt("sam") })).toBe("Kitchen, tomorrow 07:30");
    expect(meta({ status: "done", doneAt: new Date("2026-10-21T13:10:00Z"), dealt: dealt("megan") })).toBe("Kitchen, done yesterday 14:10");
  });
});

describe("doneFold", () => {
  it("says how many are folded, and how many of those were late", () => {
    expect(doneFold([{ status: "late" }, { status: "done" }, { status: "late" }], words)).toEqual({ label: "Done (3)", late: "2 late" });
    expect(doneFold([{ status: "done" }, { status: "excused" }], words)).toEqual({ label: "Done (2)", late: null });
  });
});

describe("johnRow on a covered John", () => {
  it("offers the coverer the undo, shows everyone else its mark, and says who covered it", () => {
    const covered = { userId: "tom", status: "covered" as const, coveredBy: "sam", doneAt: at(-1), standsAt: at(23) };
    expect(row(covered, "sam")).toMatchObject({ ticks: false, trailing: "undo" });
    expect(row(covered, "tom")).toMatchObject({ ticks: false, trailing: "status", focus: "dispute" });
    expect(row(covered, "priya").meta).toContain("covered by Sam");
  });

  it("shows a settled cover by its mark, with no hazard edge: the John did get done", () => {
    const settled = row({ userId: "tom", status: "covered", outcome: "covered", coveredBy: "sam", doneAt: at(-30) }, "tom");
    expect(settled).toMatchObject({ ticks: false, trailing: "status", hazardEdge: false });
  });
});
