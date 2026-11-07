import { describe, expect, it } from "vitest";

import { pointsEarned, standings, weekWinners } from "./points";
import { earnsImmunity, grantToken, isCleanWeek, streakLength } from "./streak";

describe("pointsEarned", () => {
  it("pays full for on time, half for late, nothing otherwise", () => {
    expect(pointsEarned("done", 5)).toBe(5);
    expect(pointsEarned("checking", 5)).toBe(5);
    expect(pointsEarned("late", 5)).toBe(3);
    expect(pointsEarned("late", 1)).toBe(1);
    expect(pointsEarned("missed", 5)).toBe(0);
    expect(pointsEarned("excused", 5)).toBe(0);
    expect(pointsEarned("overdue", 5)).toBe(0);
  });
});

describe("standings", () => {
  const table = standings(
    [
      { userId: "priya", points: 5, status: "done" },
      { userId: "priya", points: 2, status: "upcoming" },
      { userId: "sam", points: 2, status: "late" },
      { userId: "sam", points: 4, status: "done" },
      { userId: "tom", points: 3, status: "missed" },
      { userId: "you", points: 2, status: "done" },
      { userId: "you", points: 4, status: "checking" },
    ],
    ["priya", "sam", "tom", "you", "lurker"],
  );

  it("ranks by points earned", () => {
    expect(table.map((r) => [r.userId, r.points, r.rank])).toEqual([
      ["you", 6, 1],
      ["priya", 5, 2],
      ["sam", 5, 2],
      ["lurker", 0, 4],
      ["tom", 0, 4],
    ]);
  });

  it("breaks no ties on points but orders fewer misses first", () => {
    expect(table[3].userId).toBe("lurker");
    expect(table.find((r) => r.userId === "tom")!.missed).toBe(1);
  });

  it("puts fewer late first among those level on points and misses, whatever their ids", () => {
    // Abe's 4 points with one of them late equal Zoe's 4 on time.
    const level = standings(
      [
        { userId: "abe", points: 4, status: "late" },
        { userId: "abe", points: 2, status: "done" },
        { userId: "zoe", points: 4, status: "done" },
      ],
      ["abe", "zoe"],
    );
    expect(level.map((r) => [r.userId, r.points, r.late, r.rank])).toEqual([
      ["zoe", 4, 0, 1],
      ["abe", 4, 1, 1],
    ]);
  });

  it("counts done, late and missed", () => {
    const sam = table.find((r) => r.userId === "sam")!;
    expect([sam.done, sam.late, sam.missed]).toEqual([1, 1, 0]);
  });

  it("names every top scorer as a winner", () => {
    expect(weekWinners(table)).toEqual(["you"]);
    const tie = standings(
      [
        { userId: "a", points: 3, status: "done" },
        { userId: "b", points: 3, status: "done" },
      ],
      ["a", "b"],
    );
    expect(weekWinners(tie).sort()).toEqual(["a", "b"]);
    expect(weekWinners(standings([], ["a"]))).toEqual([]);
  });
});

describe("standings with covers", () => {
  it("credits the coverer in full and gives the assignee a miss once it stands", () => {
    const table = standings(
      [
        { userId: "sam", points: 3, status: "covered", coveredBy: "glyn" },
        { userId: "glyn", points: 2, status: "done" },
      ],
      ["glyn", "sam"],
    );
    expect(table).toEqual([
      { userId: "glyn", points: 5, done: 1, late: 0, missed: 0, covered: 1, helped: 0, rank: 1 },
      { userId: "sam", points: 0, done: 0, late: 0, missed: 1, covered: 0, helped: 0, rank: 2 },
    ]);
  });

  it("credits a disputed cover to the coverer provisionally, with no miss yet", () => {
    const [glyn, sam] = standings([{ userId: "sam", points: 3, status: "disputed", coveredBy: "glyn" }], ["glyn", "sam"]);
    expect(glyn).toMatchObject({ userId: "glyn", points: 3, covered: 1 });
    expect(sam).toMatchObject({ userId: "sam", points: 0, missed: 0 });
  });

  it("still marks the miss when the coverer has left the house", () => {
    const [sam] = standings([{ userId: "sam", points: 3, status: "covered", coveredBy: "gone" }], ["sam"]);
    expect(sam).toMatchObject({ points: 0, missed: 1 });
  });

  it("counts a covered week as not clean", () => {
    expect(isCleanWeek(["done", "covered"])).toBe(false);
  });
});

describe("streaks", () => {
  it("knows a clean week", () => {
    expect(isCleanWeek(["done", "excused"])).toBe(true);
    expect(isCleanWeek(["done", "late"])).toBe(false);
    expect(isCleanWeek([])).toBeNull();
  });

  it("counts back from the latest week and skips empty ones", () => {
    expect(streakLength([["missed"], ["done"], [], ["done", "done"]])).toBe(2);
    expect(streakLength([["done"], ["late"]])).toBe(0);
    expect(streakLength([])).toBe(0);
  });

  it("earns immunity every fourth clean week", () => {
    expect(earnsImmunity(3, 4)).toBe(true);
    expect(earnsImmunity(4, 4)).toBe(false);
    expect(earnsImmunity(7, 8)).toBe(true);
    expect(earnsImmunity(4, 5)).toBe(false);
    expect(earnsImmunity(4, 0)).toBe(false);
  });

  it("caps tokens", () => {
    expect(grantToken(0, 2)).toBe(1);
    expect(grantToken(2, 2)).toBe(2);
  });
});
