import { describe, expect, it } from "vitest";

import {
  photoPaths,
  REACTABLE,
  REACTION_LABEL,
  REACTIONS,
  toggled,
  wallEvents,
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
