import { describe, expect, it } from "vitest";

import { ruleChanges, tellOf } from "./tell";
import { REDO_HOURS } from "./dispute";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const names: Record<string, string> = { ava: "Ava", ben: "Ben", cal: "Cal" };
const nameOf = (id: string | null) => (id ? names[id] : "A housemate");
const members = ["ava", "ben", "cal"];
const post = (kind: string, userId: string | null, data: Record<string, unknown>) => ({ kind, userId, assignmentId: "a1", data });

describe("tellOf", () => {
  it("tells the owner of a covered John, and everyone on a shared one", () => {
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "ava" }), nameOf, members, "GBP", words)).toMatchObject({
      to: ["ava"],
      title: words('wall.tell.coveredTitle', { john: "Bins" }),
      body: words('wall.tell.coveredBody', { who: "Ben" }),
      tag: "john:a1",
    });
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "ava", for_all: ["ava", "cal"] }), nameOf, members, "GBP", words)?.to).toEqual([
      "ava",
      "cal",
    ]);
  });

  it("tells whoever a swap token was used on", () => {
    const told = tellOf(post("swap_used", "ava", { gave: "Bins", took: "Bathroom", with: "ben" }), nameOf, members, "GBP", words);
    expect(told).toMatchObject({ to: ["ben"], body: "Ava used a swap: you have Bins now, and they have Bathroom." });
  });

  it("tells whoever's tick a question decided, either way", () => {
    expect(tellOf(post("upheld", null, { name: "Bins", against: "ava" }), nameOf, members, "GBP", words)).toMatchObject({
      to: ["ava"],
      body: words("wall.tell.struckBody", { hours: REDO_HOURS }),
    });
    expect(tellOf(post("rejected", null, { name: "Bins", against: "ava" }), nameOf, members, "GBP", words)?.title).toBe(
      words('wall.tell.stoodTitle', { john: "Bins" }),
    );
  });

  it("tells everyone but the admin who changed the rules, in words", () => {
    const told = tellOf(
      post("rules", "ava", { changes: { stake_minor: [2000, 1000], dispute_hours: [24, 12] } }),
      nameOf,
      members,
      "GBP",
     words);
    expect(told?.to).toEqual(["ben", "cal"]);
    expect(told?.body).toBe("Ava changed the stake from £20 to £10 a month and the time to check a tick from 24 hours to 12 hours.");
  });

  it("tells nobody who has left, or about posts that aren't news to anyone", () => {
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "gone" }), nameOf, members, "GBP", words)).toBeNull();
    expect(tellOf(post("done", "ben", { name: "Bins" }), nameOf, members, "GBP", words)).toBeNull();
  });
});

describe("ruleChanges", () => {
  it("lists every change, and falls back to the rules", () => {
    expect(ruleChanges({ changes: { late_forfeit_minor: [100, 200] } }, "GBP", words)).toBe("the late forfeit from £1 to £2");
    expect(ruleChanges({}, "GBP", words)).toBe("the house rules");
  });
});
