import { describe, expect, it } from "vitest";

import { verdict, votersOn } from "./dispute";

const closesAt = new Date("2026-10-09T12:00:00Z");
const before = new Date("2026-10-09T08:00:00Z");

describe("verdict", () => {
  it("decides at once on a majority", () => {
    // Four housemates: three may vote, two is a majority.
    expect(verdict({ eligible: 3, uphold: 2, reject: 0, closesAt }, before)).toBe("upheld");
    expect(verdict({ eligible: 3, uphold: 1, reject: 2, closesAt }, before)).toBe("rejected");
  });

  it("waits while it is still open and undecided", () => {
    expect(verdict({ eligible: 3, uphold: 1, reject: 0, closesAt }, before)).toBeNull();
    expect(verdict({ eligible: 4, uphold: 2, reject: 1, closesAt }, before)).toBeNull();
  });

  it("leaves the tick standing when the vote closes without a majority to strike it", () => {
    // Six housemates: five may vote, three is a majority. Two to strike isn't enough.
    expect(verdict({ eligible: 5, uphold: 2, reject: 1, closesAt }, closesAt)).toBe("rejected");
    expect(verdict({ eligible: 5, uphold: 1, reject: 1, closesAt }, closesAt)).toBe("rejected");
  });

  it("never strikes on one silent objection in a house of three or more", () => {
    // The raiser's own vote, and nobody else says anything.
    expect(verdict({ eligible: 2, uphold: 1, reject: 0, closesAt }, before)).toBeNull();
    expect(verdict({ eligible: 2, uphold: 1, reject: 0, closesAt }, closesAt)).toBe("rejected");
    expect(verdict({ eligible: 3, uphold: 1, reject: 0, closesAt }, closesAt)).toBe("rejected");
  });

  it("lets the tick stand as soon as a strike can't reach a majority", () => {
    expect(verdict({ eligible: 4, uphold: 2, reject: 2, closesAt }, before)).toBe("rejected");
    expect(verdict({ eligible: 4, uphold: 1, reject: 2, closesAt }, before)).toBe("rejected");
    expect(verdict({ eligible: 4, uphold: 1, reject: 1, closesAt }, before)).toBeNull();
  });

  it("with one voter, waits for the vote to close before striking", () => {
    // A house of two: the one who asked can't strike it alone at once; the ticker has until the close to send a photo.
    expect(verdict({ eligible: 1, uphold: 1, reject: 0, closesAt }, before)).toBeNull();
    expect(verdict({ eligible: 1, uphold: 1, reject: 0, closesAt }, closesAt)).toBe("upheld");
    // They took the question back before it closed: the tick stands.
    expect(verdict({ eligible: 1, uphold: 0, reject: 0, closesAt }, closesAt)).toBe("rejected");
  });
});

describe("votersOn", () => {
  const house = ["ava", "ben", "cal"];

  it("is everyone but whoever ticked it", () => {
    expect(votersOn(house, { userId: "ava", coveredBy: null })).toEqual(["ben", "cal"]);
  });

  it("on a cover, leaves out the coverer and whoever's John it was", () => {
    expect(votersOn(house, { userId: "ava", coveredBy: "ben" })).toEqual(["cal"]);
    expect(votersOn(["ava", "ben"], { userId: "ava", coveredBy: "ben" })).toEqual([]);
  });
});
