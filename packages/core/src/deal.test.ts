import { describe, expect, it } from "vitest";

import {
  balanceRows,
  CATCH_UP_PACE,
  canDeal,
  carryOver,
  creditedTo,
  catchUpWeeks,
  recentBalances,
  fairShares,
  fairSharesExplained,
  weekShares,
  type DealAssignment,
  type DealJohn,
  type DealMember,
} from "./deal";

const EVERYONE = ["a", "b", "c", "d"];

/** A John the whole house shares, with everyone home. */
const john = (johnId: string, points: number, extra: Partial<DealJohn> = {}): DealJohn => ({
  johnId,
  points,
  lastUserId: null,
  sharers: EVERYONE,
  home: EVERYONE,
  ...extra,
});

const JOHNS: DealJohn[] = [
  john("bathroom", 4),
  john("kitchen", 5),
  john("bins", 2),
  john("hoover", 2),
  john("surfaces", 3),
  john("fridge", 3),
  john("mop", 3),
  john("shop", 2),
];

/** Members with their shares of `johns` and the given balances. */
function members(johns: readonly DealJohn[], ids: string[], balance: number[] = [], makeup = 1): DealMember[] {
  const shares = weekShares(johns, ids, makeup);
  return ids.map((userId, i) => ({ userId, balance: balance[i] ?? 0, share: shares.get(userId)! }));
}

function loads(assignments: DealAssignment[], johns: readonly DealJohn[] = JOHNS) {
  const pts = new Map(johns.map((j) => [j.johnId, j.points]));
  const out = new Map<string, number>();
  for (const a of assignments) out.set(a.userId, (out.get(a.userId) ?? 0) + pts.get(a.johnId)!);
  return out;
}

describe("weekShares", () => {
  it("splits a house-wide John equally", () => {
    const shares = weekShares([john("kitchen", 4)], EVERYONE, 1);
    expect([...shares.values()]).toEqual([1, 1, 1, 1]);
  });

  it("splits a group's John only among the group", () => {
    const upstairs = john("upstairs", 6, { sharers: ["a", "b", "c"], home: ["a", "b", "c"] });
    const downstairs = john("downstairs", 6, { sharers: ["d", "e"], home: ["d", "e"] });
    const shares = weekShares([upstairs, downstairs], ["a", "b", "c", "d", "e"], 1);
    expect(shares.get("a")).toBe(2);
    expect(shares.get("d")).toBe(3);
  });

  it("keeps an away sharer's part when time away is made up in full", () => {
    const shares = weekShares([john("kitchen", 4, { home: ["a", "b", "c"] })], EVERYONE, 1);
    expect(shares.get("d")).toBe(1);
    expect(shares.get("a")).toBe(1);
  });

  it("hands the away part to those home when time away is not made up", () => {
    const shares = weekShares([john("kitchen", 6, { home: ["a", "b", "c"] })], EVERYONE, 0);
    expect(shares.get("d")).toBe(0);
    expect(shares.get("a")).toBe(2);
  });

  it("splits the difference when time away is made up by half", () => {
    const shares = weekShares([john("kitchen", 8, { home: ["a", "b", "c"] })], EVERYONE, 0.5);
    expect(shares.get("d")).toBe(1);
    expect(shares.get("a")).toBeCloseTo(7 / 3);
  });

  it("always adds up to the points that are dealt", () => {
    const johns = [john("kitchen", 5, { home: ["a"] }), john("bins", 3, { home: ["b", "c"] }), john("shop", 2)];
    for (const makeup of [0, 0.5, 1]) {
      const total = [...weekShares(johns, EVERYONE, makeup).values()].reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(10);
    }
  });

  it("skips a John nobody who shares it is home for", () => {
    const empty = john("downstairs", 6, { sharers: ["d"], home: [] });
    expect(canDeal(empty)).toBe(false);
    expect(weekShares([empty], EVERYONE, 1).get("d")).toBe(0);
  });
});

describe("fairShares", () => {
  it("hands out every John exactly once", () => {
    const out = fairShares(JOHNS, members(JOHNS, EVERYONE), "w1");
    expect(out.map((a) => a.johnId).sort()).toEqual(JOHNS.map((j) => j.johnId).sort());
  });

  it("keeps loads within one John of each other", () => {
    const out = fairShares(JOHNS, members(JOHNS, EVERYONE), "w1");
    const l = [...loads(out).values()];
    expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(5);
    expect(l.reduce((s, v) => s + v, 0)).toBe(24);
  });

  it("is deterministic for the same seed", () => {
    const a = fairShares(JOHNS, members(JOHNS, EVERYONE), "2026-10-05");
    const b = fairShares(JOHNS, members(JOHNS, EVERYONE), "2026-10-05");
    expect(a).toEqual(b);
  });

  it("gives someone behind more this week", () => {
    const out = fairShares(JOHNS, members(JOHNS, EVERYONE, [2, 2, 2, -6]), "w1");
    const l = loads(out);
    expect(l.get("d")!).toBeGreaterThan(l.get("a")!);
  });

  it("moves a John on when balances are level", () => {
    const johns = [john("bathroom", 4, { lastUserId: "a", sharers: ["a", "b"], home: ["a", "b"] })];
    const out = fairShares(johns, members(johns, ["a", "b"]), "w1");
    expect(out[0].userId).toBe("b");
  });

  it("still lets fairness beat variety when the gap is real", () => {
    const johns = [john("bathroom", 4, { lastUserId: "a", sharers: ["a", "b"], home: ["a", "b"] })];
    const out = fairShares(johns, members(johns, ["a", "b"], [0, 5]), "w1");
    expect(out[0].userId).toBe("a");
  });

  it("returns nothing for an empty house", () => {
    expect(fairShares(JOHNS, [], "w1")).toEqual([]);
  });

  it("gives one person everything in a house of one", () => {
    const solo = JOHNS.map((j) => ({ ...j, sharers: ["solo"], home: ["solo"] }));
    const out = fairShares(solo, members(solo, ["solo"]), "w1");
    expect(out).toHaveLength(solo.length);
    expect(new Set(out.map((a) => a.userId))).toEqual(new Set(["solo"]));
  });

  it("spreads equal Johns across people rather than stacking one person", () => {
    const four = ["a1", "a2", "a3", "a4"].map((id) => john(id, 2));
    const out = fairShares(four, members(four, EVERYONE), "w1");
    expect(new Set(out.map((a) => a.userId)).size).toBe(4);
  });

  it("only hands a group's John to the group", () => {
    const upstairs = ["u1", "u2", "u3"].map((id) => john(id, 3, { sharers: ["a", "b", "c"], home: ["a", "b", "c"] }));
    const downstairs = ["d1", "d2"].map((id) => john(id, 3, { sharers: ["d", "e"], home: ["d", "e"] }));
    const johns = [...upstairs, ...downstairs];
    const out = fairShares(johns, members(johns, ["a", "b", "c", "d", "e"]), "w1");
    for (const a of out) {
      const j = johns.find((x) => x.johnId === a.johnId)!;
      expect(j.sharers).toContain(a.userId);
    }
    expect(new Set(out.filter((a) => a.johnId.startsWith("d")).map((a) => a.userId))).toEqual(new Set(["d", "e"]));
  });

  it("never hands someone a John due on a day they are away", () => {
    const johns = JOHNS.map((j) => ({ ...j, home: ["a", "b", "c"] }));
    const out = fairShares(johns, members(johns, EVERYONE), "w1");
    expect(out.some((a) => a.userId === "d")).toBe(false);
    expect(out).toHaveLength(johns.length);
  });

  it("leaves out a John nobody is home for", () => {
    const johns = [john("kitchen", 4), john("downstairs", 6, { sharers: ["d"], home: [] })];
    const out = fairShares(johns, members(johns, EVERYONE), "w1");
    expect(out.map((a) => a.johnId)).toEqual(["kitchen"]);
  });

  it("catches someone up gradually after time away, never all at once", () => {
    // d is back owing two weeks of their share; this week's share is 6 each.
    const out = fairShares(JOHNS, members(JOHNS, EVERYONE, [4, 4, 4, -12]), "w1");
    const l = loads(out);
    const share = 24 / 4;
    expect(l.get("d")!).toBeGreaterThan(share);
    expect(l.get("d")!).toBeLessThanOrEqual(share * (1 + CATCH_UP_PACE));
  });

  it("does not let rounding in a share refuse someone catching up", () => {
    // Six two-point Johns split three ways: each share is six thirds of a
    // point, which is 3.9999… in floating point, not 4.
    const ids = ["a", "b", "c"];
    const six = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => john(id, 2, { sharers: ids, home: ids }));
    const out = fairShares(six, members(six, ids, [2, 2, -4]), "w1");
    expect(loads(out, six).get("c")).toBe(6);
  });
});

describe("fairSharesExplained", () => {
  const pair = (extra: Partial<DealJohn> = {}) => [john("bathroom", 4, { sharers: ["a", "b"], home: ["a", "b"], ...extra })];

  it("deals exactly as fairShares does", () => {
    const m = members(JOHNS, EVERYONE, [2, 0, -1, -3]);
    expect(fairSharesExplained(JOHNS, m, "w1").map(({ johnId, userId }) => ({ johnId, userId }))).toEqual(
      fairShares(JOHNS, m, "w1"),
    );
  });

  it("keeps where each sharer stood, furthest behind first, and that the furthest behind got it", () => {
    const johns = pair();
    const [out] = fairSharesExplained(johns, members(johns, ["a", "b"], [0, -3]), "w1");
    expect(out.why).toEqual({
      to: "b",
      by: "behind",
      weighed: [
        { userId: "b", standing: -5 },
        { userId: "a", standing: -2 },
      ],
      away: [],
    });
  });

  it("counts the Johns already dealt this week in where each stood", () => {
    const johns = [john("big", 4, { sharers: ["a", "b"], home: ["a", "b"] }), john("small", 2, { sharers: ["a", "b"], home: ["a", "b"] })];
    const out = fairSharesExplained(johns, members(johns, ["a", "b"], [0, -1]), "w1");
    const small = out.find((o) => o.johnId === "small")!;
    // b took the big one first: 3 shares each, so b stood -1 + 4 - 3 = 0 and
    // a -3, and b had been handed as much as a week gives (4 of 4.5).
    expect(small.why.weighed).toEqual([
      { userId: "a", standing: -3 },
      { userId: "b", standing: 0, full: true },
    ]);
    expect(small.userId).toBe("a");
  });

  it("says who did it last time", () => {
    const johns = pair({ lastUserId: "a" });
    const [out] = fairSharesExplained(johns, members(johns, ["a", "b"]), "w1");
    expect(out.userId).toBe("b");
    expect(out.why.weighed.find((w) => w.userId === "a")).toEqual({ userId: "a", standing: -2, last: true });
  });

  it("says who had already been handed the most extra a week gives", () => {
    // d is far behind but can take only half a share extra: 6 + 3 = 9 points this week.
    const out = fairSharesExplained(JOHNS, members(JOHNS, EVERYONE, [4, 4, 4, -12]), "w1");
    expect(out.some((o) => o.why.weighed.some((w) => w.userId === "d" && w.full))).toBe(true);
    for (const o of out) expect(o.why.weighed.find((w) => w.userId === o.userId)?.full).toBeUndefined();
  });

  it("says when only one sharer was home, and who was away", () => {
    const johns = pair({ home: ["a"] });
    const [out] = fairSharesExplained(johns, members(johns, ["a", "b"]), "w1");
    expect(out.why).toEqual({ to: "a", by: "only", weighed: [{ userId: "a", standing: -2 }], away: ["b"] });
  });

  it("says when a tie went on fewer Johns, or was drawn", () => {
    const shared = { sharers: ["a", "b"], home: ["a", "b"] };
    const level = [john("x", 2, shared), john("y", 2, shared)];
    expect(fairSharesExplained(level, members(level, ["a", "b"]), "w1")[0].why.by).toBe("draw");
    // Shares of 3 each. a, two behind, takes x (-5 against -3); then both stand at -3, and b has none yet.
    const three = [john("x", 2, shared), john("y", 2, shared), john("z", 2, shared)];
    const [, y] = fairSharesExplained(three, members(three, ["a", "b"], [-2, 0]), "w1");
    expect(y.why).toMatchObject({ to: "b", by: "fewer" });
  });
});

describe("carryOver", () => {
  it("measures each person against their share of each week", () => {
    const out = carryOver(
      [
        {
          shares: [
            { userId: "a", share: 4 },
            { userId: "b", share: 4 },
          ],
          assignments: [
            { userId: "a", points: 6 },
            { userId: "b", points: 2 },
          ],
        },
      ],
      ["a", "b"],
    );
    expect(Object.fromEntries(out)).toEqual({ a: 2, b: -2 });
  });

  it("takes a skipped John out of its week: neither owed nor done", () => {
    // The review's case: a's 3-point John skipped in a week of 3 points shared 1.5 each.
    const out = carryOver(
      [
        {
          shares: [
            { userId: "a", share: 1.5 },
            { userId: "b", share: 1.5 },
          ],
          assignments: [{ userId: "a", points: 3, outcome: "excused", excused: true }],
        },
      ],
      ["a", "b"],
    );
    expect(Object.fromEntries(out)).toEqual({ a: 0, b: 0 });
  });

  it("starts a newcomer at zero", () => {
    const out = carryOver(
      [{ shares: [{ userId: "a", share: 3 }], assignments: [{ userId: "a", points: 6 }] }],
      ["a", "new"],
    );
    expect(out.get("new")).toBe(0);
  });

  it("ignores people who have left", () => {
    const out = carryOver(
      [
        {
          shares: [
            { userId: "a", share: 4 },
            { userId: "gone", share: 4 },
          ],
          assignments: [{ userId: "gone", points: 8 }],
        },
      ],
      ["a"],
    );
    expect(Object.fromEntries(out)).toEqual({ a: -4 });
  });

  it("puts someone who was away behind by the share they kept", () => {
    // A week away, made up in full: d was handed nothing but still had a share.
    const week = JOHNS.map((j) => ({ ...j, home: ["a", "b", "c"] }));
    const shares = weekShares(week, EVERYONE, 1);
    const handed = loads(fairShares(week, members(week, EVERYONE), "w0"), week);
    const out = carryOver(
      [
        {
          shares: [...shares].map(([userId, share]) => ({ userId, share })),
          assignments: [...handed].map(([userId, points]) => ({ userId, points })),
        },
      ],
      EVERYONE,
    );
    expect(out.get("d")).toBe(-6);
    expect([...out.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(0);
  });

  it("counts a missed John for nobody, so it comes back to whoever missed it", () => {
    const out = carryOver(
      [
        {
          shares: [
            { userId: "a", share: 3 },
            { userId: "b", share: 3 },
          ],
          assignments: [
            { userId: "a", points: 3, outcome: "done" },
            { userId: "b", points: 3, outcome: "missed" },
          ],
        },
      ],
      ["a", "b"],
    );
    expect(Object.fromEntries(out)).toEqual({ a: 0, b: -3 });
  });

  it("counts a covered John for whoever covered it", () => {
    const out = carryOver(
      [
        {
          shares: [
            { userId: "a", share: 3 },
            { userId: "b", share: 3 },
          ],
          assignments: [
            { userId: "a", points: 3, outcome: "done" },
            { userId: "b", points: 3, outcome: "covered", coveredBy: "a" },
          ],
        },
      ],
      ["a", "b"],
    );
    expect(Object.fromEntries(out)).toEqual({ a: 3, b: -3 });
  });

  it("feeds back into a fairer next week", () => {
    const history = [
      {
        shares: ["a", "b", "c"].map((userId) => ({ userId, share: 5 })),
        assignments: [
          { userId: "a", points: 10 },
          { userId: "b", points: 2 },
          { userId: "c", points: 3 },
        ],
      },
    ];
    const balance = carryOver(history, ["a", "b", "c"]);
    const johns = JOHNS.map((j) => ({ ...j, sharers: ["a", "b", "c"], home: ["a", "b", "c"] }));
    const ms = members(johns, ["a", "b", "c"], ["a", "b", "c"].map((id) => balance.get(id)!));
    const l = loads(fairShares(johns, ms, "w2"), johns);
    expect(l.get("a")!).toBeLessThan(l.get("b")!);
  });
});

describe("creditedTo", () => {
  it("is the holder for done, late and still open, the coverer for a cover, nobody for a miss or a skip", () => {
    const j = { userId: "a", points: 2 };
    expect(["done", "late", null, undefined].map((outcome) => creditedTo({ ...j, outcome }))).toEqual(["a", "a", "a", "a"]);
    expect(creditedTo({ ...j, outcome: "missed" })).toBeNull();
    expect(creditedTo({ ...j, outcome: "excused" })).toBeNull();
    expect(creditedTo({ ...j, outcome: null, excused: true })).toBeNull();
    expect(creditedTo({ ...j, outcome: "covered", coveredBy: "b" })).toBe("b");
    // A cover still being checked counts for the coverer too.
    expect(creditedTo({ ...j, outcome: null, coveredBy: "b" })).toBe("b");
  });
});

describe("catchUpWeeks", () => {
  it("is zero for anyone level or ahead", () => {
    expect(catchUpWeeks(0, 6)).toBe(0);
    expect(catchUpWeeks(3, 6)).toBe(0);
  });

  it("counts the weeks at half a share extra each", () => {
    expect(catchUpWeeks(-12, 6)).toBe(4);
    expect(catchUpWeeks(-1, 6)).toBe(1);
  });
});

describe("recentBalances", () => {
  const rows = {
    // The database's sums over every week so far (house_balances); numeric comes back as a string.
    totals: [
      { user_id: "ava", owed: "107", credited: 5 },
      { user_id: "ben", owed: 7, credited: "109" },
      { user_id: "dan", owed: 50, credited: 0 },
    ],
    recentShares: [
      { user_id: "ava", share: 4 },
      { user_id: "ava", share: "3" },
      { user_id: "ben", share: 4 },
      { user_id: "ben", share: 3 },
      { user_id: "ben", share: 0 },
    ],
  };

  it("balances everything each did against everything they owed", () => {
    const { balances } = recentBalances(rows, ["ava", "ben"]);
    expect(balances).toEqual(new Map([["ava", -102], ["ben", 102]]));
  });

  it("leaves out people who have left, and starts a newcomer level", () => {
    const { balances } = recentBalances(rows, ["ava", "cal"]);
    expect(balances).toEqual(new Map([["ava", -102], ["cal", 0]]));
  });

  it("takes a usual week's share as the average of the recent weeks they had one", () => {
    const { usualShare } = recentBalances(rows, ["ava", "ben", "cal"]);
    expect(usualShare.get("ava")).toBe(3.5);
    expect(usualShare.get("ben")).toBe(3.5);
    expect(usualShare.get("cal")).toBe(0);
  });

  it("is level for everyone with no weeks behind them", () => {
    const { balances, usualShare } = recentBalances({ totals: [], recentShares: [] }, ["ava"]);
    expect(balances).toEqual(new Map([["ava", 0]]));
    expect(usualShare).toEqual(new Map([["ava", 0]]));
  });
});

describe("balanceRows", () => {
  it("puts whoever is furthest behind first, with how long catching up takes", () => {
    const rows = balanceRows(
      new Map([["ava", -6], ["ben", 4], ["cal", 2]]),
      new Map([["ava", 4], ["ben", 4], ["cal", 0]]),
      ["ben", "ava", "cal"],
    );
    expect(rows).toEqual([
      { userId: "ava", balance: -6, weeksToEven: catchUpWeeks(-6, 4) },
      { userId: "cal", balance: 2, weeksToEven: 0 },
      { userId: "ben", balance: 4, weeksToEven: 0 },
    ]);
  });

  it("counts someone with no balance yet as level", () => {
    expect(balanceRows(new Map(), new Map(), ["ava"])).toEqual([{ userId: "ava", balance: 0, weeksToEven: 0 }]);
    expect(balanceRows(new Map(), new Map(), [])).toEqual([]);
  });
});
