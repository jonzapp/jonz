import { describe, expect, it } from "vitest";

import { ruleChanges, TELL_COPY, tellOf } from "./tell";

const names: Record<string, string> = { ava: "Ava", ben: "Ben", cal: "Cal" };
const nameOf = (id: string | null) => (id ? names[id] : "A housemate");
const members = ["ava", "ben", "cal"];
const post = (kind: string, userId: string | null, data: Record<string, unknown>) => ({ kind, userId, assignmentId: "a1", data });

describe("tellOf", () => {
  it("tells the owner of a covered John, and everyone on a shared one", () => {
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "ava" }), nameOf, members, "GBP")).toMatchObject({
      to: ["ava"],
      title: TELL_COPY.coveredTitle("Bins"),
      body: TELL_COPY.coveredBody("Ben"),
      tag: "john:a1",
    });
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "ava", for_all: ["ava", "cal"] }), nameOf, members, "GBP")?.to).toEqual([
      "ava",
      "cal",
    ]);
  });

  it("tells whoever a swap token was used on", () => {
    const told = tellOf(post("swap_used", "ava", { gave: "Bins", took: "Bathroom", with: "ben" }), nameOf, members, "GBP");
    expect(told).toMatchObject({ to: ["ben"], body: "Ava used a swap token: you have Bins now, and they have Bathroom." });
  });

  it("tells whoever's tick a question decided, either way", () => {
    expect(tellOf(post("upheld", null, { name: "Bins", against: "ava" }), nameOf, members, "GBP")).toMatchObject({
      to: ["ava"],
      body: TELL_COPY.struckBody,
    });
    expect(tellOf(post("rejected", null, { name: "Bins", against: "ava" }), nameOf, members, "GBP")?.title).toBe(
      TELL_COPY.stoodTitle("Bins"),
    );
  });

  it("tells everyone but the admin who changed the rules, in words", () => {
    const told = tellOf(
      post("rules", "ava", { changes: { stake_minor: [2000, 1000], dispute_hours: [24, 12] } }),
      nameOf,
      members,
      "GBP",
    );
    expect(told?.to).toEqual(["ben", "cal"]);
    expect(told?.body).toBe("Ava changed the stake from £20 to £10 a month and the time to check a tick from 24 hours to 12 hours.");
  });

  it("tells nobody who has left, or about posts that aren't news to anyone", () => {
    expect(tellOf(post("covered", "ben", { name: "Bins", for: "gone" }), nameOf, members, "GBP")).toBeNull();
    expect(tellOf(post("done", "ben", { name: "Bins" }), nameOf, members, "GBP")).toBeNull();
  });
});

describe("ruleChanges", () => {
  it("lists every change, and falls back to the rules", () => {
    expect(ruleChanges({ changes: { late_forfeit_minor: [100, 200] } }, "GBP")).toBe("the late fine from £1 to £2");
    expect(ruleChanges({}, "GBP")).toBe("the house rules");
  });
});
