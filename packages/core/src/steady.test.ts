import { describe, expect, test } from "vitest";
import { check } from "./steady-checks";
import { MECHANISMS, matrixHouse, pairwise, randomHouse } from "./steady-matrix";
import { HOUSES } from "./steady-houses";
import type { RunHouse } from "./steady-run-types";
import { LAST_OF_MONTH, RUN_STARTS_ON, dueWeeks, prepareRun, steadyRun } from "./steady-run";
import type { SteadyInput, SteadyJohn, SteadyMember } from "./steady-types";
import { steadyWeek } from "./steady";
import { placeDays } from "./steady-days";
import { planTurns } from "./steady-turns";
import { FRONT_WEEKS } from "./steady-types";
import { addDaysTo } from "./week";

// Fixed houses and fixed seeds only: every run gives the same weeks, so a pass stays a pass. These are the
// simulator's tests (the Lighter weeks page), run against this code.

const MODES = ["smart", "classic"] as const;
const BUDGETS = [2, 4, 6, 0];
const LONG = 120_000;
const house = (id: string) => HOUSES.find((h) => h.id === id)!;
const run = (h: RunHouse, mode: "smart" | "classic" = "smart", budget = 4, weeks = 12) => steadyRun(h, { mode, budget, weeks });
const passes = (res: ReturnType<typeof run>, label: string) => {
  const { fails } = check(res);
  expect(Object.fromEntries(Object.entries(fails).map(([k, f]) => [k, `week ${f.w}: ${f.why}`])), label).toEqual({});
};
const names = (wk: ReturnType<typeof run>["weeks"][number], id: string) => (wk.got[id] ?? []).map((x) => x.name);
const dateOf = (w: number, dow: number) => addDaysTo(RUN_STARTS_ON, (w - 1) * 7 + dow - 1);

describe("every rule, every week", () => {
  for (const h of HOUSES) {
    test(`${h.name}: every rule holds for three years, both modes, every budget`, { timeout: LONG }, () => {
      for (const mode of MODES) for (const b of BUDGETS) passes(run(h, mode, b, 156), `${mode} ${b}`);
    });
  }

  test("mechanism matrix: every pair of mechanisms, every rule, three years", { timeout: LONG }, () => {
    const rows = pairwise(MECHANISMS);
    // Every pair of values from two mechanisms is in at least one house.
    MECHANISMS.forEach((A, a) =>
      MECHANISMS.forEach((B2, b) => {
        if (b <= a) return;
        A.values.forEach((_, x) =>
          B2.values.forEach((__, y) => expect(rows.some((r) => r[a] === x && r[b] === y), `${A.id}=${A.values[x]} with ${B2.id}=${B2.values[y]}`).toBe(true)),
        );
      }),
    );
    rows.forEach((row, i) => {
      const h = matrixHouse(row, i, 156);
      for (const mode of MODES) for (const b of BUDGETS) passes(run(h, mode, b, 156), `${h.id} ${mode} ${b}`);
    });
  });

  test("seeded houses 1 to 200: every rule, a year each", { timeout: LONG }, () => {
    for (let s = 1; s <= 200; s++) {
      const h = randomHouse(s, 52);
      for (const mode of MODES) for (const b of BUDGETS) passes(run(h, mode, b, 52), `${h.id} ${mode} ${b}`);
    }
  });

  test("the same house gives the same weeks, every time", () => {
    const strip = (r: ReturnType<typeof run>) => JSON.stringify(r.weeks.map(({ result, ...wk }) => ({ ...wk, order: result.order })));
    for (const h of [house("yours"), randomHouse(7, 52)]) expect(strip(run(h, "smart", 2, 52))).toBe(strip(run(h, "smart", 2, 52)));
  });
});

describe("one story each", () => {
  test("your house on Light: one or two Johns of your own each week, never none unless well ahead", () => {
    const { weeks } = run(house("yours"), "smart", 2, 52);
    for (const wk of weeks) {
      for (const id of ["you", "ada"]) {
        const own = wk.got[id].filter((x) => !x.pinned);
        expect(own.length >= 1 || wk.weekOff.length > 0, `week ${wk.w}: ${id} has a John of their own`).toBe(true);
        expect(own.length, `week ${wk.w}: ${id} has at most two`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("someone joins: nothing before their first Monday, then a balance of 0", () => {
    const { weeks } = run(house("join"), "smart", 4, 12);
    for (const wk of weeks.slice(0, 4)) expect(wk.got.sam).toBeUndefined();
    expect(weeks[4].people.find((p) => p.id === "sam")!.bal).toBe(0);
    expect(weeks[4].got.sam.length).toBeGreaterThanOrEqual(1);
  });

  test("someone moves out: their missed John goes back on the list, and nothing more goes to them", () => {
    const { weeks } = run(house("leave"), "classic", 4, 12);
    const missed = weeks[5].misses.find((m) => m.pid === "sam")!;
    expect(missed).toBeTruthy();
    expect(weeks[6].left).toContain("sam");
    expect(Object.values(weeks[6].got).some((g) => g.some((x) => x.name === missed.name)) || weeks[6].waiting.includes(missed.name)).toBe(true);
    for (const wk of weeks.slice(6)) expect(wk.got.sam).toBeUndefined();
  });

  test("a miss comes back to whoever missed it, and counts for nobody", () => {
    const { weeks } = run(house("misser"), "smart", 4, 24);
    for (const wk of weeks) {
      for (const m of wk.misses) if (weeks[wk.w]) expect(names(weeks[wk.w], "ada"), `week ${wk.w + 1}: ${m.name} back to Ada`).toContain(m.name);
    }
    const end = weeks[weeks.length - 1];
    expect(Math.abs(end.bal.you + end.bal.ada + end.missedTotal)).toBeLessThan(1e-9);
  });

  test("missed twice: it keeps coming back until it is done", () => {
    const { weeks } = run(house("misstwice"), "smart", 4, 6);
    expect(names(weeks[2], "ada")).toContain("Deep clean");
    expect(names(weeks[3], "ada")).toContain("Deep clean");
    expect(weeks[2].got.ada.find((x) => x.name === "Deep clean")!.back).toBe(true);
  });

  test("done together: a place for everyone home, or for two", () => {
    const { weeks } = run(house("together"), "smart", 4, 12);
    const holders = (wk: (typeof weeks)[number], n: string) =>
      Object.entries(wk.got)
        .filter(([, g]) => g.some((x) => x.name === n))
        .map(([id]) => id);
    expect(holders(weeks[0], "Garden together").sort()).toEqual(["ada", "sam", "you"]);
    expect(holders(weeks[2], "Garden together")).toHaveLength(2); // Sam away week 3
    for (const wk of weeks) expect(holders(wk, "Big shop for two")).toHaveLength(2);
  });

  test("groups: a bathroom only goes to its group, and only its group owes a share of it", () => {
    const { weeks } = run(house("groups"), "smart", 4, 24);
    for (const wk of weeks) {
      for (const [id, g] of Object.entries(wk.got)) {
        if (g.some((x) => x.name === "Upstairs bathroom")) expect(["you", "ada"]).toContain(id);
        if (g.some((x) => x.name === "Downstairs bathroom")) expect(["sam", "pri"]).toContain(id);
      }
    }
  });

  test("away made up at half: Ada owes half her part while away", () => {
    const { weeks } = run(house("makeup"), "smart", 4, 8);
    const wk = weeks[3]; // week 4, Ada away
    const ada = wk.end.find((r) => r.pid === "ada")!;
    const items = Object.values(wk.got).flat();
    const expected = items.reduce((s, x) => s + (x.pts / x.sharers.length) * 0.5, 0);
    expect(Math.abs(ada.share - expected)).toBeLessThan(1e-9);
    expect(ada.done).toBe(0);
  });

  test("everyone away: nothing is dealt and nobody owes anything", () => {
    const { weeks } = run(house("holiday"), "smart", 4, 12);
    for (const w of [8, 9]) {
      expect(Object.values(weeks[w - 1].got).flat()).toEqual([]);
      expect(weeks[w - 1].bal).toEqual(weeks[w - 2].bal);
    }
    expect(weeks[9].waiting.length === 0 || Object.values(weeks[9].got).flat().length > 0).toBe(true);
  });

  test("a cover counts for whoever covered it", () => {
    const { weeks } = run(house("covers"), "smart", 4, 6);
    const c = weeks[1].covers[0];
    expect(c.by).toBe("ada");
    const rows = weeks[1].end;
    const you = rows.find((r) => r.pid === "you")!;
    const ada = rows.find((r) => r.pid === "ada")!;
    expect(you.done + ada.done).toBe(Object.values(weeks[1].dealt).reduce((a, b) => a + b, 0));
  });

  test("a swap moves the John and its points, and the days are placed again", () => {
    const { weeks } = run(house("covers"), "smart", 4, 6);
    const wk = weeks[4];
    expect(wk.swaps).toHaveLength(1);
    const swapped = Object.values(wk.got).flat().filter((x) => x.swapped);
    expect(swapped).toHaveLength(2);
    for (const id of ["you", "ada"]) expect(wk.dealt[id]).toBe(wk.got[id].reduce((s, x) => s + x.pts, 0));
  });

  test("once a year on the last Sunday of November", () => {
    const S = prepareRun(house("yearly"), 156);
    expect([...S.johnByName.Gutters.due]).toEqual([4, 56, 108]);
    for (const w of S.johnByName.Gutters.due) {
      const d = dateOf(w, 7);
      expect(d.slice(5, 7)).toBe("11");
      expect(Number(d.slice(8))).toBeGreaterThan(23);
    }
  });

  test("an admin changes things: each change starts on its Monday", () => {
    const { weeks } = run(house("changes"), "smart", 4, 12);
    const all = (wk: (typeof weeks)[number]) =>
      Object.values(wk.got)
        .flat()
        .map((x) => x.name)
        .concat(wk.waiting);
    expect(all(weeks[1])).not.toContain("Windows");
    for (const wk of weeks.slice(6)) expect(all(wk)).not.toContain("Garden");
    expect(weeks[3].B).toBe(4);
    expect(weeks[4].B).toBe(2);
    expect(weeks[7].mode).toBe("smart");
    expect(weeks[8].mode).toBe("classic");
  });

  test("Classic: someone away stays first in line", () => {
    const { weeks } = run(house("four"), "classic", 0, 6);
    const priyaJohns = (wk: (typeof weeks)[number]) => names(wk, "pri");
    expect(priyaJohns(weeks[2])).toEqual([]);
    expect(priyaJohns(weeks[3])).toEqual([]);
    expect(priyaJohns(weeks[4]).length).toBeGreaterThanOrEqual(priyaJohns(weeks[0]).length);
  });

  test("a group's John nobody after them could do goes to whoever is choosing, so everyone gets one", () => {
    const h: RunHouse = {
      id: "onlyyou",
      name: "Only you can take it",
      people: [
        { id: "ada", name: "Ada" },
        { id: "sam", name: "Sam" },
        { id: "you", name: "You" },
      ],
      johns: [
        { name: "Kitchen", pts: 3, day: 1, sched: { every: 1 } },
        { name: "Hoovering", pts: 2, day: 2, sched: { every: 1 } },
        { name: "Upstairs bathroom", pts: 1, day: 3, sched: { every: 1 }, group: ["ada", "sam"] },
      ],
    };
    const wk = run(h, "smart", 2, 1).weeks[0];
    // Ada chooses first and takes the biggest. Sam could take Hoovering, but then nobody left could do the bathroom.
    expect([names(wk, "ada"), names(wk, "sam"), names(wk, "you")]).toEqual([["Kitchen"], ["Upstairs bathroom"], ["Hoovering"]]);
    expect(wk.waiting).toEqual([]);
  });

  test("after three weeks waiting a John goes to the front: in your house nothing waits longer, on any budget", { timeout: LONG }, () => {
    for (const b of [2, 4, 6]) {
      for (const mode of MODES) {
        const { weeks } = run(house("yours"), mode, b, 156);
        const streak: Record<string, number> = {};
        for (const wk of weeks) {
          for (const n of Object.keys(streak)) if (!wk.waiting.includes(n)) delete streak[n];
          for (const n of wk.waiting) {
            streak[n] = (streak[n] ?? 0) + 1;
            expect(streak[n], `${mode} ${b}, week ${wk.w}: ${n} waited ${streak[n]} weeks`).toBeLessThanOrEqual(FRONT_WEEKS);
          }
        }
      }
    }
  });

  test("a week off: more than a week's budget ahead, nothing that week", () => {
    const wk = run(house("misser"), "smart", 2, 3).weeks[2];
    expect(wk.weekOff).toEqual(["you"]); // 2.5 ahead on Light
    expect(names(wk, "you")).toEqual([]);
    expect(names(wk, "ada")).toEqual(["Kitchen", "Bins"]); // her missed Kitchen came back, and the bins keep their day
  });

  test("rather do and rather not: each person gets more of what they'd rather do, and less of what they'd rather not", () => {
    for (const b of [2, 4]) {
      const count: Record<string, number> = {};
      for (const wk of run(house("sample"), "smart", b, 52).weeks) {
        for (const id of ["you", "ada"]) for (const n of names(wk, id)) count[`${n}/${id}`] = (count[`${n}/${id}`] ?? 0) + 1;
      }
      const c = (n: string, id: string) => count[`${n}/${id}`] ?? 0;
      expect(c("Mopping", "you"), `budget ${b}: You would rather do the mopping`).toBeGreaterThan(c("Mopping", "ada"));
      expect(c("Kitchen", "ada"), `budget ${b}: Ada would rather do the kitchen`).toBeGreaterThan(c("Kitchen", "you"));
      expect(c("Garbage", "you"), `budget ${b}: You would rather not do the garbage`).toBeLessThan(c("Garbage", "ada"));
    }
  });

  test("schedules land on the right days: every few weeks, the nth weekday, and the last of the month", () => {
    const dates = (sched: Parameters<typeof dueWeeks>[0], day: number, to: number) => dueWeeks(sched, day, 1, to).map((w) => dateOf(w, day));
    expect(dueWeeks({ every: 2 }, 3, 1, 10)).toEqual([1, 3, 5, 7, 9]);
    expect(dueWeeks({ every: 3, start: 2 }, 3, 1, 12)).toEqual([2, 5, 8, 11]);
    expect(dates({ months: 1, nth: 2 }, 2, 22)).toEqual(["2026-11-10", "2026-12-08", "2027-01-12", "2027-02-09", "2027-03-09"]);
    expect(dates({ months: 1, nth: LAST_OF_MONTH }, 5, 22)).toEqual(["2026-11-27", "2026-12-25", "2027-01-29", "2027-02-26", "2027-03-26"]);
    expect(dates({ months: 3, nth: 1 }, 6, 60)).toEqual(["2026-11-07", "2027-02-06", "2027-05-01", "2027-08-07", "2027-11-06"]);
  });

  test("no limit: today's catch-up cap never stops someone's first John (seeded house 2, week 2)", () => {
    const wk = run(randomHouse(2, 52), "smart", 0, 2).weeks[1];
    expect(names(wk, "p2")).toHaveLength(1);
  });
});

// ---- One week, straight into steadyWeek: what the engine hands it and what it keeps ----

const john = (johnId: string, points: number, day: number, over: Partial<SteadyJohn> = {}): SteadyJohn => ({
  johnId,
  points,
  period: 1,
  day,
  keepDay: false,
  crew: 1,
  onCall: false,
  sharers: ["a", "b"],
  home: ["a", "b"],
  due: true,
  waited: 0,
  back: null,
  lastBy: [],
  since: 1,
  ahead: Array(12).fill(true),
  ...over,
});
const member = (userId: string, over: Partial<SteadyMember> = {}): SteadyMember => ({
  userId,
  balance: 0,
  homeDays: [1, 2, 3, 4, 5, 6, 7],
  suits: [],
  rather: {},
  ...over,
});
const week = (over: Partial<SteadyInput>): SteadyInput => ({
  mode: "smart",
  budget: 2,
  johns: [],
  members: [member("a"), member("b")],
  turns: null,
  seed: "h:2026-11-02",
  makeup: 1,
  ...over,
});
const who = (r: ReturnType<typeof steadyWeek>, johnId: string) => r.places.filter((p) => p.johnId === johnId).map((p) => p.userId);

describe("steadyWeek", () => {
  test("nothing on the list, or nobody living there: nothing dealt, nothing waits", () => {
    expect(steadyWeek(week({})).places).toEqual([]);
    const r = steadyWeek(week({ members: [], johns: [john("k", 2, 1, { sharers: [], home: [] })] }));
    expect(r.places).toEqual([]);
    expect(r.people).toEqual([]);
  });

  test("a John nobody who shares it can do this week waits, and counts the weeks", () => {
    const r = steadyWeek(week({ johns: [john("k", 2, 1, { home: [], waited: 2 })] }));
    expect(r.places).toEqual([]);
    expect(r.waiting).toEqual({ k: 3 });
  });

  test("Johns not due this week stay off it", () => {
    const r = steadyWeek(week({ johns: [john("k", 2, 1, { due: false })] }));
    expect(r.places).toEqual([]);
    expect(r.order).toEqual([]);
  });

  test("one each: furthest behind chooses first and takes the biggest, and it says so", () => {
    const r = steadyWeek(week({ members: [member("a", { balance: 1 }), member("b", { balance: -1 })], johns: [john("big", 3, 2), john("small", 1, 3)] }));
    expect(who(r, "big")).toEqual(["b"]);
    expect(who(r, "small")).toEqual(["a"]);
    const why = r.places.find((p) => p.johnId === "big")!.why;
    expect(why).toMatchObject({ to: "b", by: "oneEach", mode: "smart", budget: 2 });
    expect(why.weighed.map((w) => w.userId)).toEqual(["b", "a"]);
    expect(why.weighed[0].standing).toBe(-1);
  });

  test("the budget: past someone's one John, a John that doesn't fit waits", () => {
    const r = steadyWeek(week({ johns: [john("k", 2, 1), john("b", 2, 2), john("h", 2, 3)] }));
    expect(r.places).toHaveLength(2);
    expect(Object.keys(r.waiting)).toHaveLength(1);
    for (const p of r.people) expect(p.dealt).toBe(2);
  });

  test("a John that keeps its day always goes out, on its day, and doesn't use up anyone's one John", () => {
    const r = steadyWeek(week({ members: [member("a")], johns: [john("bins", 1, 4, { keepDay: true, sharers: ["a"], home: ["a"] }), john("k", 2, 4, { sharers: ["a"], home: ["a"] })] }));
    expect(r.places.map((p) => [p.johnId, p.day])).toEqual([
      ["bins", 4],
      ["k", 3],
    ]);
    expect(r.places[1].why.moved).toBe("taken");
  });

  test("days: a John goes to a day that suits, near its own day, and only on days they're home", () => {
    const r = steadyWeek(week({ members: [member("a", { suits: [6, 7] }), member("b", { homeDays: [5, 6, 7] })], johns: [john("k", 2, 2), john("h", 2, 3)] }));
    const day = (id: string) => r.places.find((p) => p.userId === id)!;
    expect(day("a").day).toBe(6);
    expect(day("a").why.moved).toBe("suits");
    expect(day("b").day).toBe(5);
    expect(day("b").why.moved).toBe("away");
  });

  test("on call is all week, and counts toward the budget", () => {
    const r = steadyWeek(week({ members: [member("a")], johns: [john("dish", 2, 1, { onCall: true, sharers: ["a"], home: ["a"] }), john("k", 1, 2, { sharers: ["a"], home: ["a"] })] }));
    expect(r.places.find((p) => p.johnId === "dish")!.day).toBe(0);
    expect(r.places.find((p) => p.johnId === "k")).toBeUndefined();
    expect(r.waiting).toEqual({ k: 1 });
  });

  test("a missed John comes back to whoever missed it, ahead of everything, and says why", () => {
    const r = steadyWeek(week({ johns: [john("k", 2, 1, { back: "a" }), john("h", 2, 2)] }));
    const back = r.places.find((p) => p.johnId === "k")!;
    expect(back).toMatchObject({ userId: "a", back: true, why: { by: "back" } });
    expect(who(r, "h")).toEqual(["b"]);
  });

  test("a missed John whose misser is away is dealt as usual", () => {
    const r = steadyWeek(week({ members: [member("a", { homeDays: [] }), member("b")], johns: [john("k", 2, 1, { back: "a", home: ["b"] })] }));
    expect(who(r, "k")).toEqual(["b"]);
    expect(r.places[0].why.away).toEqual(["a"]);
  });

  test("never twice running, unless they'd rather do it", () => {
    const base = { johns: [john("k", 2, 1, { lastBy: ["a"] }), john("h", 2, 2)] };
    expect(who(steadyWeek(week(base)), "k")).toEqual(["b"]);
    const rather = steadyWeek(week({ ...base, members: [member("a", { rather: { k: 1 } }), member("b")] }));
    expect(who(rather, "k")).toEqual(["a"]);
  });

  test("a week off for someone more than a week's budget ahead", () => {
    const r = steadyWeek(week({ members: [member("a", { balance: 3 }), member("b", { balance: -3 })], johns: [john("k", 1, 1), john("h", 1, 2)] }));
    expect(r.people.find((p) => p.userId === "a")!.weekOff).toBe(true);
    expect(r.places.every((p) => p.userId === "b")).toBe(true);
  });

  test("targets: the budget, plus or minus up to half by how far behind or ahead", () => {
    const r = steadyWeek(week({ budget: 4, members: [member("a", { balance: 10 }), member("b", { balance: -10 }), member("c")] }));
    expect(r.people.map((p) => p.target)).toEqual([2, 6, 4]);
    expect(steadyWeek(week({ budget: 0 })).people.map((p) => p.target)).toEqual([Infinity, Infinity]);
  });

  test("Classic: the next person in its order who is home, and next in line when it's someone's turn but they're away", () => {
    const johns = [john("k", 2, 1, { sharers: ["a", "b", "c"], home: ["b", "c"] })];
    const members = [member("a", { homeDays: [] }), member("b"), member("c")];
    const r = steadyWeek(week({ mode: "classic", budget: 0, johns, members, turns: { k: ["a", "b", "c"] } }));
    expect(who(r, "k")).toEqual(["b"]);
    expect(r.places[0].why.by).toBe("nextInLine");
    expect(r.places[0].why.weighed.map((w) => [w.userId, w.place])).toEqual([
      ["b", 1],
      ["c", 2],
    ]);
    // Away stays first in line.
    expect(r.turns).toEqual({ k: ["a", "c", "b"] });
  });

  test("Classic: whoever's turn it is may go half the budget over", () => {
    const johns = [john("x", 2, 1), john("k", 1, 3)];
    const r = steadyWeek(week({ mode: "classic", budget: 2, johns, turns: { x: ["a", "b"], k: ["a", "b"] } }));
    expect(who(r, "x")).toEqual(["a"]);
    expect(who(r, "k")).toEqual(["a"]);
    expect(r.places.find((p) => p.johnId === "k")!.why.by).toBe("turn");
  });

  test("Classic: fuller than that means the next in line does it, and whoever's turn it was stays first", () => {
    const johns = [john("x", 3, 1), john("k", 2, 3)];
    const r = steadyWeek(week({ mode: "classic", budget: 2, johns, turns: { x: ["a", "b"], k: ["a", "b"] } }));
    expect(who(r, "x")).toEqual(["a"]);
    expect(who(r, "k")).toEqual(["b"]);
    expect(r.places.find((p) => p.johnId === "k")!.why.by).toBe("nextInLine");
    expect(r.turns!.k).toEqual(["a", "b"]);
  });

  test("Classic: someone new joins the back of every order they share, and someone gone leaves it", () => {
    const r = steadyWeek(week({ mode: "classic", johns: [john("k", 2, 1)], turns: { k: ["gone", "b"] } }));
    expect(r.turns!.k).toEqual(["a", "b"]);
  });

  test("Classic plans orders of turns so each week's points split evenly", () => {
    const js = [john("big", 3, 1), john("mid", 2, 2), john("small", 1, 3)];
    const order = planTurns(js, ["a", "b"], {});
    // Biggest first: the big one starts with a, then the middle one goes to b to balance it, and the small one to b.
    expect(order).toEqual({ big: ["a", "b"], mid: ["b", "a"], small: ["b", "a"] });
    // Johns that already have an order keep it.
    expect(planTurns(js, ["a", "b"], { big: ["b", "a"] }).big).toEqual(["b", "a"]);
  });

  test("done together: a place each, numbered, and it doesn't use up anyone's one John", () => {
    const r = steadyWeek(week({ johns: [john("garden", 3, 6, { crew: 0 }), john("k", 2, 1), john("h", 2, 2)] }));
    expect(r.places.filter((p) => p.johnId === "garden").map((p) => p.place)).toEqual([1, 2]);
    expect(r.places.filter((p) => p.johnId !== "garden")).toHaveLength(2);
  });

  test("no limit: everything due goes out, to whoever is furthest behind", () => {
    const r = steadyWeek(week({ budget: 0, members: [member("a", { balance: 2 }), member("b", { balance: -2 })], johns: [john("k", 2, 1), john("h", 2, 2), john("m", 2, 3)] }));
    expect(r.places).toHaveLength(3);
    expect(r.waiting).toEqual({});
    expect(r.places[0]).toMatchObject({ userId: "b", why: { by: "behind" } });
  });

  test("ties break the same way for the same seed, and can break differently for another", () => {
    const js = [john("k", 2, 1)];
    const one = (seed: string) => who(steadyWeek(week({ budget: 0, johns: js, seed })), "k")[0];
    expect(one("x")).toBe(one("x"));
    const seen = new Set(Array.from({ length: 12 }, (_, i) => one(`h:${i}`)));
    expect(seen.size).toBe(2);
  });

  test("placeDays runs again from scratch after a swap", () => {
    const r = steadyWeek(week({ members: [member("a", { suits: [2] }), member("b", { suits: [6] })], johns: [john("k", 2, 1), john("h", 2, 5)] }));
    const [x, y] = r.places;
    [x.userId, y.userId] = [y.userId, x.userId];
    placeDays(r.places, week({}).johns.concat([john("k", 2, 1), john("h", 2, 5)]), [member("a", { suits: [2] }), member("b", { suits: [6] })]);
    expect(r.places.find((p) => p.userId === "a")!.day).toBe(2);
    expect(r.places.find((p) => p.userId === "b")!.day).toBe(6);
  });
});
