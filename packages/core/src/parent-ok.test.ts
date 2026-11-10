import { describe, expect, it } from "vitest";

import { buildWeekBoard, todayView, type AssignmentRow, type BoardItem, type WeekBoard } from "./board";
import { FOCUS_SHELL_COPY } from "./copy";
import { DEFAULT_RULES } from "./domain";
import { familyHides } from "./family";
import { settleOutcome } from "./outcome";
import { rulesRows } from "./setup";
import { okMeta, okTitle, okWho, tickedLine } from "./today";
import { wallFeedRow } from "./house-lower";
import { wallEvents } from "./wall";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

/** A parent's OK, family step 2 (docs/specs/family-houses.md). */

const HOUR = 3_600_000;
// Wednesday 14 Oct 2026, noon in London.
const now = new Date("2026-10-14T11:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
const RULES = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" as const, disputeHours: 0 };
const PEOPLE = [
  { userId: "sam", name: "Sam Park", role: "admin" },
  { userId: "alex", name: "Alex Park", role: "admin" },
  { userId: "leo", name: "Leo Park", role: "member" },
  { userId: "maya", name: "Maya Park", role: "member" },
];
const WEEK = { id: "w1", starts_on: "2026-10-12", starts_at: "2026-10-11T23:00:00Z", ends_at: "2026-10-18T23:00:00Z" };

function row(id: string, overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id,
    user_id: "leo",
    name: id,
    category: "other",
    points: 2,
    needs_photo: false,
    due_at: at(9).toISOString(),
    original_due_at: null,
    group_name: null,
    done_at: null,
    photo_path: null,
    outcome: null,
    excused: false,
    covered_by: null,
    week_id: "w1",
    ...overrides,
  };
}

function boardOf(rows: AssignmentRow[]): WeekBoard {
  return buildWeekBoard({
    week: WEEK,
    assignments: rows,
    disputes: [],
    memberIds: PEOPLE.map((p) => p.userId),
    userId: "sam",
    everDealt: true,
    disputeHours: 0,
    now,
  });
}

describe("a tick waiting for an OK", () => {
  it("never settles by itself, and settles as usual once answered", () => {
    const facts = { dueAt: at(9), doneAt: at(-2), excused: false, disputeOpen: false, weekEndsAt: at(100) };
    expect(settleOutcome({ ...facts, awaitsOk: true }, at(1000), 0)).toBeNull();
    expect(settleOutcome({ ...facts, awaitsOk: false }, now, 0)).toBe("done");
  });

  it("is being checked, with no time it stands", () => {
    const item = boardOf([row("Feed the fish", { done_at: at(-2).toISOString(), awaits_ok: true })]).items[0];
    expect(item).toMatchObject({ status: "checking", awaitsOk: true, standsAt: null });
    expect(tickedLine(item, PEOPLE, "sam", RULES, now, words)).toBe(`Leo ticked this at 10:00, ${words('today.parentOk.waiting')}`);
  });
});

describe("Needs your OK", () => {
  const board = boardOf([
    row("Tidy your room", { user_id: "maya", done_at: at(-1).toISOString(), awaits_ok: true }),
    row("Feed the fish", { done_at: at(-2).toISOString(), awaits_ok: true }),
    row("Bins", { user_id: "sam", done_at: at(-3).toISOString() }),
  ]);

  it("lists the kids' waiting ticks for a parent, oldest first", () => {
    expect(todayView(board, "sam", undefined, true).toOk.map((i) => i.name)).toEqual(["Feed the fish", "Tidy your room"]);
  });

  it("is empty for a kid, and for anyone not asked as a parent", () => {
    expect(todayView(board, "maya", undefined, false).toOk).toEqual([]);
    expect(todayView(board, "sam").toOk).toEqual([]);
  });

  it("says who did what, when, and who can answer", () => {
    const fish = board.items.find((i) => i.name === "Feed the fish") as BoardItem;
    expect(okTitle(fish, PEOPLE, words)).toBe("Leo did Feed the fish");
    expect(okMeta(fish, now, words)).toBe("Ticked 2h ago");
    expect(okWho(fish, PEOPLE, ["sam", "alex"], "alex", words)).toBe("You or Sam can OK it. Not yet sends it back to Leo.");
    expect(okWho(fish, PEOPLE, ["sam"], "maya", words)).toBe("Sam can OK it. Not yet sends it back to Leo.");
  });
});

describe("a family's rules and words", () => {
  it("hides the vote, and its rules say a parent OKs each kid's tick", () => {
    expect(familyHides("family").vote).toBe(true);
    expect(familyHides("housemates").vote).toBe(false);
    const rows = rulesRows({ ...RULES, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 }, 100, words, "jonz", "family");
    expect(rows.map((r) => r.label)).not.toContain(words('house.setup.disputes'));
    expect(rows).toContainEqual({ label: words('today.parentOk.rulesLabel'), value: words('today.parentOk.rulesValue') });
  });

  it("puts a parent's answer on the Wall", () => {
    const post = (kind: string) =>
      wallFeedRow(
        wallEvents([{ id: kind, kind, user_id: "sam", assignment_id: "a1", data: { name: "Feed the fish", against: "leo" }, created_at: now.toISOString(), assignments: null, reactions: [] }], "maya")[0],
        { me: "maya", members: PEOPLE.map((p) => ({ userId: p.userId, name: p.name })), currency: "GBP", zone: "Europe/London", now },
        wordsFor("en", "family"),
      );
    expect(post("okayed").title).toBe("Sam OK’d Leo’s Feed the fish");
    expect(post("not_yet")).toMatchObject({ title: "Sam sent Leo’s Feed the fish back", detail: "Open again", family: "trouble" });
  });

  it("speaks the Today tab's badge as OKs in a family", () => {
    expect(FOCUS_SHELL_COPY.tab("Today", 2, true)).toBe("Today, 2 waiting for your OK");
    expect(FOCUS_SHELL_COPY.tab("Today", 2)).toBe("Today, 2 waiting for your vote");
  });
});
