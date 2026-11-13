import { describe, expect, it } from "vitest";

import {
  actionLine,
  historyItems,
  type ActionRow,
  undoable,
  undoableOn,
  undoForPost,
  undoneWhat,
} from "./history";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

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

describe("undo from a post's sheet", () => {
  const items = historyItems([
    row({ id: "tick", data: { name: "Bins", event: "e-tick" } }),
    row({ id: "done-before", data: { name: "Bins", event: "e-old" }, undone_at: "2026-10-29T21:00:00Z" }),
    row({ id: "settled", data: { name: "Hob", event: "e-settled" }, reach: null }),
    row({ id: "flag", kind: "flag", assignment_id: "a-flag", data: { name: "Bin bags" } }),
    row({ id: "away", kind: "away", assignment_id: null, ref: "away-1", data: { starts_on: "2026-11-02", ends_on: "2026-11-04" } }),
    row({ id: "remove", kind: "remove", done_by: "ava", subject_user_id: "cal", assignment_id: null, created_at: "2026-10-29T20:04:30Z", data: {} }),
    row({ id: "swap", kind: "swap", assignment_id: "a-took", ref: "a-gave", data: { name: "Hob", gave: "Bath", event: "e-swap" } }),
    row({ id: "vote", kind: "vote", assignment_id: "a1", data: { name: "Bins", uphold: true } }),
  ]);
  const post = (over: Partial<Parameters<typeof undoForPost>[0]>) => ({
    id: "e-x", kind: "done", userId: "ben", assignmentId: "a1", data: {}, createdAt: new Date("2026-10-29T20:04:00Z"), ...over,
  });

  it("leaves out what's undone or out of reach", () => {
    expect(undoable(items).map((i) => i.id)).not.toContain("done-before");
    expect(undoable(items).map((i) => i.id)).not.toContain("settled");
  });

  it("finds the move a post names", () => {
    expect(undoForPost(post({ id: "e-tick" }), items)?.id).toBe("tick");
    expect(undoForPost(post({ id: "e-swap", kind: "swap_used", assignmentId: "a-took" }), items)?.id).toBe("swap");
  });

  it("offers nothing once it's undone or settled", () => {
    expect(undoForPost(post({ id: "e-old" }), items)).toBeNull();
    expect(undoForPost(post({ id: "e-settled" }), items)).toBeNull();
    expect(undoForPost(post({ id: "e-miss", kind: "missed" }), items)).toBeNull();
  });

  it("finds a flag by its John, time away by its booking, a removal by its post", () => {
    expect(undoForPost(post({ kind: "flagged", assignmentId: "a-flag" }), items)?.id).toBe("flag");
    expect(undoForPost(post({ kind: "away", assignmentId: null, data: { away: "away-1" } }), items)?.id).toBe("away");
    expect(undoForPost(post({ kind: "away", assignmentId: null, data: { away: "away-2" } }), items)).toBeNull();
    expect(undoForPost(post({ kind: "moved_out", userId: "cal", assignmentId: null }), items)?.id).toBe("remove");
    // Someone who left of their own accord, a day later: not that removal.
    expect(undoForPost(post({ kind: "moved_out", userId: "cal", assignmentId: null, createdAt: new Date("2026-10-30T20:04:00Z") }), items)).toBeNull();
  });

  it("lists every move about one John, a swap from either side", () => {
    expect(undoableOn("a1", items).map((i) => i.id)).toEqual(["tick", "vote"]);
    expect(undoableOn("a-gave", items).map((i) => i.id)).toEqual(["swap"]);
    expect(undoableOn("a-took", items).map((i) => i.id)).toEqual(["swap"]);
  });
});
