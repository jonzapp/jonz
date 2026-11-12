import { tz } from "@date-fns/tz";
import { getHours } from "date-fns";
import { describe, expect, it } from "vitest";

import { localDate, weekWindow } from "./week";
import { MONTH_WEEKS } from "./steady-run";
import {
  dealtMembers,
  dowOfPlace,
  onCallUsual,
  periodWeeks,
  placeOfDow,
  steadyAhead,
  steadyDeal,
  weekStateOf,
  type SteadyDealArgs,
  type SteadyListJohn,
} from "./steady-deal";
import type { IsoDow } from "./domain";

const ZONE = "Europe/London";
const DAY = 86_400_000;
// The week of Monday 12 Oct 2026 in London.
const WEEK = weekWindow(new Date("2026-10-14T11:00:00Z"), ZONE, 1);

function john(id: string, over: Partial<SteadyListJohn> = {}): SteadyListJohn {
  return {
    id,
    points: 2,
    kind: "day",
    perWeek: 2,
    crew: 1,
    keepDay: false,
    repeat: { everyWeeks: 1, everyMonths: null, weekOfMonth: null, anchorMonth: null, anchorWeek: 0, dueDow: 7 },
    dueTime: "21:00",
    sharers: ["ava", "ben"],
    ...over,
  };
}

const due = (dow: IsoDow, over: Partial<SteadyListJohn["repeat"]> = {}) => ({
  repeat: { everyWeeks: 1, everyMonths: null, weekOfMonth: null, anchorMonth: null, anchorWeek: 0, dueDow: dow, ...over },
});

function args(over: Partial<SteadyDealArgs> = {}): SteadyDealArgs {
  return {
    mode: "smart",
    budget: 4,
    week: WEEK,
    zone: ZONE,
    weekStarts: 1,
    now: new Date(WEEK.startsAt.getTime() - 60_000),
    members: ["ava", "ben"].map((userId) => ({ userId, balance: 0, suits: [], rather: {} })),
    johns: [john("bins")],
    away: [],
    last: new Map(),
    previous: null,
    onCallPoints: new Map(),
    makeup: 1,
    seed: "s",
    ...over,
  };
}

const placesOf = (r: ReturnType<typeof steadyDeal>, johnId: string) => r.places.filter((p) => p.johnId === johnId);

describe("days in the house's week", () => {
  it("count from the house's first day, Monday or Sunday", () => {
    expect(placeOfDow(1, 1)).toBe(1);
    expect(placeOfDow(7, 1)).toBe(7);
    expect(placeOfDow(7, 7)).toBe(1);
    expect(placeOfDow(6, 7)).toBe(7);
    expect(dowOfPlace(1, 7)).toBe(7);
    expect(dowOfPlace(7, 7)).toBe(6);
  });

  it("go there and back for every weekday and every first day", () => {
    for (let start = 1; start <= 7; start++) {
      for (let dow = 1; dow <= 7; dow++) {
        const place = placeOfDow(dow, start as IsoDow);
        expect(place).toBeGreaterThanOrEqual(1);
        expect(place).toBeLessThanOrEqual(7);
        expect(dowOfPlace(place, start as IsoDow)).toBe(dow);
      }
    }
  });
});

describe("periodWeeks", () => {
  it("is weeks between turns: weekly, fortnightly, monthly, and 1 for on call", () => {
    expect(periodWeeks(john("a"))).toBe(1);
    expect(periodWeeks(john("a", due(7, { everyWeeks: 2 })))).toBe(2);
    expect(periodWeeks(john("a", due(7, { everyMonths: 3, weekOfMonth: 1, anchorMonth: 0 })))).toBe(3 * MONTH_WEEKS);
    expect(periodWeeks(john("a", { kind: "on_call", ...due(7, { everyWeeks: 4 }) }))).toBe(1);
  });
});

describe("dealtMembers: fresh starts", () => {
  const people = [
    { id: "ava", joinedAt: new Date("2026-01-01T00:00:00Z") },
    { id: "ben", joinedAt: new Date("2026-10-13T09:00:00Z") },
  ];

  it("deals a week to everyone who had moved in when it was first dealt", () => {
    expect(dealtMembers(people, new Date("2026-10-12T00:00:00Z"), new Date("2026-10-14T00:00:00Z")).map((m) => m.id)).toEqual([
      "ava",
    ]);
  });

  it("deals a new week to everyone here now", () => {
    expect(dealtMembers(people, null, new Date("2026-10-14T00:00:00Z")).map((m) => m.id)).toEqual(["ava", "ben"]);
  });
});

describe("onCallUsual: what on call takes a week", () => {
  it("waits for 4 weeks on call", () => {
    expect(onCallUsual(2, ["w3", "w2", "w1"], ["w3", "w3"])).toBeNull();
  });

  it("averages its flags over its last 4 weeks, and forgets older ones", () => {
    expect(onCallUsual(2, ["w5", "w4", "w3", "w2", "w1"], ["w5", "w5", "w4", "w2", "w1", "w1", "w1"])).toBe(2);
    expect(onCallUsual(3, ["w4", "w3", "w2", "w1"], [])).toBe(0);
  });
});

describe("steadyDeal", () => {
  it("hands out each John on its own day, at its time in the house's zone", () => {
    const r = steadyDeal(args({ johns: [john("bins", { keepDay: true }), john("hob", due(3))] }));
    const bins = placesOf(r, "bins")[0];
    expect(bins.dow).toBe(7);
    expect(localDate(bins.dueAt!, ZONE)).toBe("2026-10-18");
    expect(getHours(bins.dueAt!, { in: tz(ZONE) })).toBe(21);
    expect(placesOf(r, "hob")[0].dow).toBe(3);
  });

  it("keeps Saturday the last day of a week that starts on Sunday, across the clocks going back", () => {
    const zone = "America/New_York";
    // The week of Sunday 1 Nov 2026, when New York goes back an hour.
    const week = weekWindow(new Date("2026-11-04T12:00:00Z"), zone, 7);
    expect(week.startsOn).toBe("2026-11-01");
    const r = steadyDeal(
      args({
        week,
        zone,
        weekStarts: 7,
        now: new Date(week.startsAt.getTime() - 60_000),
        johns: [
          john("sun", { keepDay: true, dueTime: "09:00", ...due(7) }),
          john("sat", { keepDay: true, dueTime: "21:00", ...due(6) }),
        ],
      }),
    );
    const sun = placesOf(r, "sun")[0];
    const sat = placesOf(r, "sat")[0];
    expect([sun.day, sat.day]).toEqual([1, 7]);
    expect(localDate(sun.dueAt!, zone)).toBe("2026-11-01");
    expect(localDate(sat.dueAt!, zone)).toBe("2026-11-07");
    expect(getHours(sun.dueAt!, { in: tz(zone) })).toBe(9);
    expect(getHours(sat.dueAt!, { in: tz(zone) })).toBe(21);
  });

  it("only uses the days still to come in a week dealt part-way through", () => {
    // Wednesday noon.
    const now = new Date(WEEK.startsAt.getTime() + 2.5 * DAY);
    const r = steadyDeal(
      args({
        now,
        budget: 0,
        johns: [john("bins", { keepDay: true, ...due(1) }), john("hoover", due(1)), john("hob", due(5))],
        previous: { turns: null, waiting: { bins: 2 } },
      }),
    );
    // Monday's bins has gone: it sits this week out and keeps its place in the queue.
    expect(placesOf(r, "bins")).toEqual([]);
    expect(r.state.waiting.bins).toBe(2);
    const hoover = placesOf(r, "hoover")[0];
    expect(hoover.dow).toBeGreaterThanOrEqual(3);
    expect(hoover.why.moved).toBe("gone");
    expect(hoover.dueAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(placesOf(r, "hob")[0].dow).toBe(5);
    expect(placesOf(r, "hob")[0].why.moved).toBeUndefined();
  });

  it("moves a John off a day someone's away to a day they're home, and says so", () => {
    const r = steadyDeal(
      args({
        members: [{ userId: "ava", balance: 0, suits: [], rather: {} }],
        johns: [john("hoover", { sharers: ["ava"], ...due(7) })],
        away: [{ id: "x", userId: "ava", startsOn: "2026-10-17", endsOn: "2026-10-18", note: null }],
      }),
    );
    const hoover = placesOf(r, "hoover")[0];
    expect(hoover.dow).toBe(5);
    expect(hoover.why.moved).toBe("away");
  });

  it("puts a John on a day that suits its holder", () => {
    const r = steadyDeal(
      args({
        members: [{ userId: "ava", balance: 0, suits: [6], rather: {} }],
        johns: [john("hoover", { sharers: ["ava"], ...due(3) })],
      }),
    );
    expect(placesOf(r, "hoover")[0].dow).toBe(6);
    expect(placesOf(r, "hoover")[0].why.moved).toBe("suits");
  });

  it("brings a missed John back to whoever missed it, within two weeks", () => {
    const missed = (daysAgo: number) =>
      new Map([["bath", { startsOn: "2026-10-05", userIds: ["ben"], missed: { userId: "ben", dueAt: new Date(WEEK.startsAt.getTime() - daysAgo * DAY) } }]]);
    const johns = [john("bath", { points: 4 })];
    for (const seed of ["a", "b", "c", "d"]) {
      const back = placesOf(steadyDeal(args({ johns, last: missed(1), seed })), "bath")[0];
      expect(back.userId).toBe("ben");
      expect(back.back).toBe(true);
      expect(back.why.by).toBe("back");
    }
    expect(placesOf(steadyDeal(args({ johns, last: missed(20) })), "bath")[0].why.by).not.toBe("back");
  });

  it("leaves Johns waiting past the budget, and says how long they'll have waited", () => {
    const johns = ["a", "b", "c", "d", "e"].map((id) => john(id));
    const r = steadyDeal(args({ budget: 2, johns }));
    expect(r.places).toHaveLength(2);
    expect(new Set(r.places.map((p) => p.userId))).toEqual(new Set(["ava", "ben"]));
    expect(Object.values(r.state.waiting)).toEqual([1, 1, 1]);
    // Next week, they go first.
    const next = steadyDeal(args({ budget: 2, johns, previous: { turns: null, waiting: r.state.waiting } }));
    const waited = Object.keys(r.state.waiting);
    expect(next.places.every((p) => waited.includes(p.johnId) && p.why.waited === 1)).toBe(true);
  });

  it("keeps Classic's orders of turns for next week", () => {
    const one = steadyDeal(args({ mode: "classic", budget: 0 }));
    const first = placesOf(one, "bins")[0].userId;
    expect(one.state.turns!.bins.at(-1)).toBe(first);
    const two = steadyDeal(args({ mode: "classic", budget: 0, previous: { turns: one.state.turns, waiting: {} } }));
    expect(placesOf(two, "bins")[0].userId).not.toBe(first);
    expect(placesOf(two, "bins")[0].why.by).toBe("turn");
    expect(steadyDeal(args()).state.turns).toBeNull();
  });

  it("counts on call at what it usually takes, with no due time", () => {
    const onCall = john("dish", { kind: "on_call", points: 1, perWeek: 3 });
    const guess = steadyDeal(args({ johns: [onCall] }));
    expect(placesOf(guess, "dish")[0]).toMatchObject({ points: 3, dueAt: null, dow: 0 });
    const usual = steadyDeal(args({ johns: [onCall], onCallPoints: new Map([["dish", 1.5]]) }));
    expect(placesOf(usual, "dish")[0].points).toBe(1.5);
    // On call adds to shares as its flags are raised, not at the deal.
    expect([...usual.shares.values()].every((s) => s === 0)).toBe(true);
  });

  it("keeps the share of someone away, or hands it on when the house doesn't make time away up", () => {
    const johns = [john("bins", { keepDay: true }), john("hob", { keepDay: true })];
    const away = [{ id: "x", userId: "ben", startsOn: WEEK.startsOn, endsOn: "2026-10-18", note: null }];
    const kept = steadyDeal(args({ johns, away }));
    expect(kept.places.every((p) => p.userId === "ava")).toBe(true);
    expect(kept.shares.get("ben")).toBe(2);
    const handed = steadyDeal(args({ johns, away, makeup: 0 }));
    expect(handed.shares.get("ben")).toBe(0);
    expect(handed.shares.get("ava")).toBe(4);
  });

  it("deals only to sharers dealt this week, and skips a John none of them share", () => {
    const r = steadyDeal(
      args({
        members: [{ userId: "ava", balance: 0, suits: [], rather: {} }],
        johns: [john("bins"), john("theirs", { sharers: ["cal"] })],
      }),
    );
    expect(r.places.map((p) => p.johnId)).toEqual(["bins"]);
  });
});

describe("steadyAhead", () => {
  it("takes Classic's turns on round the next two weeks", () => {
    const a = args({ mode: "classic", budget: 2, johns: [john("bins"), john("kitchen")] });
    const plan = steadyDeal(a);
    const ahead = steadyAhead(a, plan);
    expect(ahead.map((w) => w.startsOn)).toEqual(["2026-10-19", "2026-10-26"]);
    const now = Object.fromEntries(plan.places.map((p) => [p.johnId, p.userId]));
    // Each John goes to the other person next week, and back the week after.
    for (const id of ["bins", "kitchen"]) {
      expect(ahead[0].johns[id]).toEqual([now[id] === "ava" ? "ben" : "ava"]);
      expect(ahead[1].johns[id]).toEqual([now[id]]);
    }
  });

  it("shows a waiting John's turn, and a fortnightly John in the week it lands", () => {
    // Light: two 2-point Johns each and one more that waits.
    const a = args({
      budget: 2,
      johns: [john("bins"), john("kitchen"), john("mop"), john("windows", due(3, { everyWeeks: 2, anchorWeek: 1 }))],
    });
    const plan = steadyDeal(a);
    const waiting = Object.keys(plan.state.waiting);
    expect(waiting.length).toBeGreaterThan(0);
    const ahead = steadyAhead(a, plan);
    for (const id of waiting) expect(ahead.some((w) => w.johns[id])).toBe(true);
    const lands = ahead.filter((w) => w.johns.windows).map((w) => w.startsOn);
    expect(lands.length).toBeGreaterThan(0);
  });

  it("leaves out someone already booked away", () => {
    const a = args({
      johns: [john("bins")],
      away: [{ id: "t", userId: "ava", startsOn: "2026-10-19", endsOn: "2026-10-25", note: null }],
    });
    const ahead = steadyAhead(a, steadyDeal(a));
    expect(ahead[0].johns.bins).toEqual(["ben"]);
  });

  it("is the same for the same week", () => {
    const a = args({ johns: [john("bins"), john("kitchen"), john("mop", { points: 3 })] });
    expect(steadyAhead(a, steadyDeal(a))).toEqual(steadyAhead(a, steadyDeal(a)));
  });
});

describe("weekStateOf", () => {
  it("reads what a week kept", () => {
    expect(
      weekStateOf({
        turns: { bins: ["ava", "ben", 3], mop: "x" },
        waiting: { mop: 2, gone: 0, odd: "1" },
        ahead: [{ startsOn: "2026-10-19", johns: { bins: ["ben"] } }, { startsOn: 5 }, "x"],
      }),
    ).toEqual({ turns: { bins: ["ava", "ben"] }, waiting: { mop: 2 }, ahead: [{ startsOn: "2026-10-19", johns: { bins: ["ben"] } }] });
  });

  it("is nothing kept for a week dealt before Steady weeks, or in Smart", () => {
    expect(weekStateOf({})).toEqual({ turns: null, waiting: {}, ahead: [] });
    expect(weekStateOf({ turns: null, waiting: {}, ahead: [] })).toEqual({ turns: null, waiting: {}, ahead: [] });
  });
});

describe("pools: a group's Johns are balanced within the group", () => {
  const three = ["ava", "ben", "cal"];
  const house = (pools: Record<string, Record<string, number>>) =>
    args({
      members: three.map((userId) => ({ userId, balance: Object.values(pools[userId]).reduce((s, v) => s + v, 0), pools: pools[userId], suits: [], rather: {} })),
      johns: [
        john("bath", { points: 3, sharers: ["ava", "ben"], groupId: "g1", ...due(3) }),
        john("kitchen", { points: 3, sharers: three, ...due(2) }),
        john("bins", { points: 3, sharers: three, ...due(5) }),
      ],
    });

  it("gives a group's John to whoever is furthest behind in the group, even if they're ahead overall", () => {
    // Ava is behind on the bathroom but ahead overall; Ben is the other way round.
    const r = steadyDeal(house({ ava: { "": 3, g1: -2 }, ben: { "": -3, g1: 2 }, cal: { "": 0 } }));
    expect(placesOf(r, "bath").map((p) => p.userId)).toEqual(["ava"]);
  });

  it("splits each group's share out of the week's shares", () => {
    const r = steadyDeal(house({ ava: { "": 0, g1: 0 }, ben: { "": 0, g1: 0 }, cal: { "": 0 } }));
    expect(Object.fromEntries(r.groupShares.get("g1")!)).toEqual({ ava: 1.5, ben: 1.5, cal: 0 });
    expect(r.shares.get("cal")).toBeCloseTo(2, 6);
    expect(r.shares.get("ava")).toBeCloseTo(3.5, 6);
  });

  it("carries each pool forward in the weeks ahead", () => {
    const a = house({ ava: { "": 0, g1: 0 }, ben: { "": 0, g1: 0 }, cal: { "": 0 } });
    const r = steadyDeal(a);
    const ahead = steadyAhead(a, r, 2);
    // The bathroom takes turns between Ava and Ben, never Cal.
    const bath = [placesOf(r, "bath")[0].userId, ...ahead.map((w) => w.johns.bath[0])];
    expect(bath.every((id) => id !== "cal")).toBe(true);
    expect(new Set(bath.slice(0, 2)).size).toBe(2);
  });
});
