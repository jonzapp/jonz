import { describe, expect, test } from "vitest";
import { check } from "./steady-checks";
import type { RunHouse } from "./steady-run-types";
import { steadyRun } from "./steady-run";

// Group-only Johns are balanced within their group, and the whole house's Johns across everyone: points in one
// pool never move anyone's share of another. Glyn's example: five housemates, the main floor (Glyn, Ivy and
// Kristen) shares a bathroom; Aidan and Robbie clean their own outside the app.

const MAIN = ["glyn", "ivy", "kristen"];
const ALL = [...MAIN, "aidan", "robbie"];
const wk = (every: number, start = 1) => ({ every, start });
const BATH = "Bathroom clean";

/** 3 points a week for the main floor's bathroom, 10 for the whole house. */
const mainFloor = (more: Partial<RunHouse> = {}, bath: Partial<RunHouse["johns"][number]> = {}): RunHouse => ({
  id: "mainfloor",
  name: "Five of you, a main-floor bathroom",
  people: ALL.map((id) => ({ id, name: id })),
  johns: [
    { name: BATH, pts: 3, day: 3, sched: wk(1), group: MAIN, pool: "main", ...bath },
    { name: "Kitchen tidy", pts: 3, day: 2, sched: wk(1) },
    { name: "Floors", pts: 3, day: 5, sched: wk(1) },
    { name: "Hoovering", pts: 2, day: 6, sched: wk(1) },
    { name: "Bins out", pts: 1, day: 7, sched: wk(1), fixed: true },
    { name: "Shopping", pts: 1, day: 4, sched: wk(1) },
  ],
  ...more,
});

type Run = ReturnType<typeof steadyRun>;
/** Points each person was handed, of the bathroom (`group`) or of the whole house's Johns, in weeks a to b. */
const handed = (res: Run, group: boolean, a = 1, b = Infinity) => {
  const t: Record<string, number> = Object.fromEntries(ALL.map((id) => [id, 0]));
  for (const w of res.weeks.filter((x) => x.w >= a && x.w <= b))
    for (const [pid, items] of Object.entries(w.got)) for (const it of items) if ((it.name === BATH) === group) t[pid] += it.pts;
  return t;
};
const spread = (t: Record<string, number>, ids: string[]) => Math.max(...ids.map((id) => t[id])) - Math.min(...ids.map((id) => t[id]));
const passes = (res: Run, label: string) => {
  const { fails } = check(res);
  expect(Object.fromEntries(Object.entries(fails).map(([k, f]) => [k, `week ${f.w}: ${f.why}`])), label).toEqual({});
};

// Light (2) isn't here: this list needs 13 points a week against 10, so something has to give. Smart still
// keeps it even there; Classic, which only takes turns, can't.
const SETTINGS = [["smart", 2], ["smart", 4], ["smart", 6], ["smart", 0], ["classic", 4], ["classic", 6], ["classic", 0]] as const;

describe("group-only Johns don't skew the whole house's Johns", () => {
  for (const [mode, budget] of SETTINGS) {
    for (const weeks of [12, 156]) {
      test(`${mode}, budget ${budget || "no limit"}, ${weeks} weeks: about 2 points a week each of the house's Johns, the bathroom even on the main floor`, () => {
        const res = steadyRun(mainFloor(), { mode, budget, weeks });
        passes(res, `${mode} ${budget}`);
        const house = handed(res, false);
        const bath = handed(res, true);
        // Within one John of each other, and of 2 points a week.
        expect(spread(house, ALL), JSON.stringify(house)).toBeLessThanOrEqual(3);
        for (const id of ALL) expect(Math.abs(house[id] - 2 * weeks), `${id} ${JSON.stringify(house)}`).toBeLessThanOrEqual(3);
        expect(spread(bath, MAIN), JSON.stringify(bath)).toBeLessThanOrEqual(3);
        expect(bath.aidan + bath.robbie).toBe(0);
      });
    }
  }
});

describe("each pool keeps its own balance", () => {
  const near = (res: Run, w: number, tol = 3.01) => {
    for (const [id, pools] of Object.entries(res.weeks[w - 1].pools!))
      for (const [k, v] of Object.entries(pools)) expect(Math.abs(v), `week ${w} ${id} ${k || "house"} ${v}`).toBeLessThanOrEqual(tol);
  };

  test("the pools add up to the balance, and only the main floor has a bathroom pool", () => {
    const res = steadyRun(mainFloor(), { mode: "smart", budget: 4, weeks: 12 });
    for (const w of res.weeks)
      for (const [id, pools] of Object.entries(w.pools!)) {
        expect(Object.keys(pools).sort(), id).toEqual(MAIN.includes(id) ? ["", "main"] : [""]);
        expect(Object.values(pools).reduce((s, v) => s + v, 0)).toBeCloseTo(w.bal[id], 6);
      }
  });

  for (const makeup of [1, 0.5, 0]) {
    test(`away, made up ${makeup === 1 ? "in full" : makeup ? "at half" : "not at all"}: Glyn catches up on the bathroom with the bathroom`, () => {
      const res = steadyRun(mainFloor({ trips: [["glyn", 3, 4]], makeup }), { mode: "smart", budget: 4, weeks: 16 });
      passes(res, "away");
      // While he was away the other two did the bathroom, so he owes it there, and nowhere else he didn't owe.
      // Each week away he owes his part (1 point) at the make-up rate.
      const before = res.weeks[1].pools!;
      const after = res.weeks[3].pools!;
      expect(after.glyn.main - before.glyn.main).toBeCloseTo(-2 * makeup, 6);
      near(res, 16);
    });
  }

  test("someone covering a group's John they don't share is credited for the whole house's Johns", () => {
    const base = steadyRun(mainFloor(), { mode: "smart", budget: 4, weeks: 3 });
    const owner = MAIN.find((id) => base.weeks[2].got[id].some((i) => i.name === BATH))!;
    const res = steadyRun(mainFloor({ cover: [[3, owner, "aidan", BATH]] }), { mode: "smart", budget: 4, weeks: 12 });
    passes(res, "cover");
    const before = res.weeks[1].pools!;
    const after = res.weeks[2].pools!;
    // Aidan has no bathroom pool: the 3 points are his for the house's Johns.
    expect(Object.keys(after.aidan)).toEqual([""]);
    expect(after.aidan[""] - before.aidan[""]).toBeCloseTo(3 + base.weeks[2].dealt.aidan - base.weeks[2].end.find((e) => e.pid === "aidan")!.share, 6);
    // Whoever's bathroom it was owes it in the bathroom's pool, and does it next.
    expect(after[owner].main - before[owner].main).toBeCloseTo(-1, 6);
    expect(res.weeks[3].got[owner].some((i) => i.name === BATH)).toBe(true);
  });

  test("a swap credits whoever did each John, in that John's pool", () => {
    const base = steadyRun(mainFloor(), { mode: "classic", budget: 6, weeks: 2 });
    const owner = MAIN.find((id) => base.weeks[1].got[id].some((i) => i.name === BATH))!;
    const other = MAIN.find((id) => id !== owner && base.weeks[1].got[id].some((i) => !i.pinned))!;
    const res = steadyRun(mainFloor({ swaps: [[2, owner, other]] }), { mode: "classic", budget: 6, weeks: 2 });
    const w2 = res.weeks[1];
    expect(w2.swaps).toHaveLength(1);
    const did = (id: string) => w2.got[id].filter((i) => i.name === BATH).length * 3;
    for (const id of MAIN) expect(w2.pools![id].main - res.weeks[0].pools![id].main).toBeCloseTo(did(id) - 1, 6);
  });

  test("leaving the group: from then on the bathroom is the other two's, and Kristen's balance there counts for the house", () => {
    const res = steadyRun(mainFloor({}, { changes: [{ w: 7, group: ["glyn", "ivy"] }] }), { mode: "smart", budget: 4, weeks: 30 });
    passes(res, "leave");
    const bath = handed(res, true, 7);
    expect(bath.kristen).toBe(0);
    expect(spread(bath, ["glyn", "ivy"])).toBeLessThanOrEqual(3);
    expect(Object.keys(res.weeks[6].pools!.kristen)).toEqual([""]);
    expect(res.weeks[6].pools!.kristen[""]).toBeCloseTo(res.weeks[6].bal.kristen, 6);
    for (let w = 7; w <= 30; w++) near(res, w);
  });

  test("joining the group: Aidan starts level in its pool and takes his turns", () => {
    const res = steadyRun(mainFloor({}, { changes: [{ w: 7, group: [...MAIN, "aidan"] }] }), { mode: "smart", budget: 4, weeks: 30 });
    passes(res, "join");
    expect(Object.keys(res.weeks[5].pools!.aidan)).toEqual([""]);
    expect(Math.abs(res.weeks[6].pools!.aidan.main)).toBeLessThanOrEqual(3);
    // Within a John of level in each pool, every week from then on.
    for (let w = 7; w <= 30; w++) near(res, w);
    expect(handed(res, true, 7).aidan).toBeGreaterThanOrEqual(15);
  });
});
