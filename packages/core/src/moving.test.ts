import { describe, expect, it } from "vitest";

import { askWhosMovingIn, movingLine, movingOutAway, remindMoverNow, stillHere } from "./moving";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const sam = { userId: "sam", movingOutOn: "2026-11-11" };
const ada = { userId: "ada", movingOutOn: null };

describe("stillHere", () => {
  it("keeps everyone without a date", () => {
    expect(stillHere([ada], "2026-11-09")).toEqual([ada]);
  });

  it("keeps someone moving out part-way through the week", () => {
    expect(stillHere([sam, ada], "2026-11-09")).toEqual([sam, ada]);
  });

  it("leaves out someone gone by the week's first day, that day included", () => {
    expect(stillHere([sam, ada], "2026-11-11")).toEqual([ada]);
    expect(stillHere([sam, ada], "2026-11-16")).toEqual([ada]);
  });

  it("handles nobody", () => {
    expect(stillHere([], "2026-11-09")).toEqual([]);
  });
});

describe("movingOutAway", () => {
  it("is away from the moving-out day to the end", () => {
    expect(movingOutAway([sam, ada], "2026-11-09", "2026-11-29")).toEqual([
      { id: "moving-out:sam", userId: "sam", startsOn: "2026-11-11", endsOn: "2026-11-29", note: null },
    ]);
  });

  it("says nothing for a date after the span", () => {
    expect(movingOutAway([sam], "2026-11-02", "2026-11-08")).toEqual([]);
  });

  it("says nothing for someone not dealt the week at all", () => {
    expect(movingOutAway([sam], "2026-11-11", "2026-11-29")).toEqual([]);
  });

  it("covers a date on the span's last day", () => {
    expect(movingOutAway([sam], "2026-11-05", "2026-11-11")).toHaveLength(1);
  });
});

describe("movingLine", () => {
  it("says the day ahead", () => {
    expect(movingLine("2026-11-11", "2026-11-01", "Flat 4", words)).toBe("You move out on Wed 11 Nov");
  });

  it("says it's moving day on the day and after", () => {
    expect(movingLine("2026-11-11", "2026-11-11", "Flat 4", words)).toBe("Moving day. Leave Flat 4 from House when you’re ready");
    expect(movingLine("2026-11-11", "2026-11-20", "Flat 4", words)).toMatch(/^Moving day/);
  });

  it("says nothing with no date", () => {
    expect(movingLine(null, "2026-11-01", "Flat 4", words)).toBeNull();
  });
});

describe("askWhosMovingIn", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("asks while a housemate has a date", () => {
    expect(askWhosMovingIn({ me: "ada", members: [sam, ada], lastMovedOut: null, lastJoined: null, now })).toBe(true);
  });

  it("never asks the one moving out", () => {
    expect(askWhosMovingIn({ me: "sam", members: [sam, ada], lastMovedOut: null, lastJoined: null, now })).toBe(false);
  });

  it("asks for 30 days after someone left", () => {
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: days(29), lastJoined: null, now })).toBe(true);
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: days(30), lastJoined: null, now })).toBe(true);
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: days(31), lastJoined: null, now })).toBe(false);
  });

  it("stops once someone moves in", () => {
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: days(5), lastJoined: days(2), now })).toBe(false);
  });

  it("still asks when the last move-in came before the move-out", () => {
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: days(5), lastJoined: days(50), now })).toBe(true);
  });

  it("asks nothing of a house nobody is leaving", () => {
    expect(askWhosMovingIn({ me: "ada", members: [ada], lastMovedOut: null, lastJoined: days(3), now })).toBe(false);
  });
});

describe("remindMoverNow", () => {
  const left = new Date("2026-11-01T10:00:00Z");
  const after = (days: number) => new Date(left.getTime() + days * 86_400_000);

  it("waits two weeks", () => {
    expect(remindMoverNow(left, after(13.9))).toBe(false);
    expect(remindMoverNow(left, after(14))).toBe(true);
  });

  it("gives up at 30 days", () => {
    expect(remindMoverNow(left, after(29.9))).toBe(true);
    expect(remindMoverNow(left, after(30))).toBe(false);
  });
});
