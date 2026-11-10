import { describe, expect, it } from "vitest";

import {
  actionLine,
  historyDayLabel,
  historyDays,
  historyFor,
  historyItems,
  historyMeta,
  historyTime,
  type ActionRow,
  undoneWhat,
} from "./history";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const ZONE = "Europe/London";

function row(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: "h1",
    kind: "tick",
    done_by: "ben",
    subject_user_id: "ben",
    assignment_id: "a1",
    ref: null,
    data: { name: "Bins" },
    created_at: "2026-10-29T20:04:00Z",
    undone_at: null,
    undone_by: null,
    reach: "own",
    ...overrides,
  };
}

const NAMES: Record<string, string> = { ava: "You", ben: "Ben", cal: "Cal" };
const nameOf = (id: string | null) => (id ? (NAMES[id] ?? "Someone") : "Someone");

describe("historyItems", () => {
  it("reads rows, dates and reach", () => {
    const [item] = historyItems([row({ undone_at: "2026-10-29T21:00:00Z", undone_by: "ava", reach: null })]);
    expect(item).toMatchObject({ kind: "tick", actor: "ben", assignmentId: "a1", reach: null, undoneBy: "ava" });
    expect(item.at.toISOString()).toBe("2026-10-29T20:04:00.000Z");
    expect(item.undoneAt?.toISOString()).toBe("2026-10-29T21:00:00.000Z");
  });

  it("drops kinds this app doesn't know, and reach it doesn't know", () => {
    expect(historyItems([row({ kind: "teleport" })])).toEqual([]);
    expect(historyItems([row({ reach: "everyone" })])[0].reach).toBeNull();
    expect(historyItems([row({ data: null })])[0].data).toEqual({});
    expect(historyItems([])).toEqual([]);
  });
});

describe("historyFor", () => {
  const items = historyItems([row({ id: "1", done_by: "ava" }), row({ id: "2", done_by: "ben" })]);
  it("keeps only yours for Mine, everything otherwise", () => {
    expect(historyFor(items, "ava", true).map((i) => i.id)).toEqual(["1"]);
    expect(historyFor(items, "ava", false).map((i) => i.id)).toEqual(["1", "2"]);
  });
});

describe("actionLine", () => {
  const say = (kind: Parameters<typeof actionLine>[0], data: Record<string, unknown>, who = "Ben", subject = "Ben") =>
    actionLine(kind, data, who, subject, "GBP", words);

  it("says each move", () => {
    expect(say("tick", { name: "Bins" })).toBe("Ben ticked Bins");
    expect(say("tick", { name: "Bins", late: true }, "You", "You")).toBe("You ticked Bins, late");
    expect(say("cover", { name: "Bins" }, "Cal", "You")).toBe("Cal covered your Bins");
    expect(say("flag", { name: "Recycling" }, "You")).toBe("You flagged Recycling");
    expect(say("swap", { name: "Hoover", gave: "Bins" }, "You", "Cal")).toBe("You swapped Bins for Cal’s Hoover");
    expect(say("immunity", { name: "Oven" })).toBe("Ben used a skip on Oven");
    expect(say("dispute", { name: "Bins" }, "Cal", "Ben")).toBe("Cal disputed Ben’s Bins");
    expect(say("vote", { name: "Bins", uphold: true }, "You", "Ben")).toBe("You voted to strike Ben’s Bins");
    expect(say("vote", { name: "Bins", uphold: false }, "Cal", "You")).toBe("Cal voted to keep your Bins");
    expect(say("payment", { amount: 401 }, "You", "Ben")).toBe("You got £4.01 from Ben");
    expect(say("away", { starts_on: "2026-11-02", ends_on: "2026-11-04" }, "Cal")).toMatch(/^Cal booked time away, /);
    expect(say("role", { from: "member", to: "admin" }, "You", "Cal")).toBe("You made Cal an admin");
    expect(say("role", { from: "admin", to: "member" }, "Cal", "You")).toBe("Cal made you a housemate");
    expect(actionLine("role", { to: "admin" }, "You", "Cal", "GBP", wordsFor("en", "family"))).toBe("You made Cal a parent");
    expect(say("remove", {}, "You", "Cal")).toBe("You removed Cal from the house");
  });

  it("copes with a John with no name", () => {
    expect(say("tick", {})).toBe("Ben ticked a John");
  });
});

describe("undoneWhat", () => {
  it("names the thing taken back", () => {
    expect(undoneWhat("tick", "Bins", words)).toBe("tick on Bins");
    expect(undoneWhat("payment", null, words)).toBe("payment");
    expect(undoneWhat("cover", null, words)).toBe("cover of a John");
    expect(undoneWhat("nope", "x", words)).toBe("change");
  });
});

describe("historyMeta", () => {
  it("is the time, plus undone or locked", () => {
    const [open] = historyItems([row()]);
    expect(historyMeta(open, "21:04", nameOf, words)).toBe("21:04");
    const [locked] = historyItems([row({ reach: null })]);
    expect(historyMeta(locked, "21:04", nameOf, words)).toBe("21:04, Can’t be undone now");
    const [own] = historyItems([row({ undone_at: "2026-10-29T21:00:00Z", undone_by: "ben" })]);
    expect(historyMeta(own, "21:04", nameOf, words)).toBe("21:04, Undone");
    const [admin] = historyItems([row({ undone_at: "2026-10-29T21:00:00Z", undone_by: "ava", reach: null })]);
    expect(historyMeta(admin, "21:04", nameOf, words)).toBe("21:04, Undone by You");
  });
});

describe("historyDays", () => {
  it("groups by the house's local day, newest first", () => {
    const items = historyItems([
      row({ id: "1", created_at: "2026-10-29T23:30:00Z" }), // 23:30 GMT, Thu
      row({ id: "2", created_at: "2026-10-29T08:00:00Z" }),
      row({ id: "3", created_at: "2026-10-28T12:00:00Z" }),
      row({ id: "4", created_at: "2026-10-20T12:00:00Z" }),
    ]);
    const days = historyDays(items, ZONE);
    expect(days.map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([
      ["2026-10-29", ["1", "2"]],
      ["2026-10-28", ["3"]],
      ["2026-10-20", ["4"]],
    ]);
    const now = new Date("2026-10-29T23:45:00Z");
    expect(days.map((d) => historyDayLabel(d, now, ZONE, words))).toEqual(["Today", "Yesterday", "Tue 20 Oct"]);
  });

  it("splits at midnight in the house's zone, not UTC", () => {
    // 23:30 UTC on 1 Jul is 00:30 on 2 Jul in London (BST).
    const days = historyDays(historyItems([row({ created_at: "2026-07-01T23:30:00Z" })]), ZONE);
    expect(days[0].date).toBe("2026-07-02");
  });

  it("is empty for nothing", () => {
    expect(historyDays([], ZONE)).toEqual([]);
  });
});

describe("historyTime", () => {
  it("is the time in the house's zone", () => {
    expect(historyTime(new Date("2026-07-01T20:04:00Z"), ZONE)).toBe("21:04");
    expect(historyTime(new Date("2026-12-01T20:04:00Z"), ZONE)).toBe("20:04");
  });
});
