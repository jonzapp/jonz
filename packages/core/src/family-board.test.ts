import { describe, expect, it } from "vitest";

import type { BoardItem } from "./board";
import { boardColumns } from "./family-board";

/** The board's columns (docs/specs/family-houses.md, "The board"), on a pretend clock. */

// Wednesday 14 Oct 2026, noon in London.
const now = new Date("2026-10-14T11:00:00Z");
const ZONE = "Europe/London";
const KIDS = [
  { userId: "leo", name: "Leo" },
  { userId: "maya", name: "Maya" },
];

function item(id: string, over: Partial<BoardItem> = {}): BoardItem {
  return {
    id,
    userId: "leo",
    name: id,
    dueAt: new Date("2026-10-14T16:00:00Z"),
    doneAt: null,
    status: "upcoming",
    awaitsOk: false,
    absentAt: null,
    ...over,
  } as BoardItem;
}

describe("boardColumns", () => {
  it("gives each kid what's still to do today, then what waits for an OK, then what's done today", () => {
    const items = [
      item("later", { dueAt: new Date("2026-10-14T18:00:00Z") }),
      item("earlier", { dueAt: new Date("2026-10-14T08:00:00Z"), status: "overdue" }),
      item("tomorrow", { dueAt: new Date("2026-10-15T08:00:00Z") }),
      item("waits", { doneAt: now, awaitsOk: true, status: "done" }),
      item("done", { doneAt: now, status: "done" }),
      item("yesterday", { doneAt: new Date("2026-10-13T10:00:00Z"), status: "done" }),
      item("maya's", { userId: "maya" }),
      item("left off", { absentAt: now }),
    ];
    const [leo, maya] = boardColumns(items, KIDS, now, ZONE);
    expect(leo.name).toBe("Leo");
    expect(leo.items.map((i) => i.id)).toEqual(["earlier", "later", "waits", "done"]);
    expect(leo.toDo).toBe(2);
    expect(maya.items.map((i) => i.id)).toEqual(["maya's"]);
  });

  it("keeps a column for a kid with nothing today", () => {
    const [, maya] = boardColumns([item("a")], KIDS, now, ZONE);
    expect(maya).toEqual({ userId: "maya", name: "Maya", items: [], toDo: 0 });
  });
});
