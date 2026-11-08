import { describe, expect, it } from "vitest";

import {
  describeEvent,
  photoPaths,
  REACTABLE,
  REACTION_LABEL,
  REACTIONS,
  toggled,
  wallEvents,
  type WallLine,
  type WallRow,
} from "./wall";

function row(overrides: Partial<WallRow> = {}): WallRow {
  return {
    id: "e1",
    kind: "done",
    user_id: "ben",
    assignment_id: "a1",
    data: { name: "Bins" },
    created_at: "2026-10-21T12:00:00Z",
    assignments: null,
    reactions: [],
    ...overrides,
  };
}

const NAMES: Record<string, string> = { ava: "You", ben: "Ben", cal: "Cal" };
const nameOf = (id: string | null) => (id ? (NAMES[id] ?? "Someone") : "Someone");

function line(kind: string, data: Record<string, unknown> = {}, userId: string | null = "ben"): string {
  const [event] = wallEvents([row({ kind, data, user_id: userId })], "ava");
  return text(describeEvent(event, nameOf, "GBP"));
}

const text = (l: WallLine) => l.parts.map((p) => p.text).join("");

describe("an admin's reset", () => {
  it("says who fixed what", () => {
    expect(line("reset", { what: "person_week", subject: "ben" }, "ava")).toBe("You reset Ben’s week.");
    expect(line("reset", { what: "result", name: "Bins", outcome: "done", subject: "ava" }, "cal")).toBe("Cal marked your Bins done.");
    expect(line("reset", { what: "letoff", month: "2026-10" }, "cal")).toBe("Cal let everyone off October’s forfeits.");
  });
});

describe("wallEvents", () => {
  it("counts each reaction and marks yours", () => {
    const [event] = wallEvents(
      [
        row({
          reactions: [
            { user_id: "ava", kind: "nice" },
            { user_id: "ben", kind: "nice" },
            { user_id: "ben", kind: "eyes" },
          ],
        }),
      ],
      "ava",
    );
    expect(event.reactions).toEqual({
      nice: { count: 2, mine: true },
      fire: { count: 0, mine: false },
      sparkle: { count: 0, mine: false },
      eyes: { count: 1, mine: false },
    });
  });

  it("reads nothing into missing reactions, data or dates", () => {
    const [event] = wallEvents([row({ reactions: null, data: null })], "ava");
    expect(event.data).toEqual({});
    expect(Object.values(event.reactions).every((r) => r.count === 0 && !r.mine)).toBe(true);
    expect(event.createdAt).toEqual(new Date("2026-10-21T12:00:00Z"));
    expect(wallEvents([], "ava")).toEqual([]);
  });

  it("keeps a receipt only on a tick, and only once each", () => {
    const events = wallEvents(
      [
        row({ id: "e1", kind: "done", assignments: { photo_path: "h/a1/p.jpg" } }),
        row({ id: "e2", kind: "late", assignments: { photo_path: "h/a2/p.jpg" } }),
        row({ id: "e3", kind: "upheld", assignments: { photo_path: "h/a1/p.jpg" } }),
        row({ id: "e4", kind: "done", assignments: { photo_path: "h/a1/p.jpg" } }),
        row({ id: "e5", kind: "done", assignments: { photo_path: null } }),
      ],
      "ava",
    );
    expect(events.map((e) => e.photoPath)).toEqual(["h/a1/p.jpg", "h/a2/p.jpg", null, "h/a1/p.jpg", null]);
    expect(photoPaths(events)).toEqual(["h/a1/p.jpg", "h/a2/p.jpg"]);
    expect(photoPaths([])).toEqual([]);
  });
});

describe("toggled", () => {
  const none = wallEvents([row()], "ava")[0].reactions;

  it("adds your reaction, and takes it back", () => {
    const once = toggled(none, "fire");
    expect(once.fire).toEqual({ count: 1, mine: true });
    expect(toggled(once, "fire").fire).toEqual({ count: 0, mine: false });
    expect(once.nice).toEqual(none.nice);
  });
});

describe("reactions", () => {
  it("names every reaction in words, never an emoji", () => {
    for (const kind of REACTIONS) expect(REACTION_LABEL[kind]).toMatch(/^[A-Za-z -]+$/);
    expect(REACTABLE.has("done")).toBe(true);
    expect(REACTABLE.has("joined")).toBe(false);
  });
});

describe("describeEvent", () => {
  it("tells who flagged an on-call John, and who it went to", () => {
    expect(line("flagged", { name: "Bins", by: "cal" })).toBe("Cal flagged Bins for Ben.");
    expect(line("flagged", { name: "Bins", by: "ava" }, "ben")).toBe("You flagged Bins for Ben.");
    expect(line("flagged", { name: "Bins", by: "ben" })).toBe("Ben said Bins needed doing.");
    expect(line("flagged", { name: "Bins", by: null })).toBe("Bins still needs doing. It’s with Ben now.");
    const [event] = wallEvents([row({ kind: "flagged", data: { name: "Bins" } })], "ava");
    expect(describeEvent(event, nameOf, "GBP").icon).toBe("bell-ring");
  });

  it("tells a tick, a late one and a miss", () => {
    expect(line("done", { name: "Bins" })).toBe("Ben did Bins.");
    expect(line("late", { name: "Bins" })).toBe("Ben did Bins, late.");
    expect(line("missed", { name: "Bins" })).toBe("Ben missed Bins.");
    expect(line("done", { name: "Bins" }, "ava")).toBe("You did Bins.");
    expect(line("done", {})).toBe("Ben did a John.");
  });

  it("sets the person in bold, and gives the line its tone", () => {
    const [event] = wallEvents([row({ kind: "missed" })], "ava");
    const l = describeEvent(event, nameOf, "GBP");
    expect(l.parts[0]).toEqual({ text: "Ben", bold: true });
    expect(l).toMatchObject({ icon: "x", tone: "hazard" });
  });

  it("tells a dispute and how the house decided", () => {
    expect(line("disputed", { name: "Bins", against: "cal", reason: "Still full" })).toBe(
      "Ben disputed Cal’s Bins: “Still full”",
    );
    expect(line("disputed", { name: "Bins", against: "ava", reason: "Hmm" })).toBe("Ben disputed your Bins: “Hmm”");
    expect(line("upheld", { name: "Bins", against: "cal" }, null)).toBe("The house struck Cal’s tick on Bins. It’s open again.");
    expect(line("rejected", { name: "Bins", against: "ava" }, null)).toBe("The house backed your Bins. The tick stands.");
  });

  it("tells the perks, earned and spent", () => {
    expect(line("immunity_earned", { streak: 4 })).toBe("Ben earned a skip: 4 clean weeks in a row.");
    expect(line("swap_earned")).toBe("Ben topped the week and earned a swap.");
    expect(line("immunity_used", { name: "Bins" })).toBe("Ben used a skip on Bins.");
    expect(line("swap_used", { gave: "Bins", took: "Hob", with: "cal" })).toBe("Ben swapped Bins for Cal’s Hob.");
  });

  it("says who changed the house rules, and what", () => {
    expect(line("rules", { changes: { missed_forfeit_minor: [300, 0] } })).toBe("Ben changed the missed fine from £3 to £0.");
  });

  it("tells time away, with the Johns it moved", () => {
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 0 })).toBe("Ben is away 26–28 Oct.");
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 1 }, "ava")).toBe(
      "You are away 26–28 Oct. 1 John is due before you go.",
    );
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 2 })).toBe(
      "Ben is away 26–28 Oct. 2 Johns are due before they go.",
    );
  });

  it("says what time away handed on or skipped, and when it was cancelled or ended early", () => {
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 3, handed: 1, excused: 1 })).toBe(
      "Ben is away 26–28 Oct. 1 John is due before they go. 1 John went to housemates. 1 John skipped, with nobody home to take it.",
    );
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 2, handed: 2, cancelled: true })).toBe(
      "Ben cancelled time away, 26–28 Oct.",
    );
    expect(line("away", { starts_on: "2026-10-26", ends_on: "2026-10-28", moved: 0, back_on: "2026-10-27" })).toBe(
      "Ben came back early from time away, 26–28 Oct.",
    );
  });

  it("tells the house’s comings and the Stake", () => {
    expect(line("joined")).toBe("Ben moved in.");
    expect(line("moving_out", { on: "2026-11-11" })).toBe("Ben moves out on Wed 11 Nov.");
    expect(line("moving_out", { on: "2026-11-11" }, "ava")).toBe("You move out on Wed 11 Nov.");
    expect(line("moving_out", { on: null })).toBe("Ben is staying after all.");
    expect(line("moved_out", { who: "Ben Okafor" })).toBe("Ben moved out.");
    // The buyer took the House Pass with them.
    expect(line("moved_out", { who: "Ben Okafor", pass_until: "2026-11-29" })).toBe(
      "Ben moved out, and their House Pass went with them. The house keeps the extras until Sun 29 Nov.",
    );
    expect(line("month_closed", { month: "2026-10" }, null)).toBe("October 2026 is closed and its forfeits are split.");
    expect(line("paid", { to: "ava", amount: 250 })).toBe("You got £2.50 from Ben.");
    // Moved into Splitwise rather than paid (houses.settle_in).
    expect(line("paid", { to: "ava", amount: 250, via: "splitwise" })).toBe("You put Ben’s £2.50 into Splitwise.");
  });

  it("says the kind of anything it doesn’t know", () => {
    const [event] = wallEvents([row({ kind: "something_new" })], "ava");
    expect(describeEvent(event, nameOf, "GBP")).toEqual({ icon: "badge-check", parts: [{ text: "something_new" }] });
  });
});

describe("an admin's undo on the Wall", () => {
  it("tells whoever's move it was who took it back", () => {
    expect(line("undone", { by: "ava", what: "tick", name: "Bins" }, "ben")).toBe("You undid Ben’s tick on Bins.");
    expect(line("undone", { by: "cal", what: "flag", name: "Recycling" }, "ava")).toBe("Cal undid your flag on Recycling.");
    expect(line("undone", { by: "ava", what: "away", name: null }, "cal")).toBe("You undid Cal’s time away.");
    expect(line("undone", { by: "cal", what: "reset", name: null }, "ava")).toBe("Cal undid your reset.");
  });

  it("names a move it doesn't know plainly", () => {
    expect(line("undone", { by: "ava", what: "something_new" }, "ben")).toBe("You undid Ben’s change.");
  });
});
