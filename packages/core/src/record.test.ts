import { describe, expect, it } from "vitest";

import {
  heldMark,
  readSpan,
  recordBreakdown,
  signedPoints,
  spanWeeks,
  trackRecord,
  type RecordInput,
  type RecordJohn,
  type RecordWeek,
} from "./record";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const ZONE = "Europe/London";
// Wednesday 14 Oct 2026, noon in London.
const now = new Date("2026-10-14T11:00:00Z");

/** A Monday-start week, by its Monday. */
function week(startsOn: string): RecordWeek {
  const start = new Date(`${startsOn}T00:00:00+01:00`);
  return {
    id: `w-${startsOn}`,
    starts_on: startsOn,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 7 * 86_400_000).toISOString(),
  };
}

const W1 = week("2026-09-28"); // September's last week, starting in September
const W2 = week("2026-10-05");
const W3 = week("2026-10-12"); // this week
const NEXT = week("2026-10-19"); // not started yet

let n = 0;
function john(w: RecordWeek, userId: string, extra: Partial<RecordJohn> = {}): RecordJohn {
  n += 1;
  return {
    id: `a${n}`,
    week_id: w.id,
    user_id: userId,
    name: "Bins",
    points: 2,
    due_at: new Date(new Date(w.starts_at).getTime() + 86_400_000).toISOString(),
    done_at: null,
    outcome: "done",
    excused: false,
    covered_by: null,
    ...extra,
  };
}

function input(johns: RecordJohn[], extra: Partial<RecordInput> = {}): RecordInput {
  return {
    weeks: [W1, W2, W3, NEXT],
    shares: [W1, W2, W3].flatMap((w) => [
      { week_id: w.id, user_id: "ana", share: 2 },
      { week_id: w.id, user_id: "sam", share: "2" },
    ]),
    johns,
    away: [],
    memberIds: ["ana", "sam"],
    now,
    zone: ZONE,
    ...extra,
  };
}

const NAMES: Record<string, string> = { ana: "Ana", sam: "Sam" };
const nameOf = (id: string) => NAMES[id] ?? "?";

describe("spanWeeks", () => {
  it("takes this week, this month's, this year's or every week that has started", () => {
    const all = [NEXT, W2, W1, W3];
    expect(spanWeeks(all, "week", now, ZONE)).toEqual([W3]);
    expect(spanWeeks(all, "month", now, ZONE)).toEqual([W2, W3]);
    expect(spanWeeks(all, "year", now, ZONE)).toEqual([W1, W2, W3]);
    expect(spanWeeks(all, "all", now, ZONE)).toEqual([W1, W2, W3]);
  });
});

describe("heldMark", () => {
  it("reads a cover by someone else as the holder's miss", () => {
    expect(heldMark({ outcome: "covered", covered_by: "ana", excused: false, done_at: "x" })).toBe("missed");
    expect(heldMark({ outcome: null, covered_by: "ana", excused: false, done_at: "x" })).toBe("missed");
    expect(heldMark({ outcome: "late", covered_by: null, excused: false, done_at: "x" })).toBe("late");
    expect(heldMark({ outcome: "excused", covered_by: null, excused: true, done_at: null })).toBe("skipped");
    expect(heldMark({ outcome: null, covered_by: null, excused: false, done_at: null })).toBe("open");
  });
});

describe("trackRecord", () => {
  it("gives each person a square per week, the worst thing in it, best on time first", () => {
    const record = trackRecord(
      input([
        john(W1, "sam"),
        john(W2, "sam", { outcome: "late" }),
        john(W2, "sam"),
        john(W3, "sam", { outcome: "covered", covered_by: "ana" }),
        john(W1, "ana"),
        john(W2, "ana"),
        john(W3, "ana", { outcome: null }),
      ]),
      "year",
     words);
    expect(record.range).toBe(words('week.record.yearRange', { year: "2026", weeks: 3 }));
    expect(record.rows.map((r) => [r.userId, r.cells.map((c) => c.mark), r.onTimePct])).toEqual([
      // Ana covered Sam's this week: her square says so over her open John.
      ["ana", ["clean", "clean", "covered"], 100],
      ["sam", ["clean", "late", "missed"], 50],
    ]);
    expect(record.rows[1].counts).toEqual({ onTime: 2, late: 1, missed: 1, skipped: 0, covered: 0, helped: 0 });
    expect(record.rows[0].counts.covered).toBe(1);
  });

  it("marks a week with nothing handed as away when they were, blank when not", () => {
    const record = trackRecord(
      input([john(W2, "ana")], { away: [{ id: "x", userId: "sam", startsOn: "2026-10-06", endsOn: "2026-10-08", note: null }] }),
      "month",
     words);
    expect(record.rows.find((r) => r.userId === "sam")!.cells.map((c) => c.mark)).toEqual(["away", "none"]);
    expect(record.rows.find((r) => r.userId === "sam")!.onTimePct).toBeNull();
  });

  it("on Week, gives a square per John, and one for each cover", () => {
    const record = trackRecord(
      input([john(W3, "sam", { outcome: null }), john(W3, "sam", { outcome: "late" }), john(W3, "ana", { covered_by: "sam", outcome: "covered" })]),
      "week",
     words);
    expect(record.range).toBe("12–18 Oct");
    expect(record.rows.find((r) => r.userId === "sam")!.cells.map((c) => c.mark)).toEqual(["open", "late", "covered"]);
  });
});

describe("recordBreakdown", () => {
  it("adds up as the deal does: share off, each John for whoever did it, a miss for nobody", () => {
    const b = recordBreakdown(
      input([
        john(W2, "sam", { points: 3 }),
        john(W2, "sam", { outcome: "late", points: 1 }),
        john(W3, "sam", { outcome: "covered", covered_by: "ana", points: 2 }),
        john(W3, "sam", { outcome: "missed", points: 2 }),
        john(W3, "ana", { outcome: "covered", covered_by: "sam", points: 4 }),
        john(W3, "sam", { outcome: null, points: 1 }),
      ]),
      "month",
      "sam",
      nameOf,
     words);
    expect(b.weeks).toBe(2);
    expect(b.lines.map((l) => [l.key, l.points, l.johns.length])).toEqual([
      ["share", -4, 0],
      ["onTime", 3, 1],
      ["late", 1, 1],
      ["open", 1, 1],
      ["missed", 0, 2],
      ["covered", 4, 1],
    ]);
    expect(b.total).toBe(5);
    expect(b.lines.find((l) => l.key === "missed")!.johns.map((j) => j.note)).toEqual([words('week.record.coveredIt', { name: "Ana" }), null]);
    expect(b.lines.find((l) => l.key === "covered")!.johns[0].note).toBe(words('week.record.coveredFor', { name: "Ana" }));
  });

  it("is just the share, with nothing handed", () => {
    const b = recordBreakdown(input([]), "all", "ana", nameOf, words);
    expect(b.lines).toEqual([{ key: "share", points: -6, johns: [] }]);
    expect(b.total).toBe(-6);
  });
});

describe("after an admin's resets", () => {
  it("dots a changed result, greys a skipped week, and counts the skipped week for nothing", () => {
    const skipped = { ...W2, skipped_at: "2026-10-10T00:00:00Z" };
    const data = input(
      [john(W2, "sam", { outcome: "done", points: 3 }), john(W3, "sam", { outcome: "missed", changed_by: "ana" })],
      { weeks: [W1, skipped, W3, NEXT] },
    );
    const sam = trackRecord(data, "month", words).rows.find((r) => r.userId === "sam")!;
    expect(sam.cells.map((c) => [c.mark, c.changed])).toEqual([
      ["skipped", false],
      ["missed", true],
    ]);
    // W3's share only: W2's share and its 3 points count for nothing.
    expect(recordBreakdown(data, "month", "sam", nameOf, words).total).toBe(-2);
  });
});

describe("readSpan and signedPoints", () => {
  it("reads a span from a link, this month otherwise", () => {
    expect(readSpan("year")).toBe("year");
    expect(readSpan("nonsense")).toBe("month");
    expect(readSpan(undefined)).toBe("month");
  });

  it("signs points to a tenth", () => {
    expect([signedPoints(10), signedPoints(-15), signedPoints(0), signedPoints(-1.3333), signedPoints(0.01)]).toEqual([
      "+10",
      "−15",
      "0",
      "−1.3",
      "0",
    ]);
  });
});
