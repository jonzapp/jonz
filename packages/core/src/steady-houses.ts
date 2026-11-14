/**
 * The houses the deal is tested on, and the simulator runs: named houses
 * (each tells one story), one-mechanism houses, the mechanism matrix (every
 * pair of values from two mechanisms in at least one house) and seeded
 * random houses. Everything here is fixed: the same seed always builds the
 * same house, on any machine (a seeded Fisher-Yates shuffle, never a random
 * comparator, which engines sort differently).
 */
import type { RunHouse, RunPerson, Sched } from "./steady-run-types";
import { LAST_OF_MONTH } from "./steady-run";

export type MPerson = RunPerson & { days: number[]; prefs: Record<string, number> };
export const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

export const wk = (every: number, start = 1): Sched => ({ every, start });
export const mo = (months: number, nth: number, from?: number): Sched => (from ? { months, nth, from } : { months, nth });
export const LAST = LAST_OF_MONTH;
const on = <T>(step: number, from: number, W: number, fn: (w: number) => T): T[] => {
  const r: T[] = [];
  for (let w = from; w <= W; w += step) r.push(fn(w));
  return r;
};

export const HOUSES: RunHouse[] = [
  {
    id: "sample", group: "Houses", name: "Two of you, mixed schedules",
    blurb: "The sample house from Lighter weeks. Ada misses her John in week 4 and is away all of week 6.",
    people: [
      { id: "you", name: "You", days: [3, 6, 7], prefs: { Mopping: 1, Garbage: -1 } },
      { id: "ada", name: "Ada", days: [2, 4, 5], prefs: { Kitchen: 1 } },
    ],
    johns: [
      { name: "Mopping", pts: 3, day: 6, sched: wk(1) },
      { name: "Sweeping", pts: 2, day: 3, sched: wk(1) },
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Garbage", pts: 1, day: 4, sched: wk(1), fixed: true },
      { name: "Recycling", pts: 1, day: 4, sched: wk(2, 2), fixed: true },
      { name: "Bathroom deep clean", pts: 5, day: 7, sched: wk(4, 3) },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) },
    ],
    away: { 6: ["ada"] }, miss: [[4, "ada"]],
  },
  {
    id: "yours", group: "Houses", name: "Your house, today’s list",
    blurb: "Your real list in 29D Upper Clapton Road. The dishwasher on call is counted at 4 calls a week (1 point each). This list needs about 19 points a week between two of you.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Housemate" }],
    johns: [
      { name: "Dishwasher empty (on call)", pts: 4, day: 1, onCall: true, often: "on call, about 4 a week" },
      { name: "Kitchen deep clean", pts: 5, day: 6, sched: wk(2, 1) },
      { name: "Bathroom deep clean", pts: 5, day: 6, sched: wk(4, 2) },
      { name: "Bathroom clean", pts: 3, day: 3, sched: wk(1) },
      { name: "Floors hoover and mop", pts: 3, day: 5, sched: wk(1) },
      { name: "Kitchen tidy", pts: 2, day: 2, sched: wk(1) },
      { name: "Shopping restock", pts: 2, day: 4, sched: wk(2, 2) },
      { name: "Bins out", pts: 1, day: 7, sched: wk(1), fixed: true },
    ],
  },
  {
    id: "trimmed", group: "Houses", name: "Your house, list trimmed",
    blurb: "Your list with the dishwasher on call down to about 2 a week, the kitchen deep clean every 4 weeks, and the bathroom deep clean every 8. It needs about 11 points a week, so about two Johns each.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Housemate" }],
    johns: [
      { name: "Dishwasher empty (on call)", pts: 2, day: 1, onCall: true, often: "on call, about 2 a week" },
      { name: "Kitchen deep clean", pts: 5, day: 6, sched: wk(4, 1) },
      { name: "Bathroom deep clean", pts: 5, day: 6, sched: wk(8, 3) },
      { name: "Bathroom clean", pts: 3, day: 3, sched: wk(1) },
      { name: "Floors hoover and mop", pts: 3, day: 5, sched: wk(2, 2) },
      { name: "Kitchen tidy", pts: 2, day: 2, sched: wk(1) },
      { name: "Shopping restock", pts: 2, day: 4, sched: wk(2, 1) },
      { name: "Bins out", pts: 1, day: 7, sched: wk(1), fixed: true },
    ],
  },
  {
    id: "join", group: "Houses", name: "Three of you, someone joins",
    blurb: "Two housemates for four weeks, then Sam moves in and starts on Monday of week 5 at a balance of 0.",
    people: [
      { id: "you", name: "You", days: [1, 3, 6], prefs: { Bathroom: -1 } },
      { id: "ada", name: "Ada", days: [2, 4, 7], prefs: { Bathroom: 1 } },
      { id: "sam", name: "Sam", days: [5, 6, 7], prefs: { Hoovering: 1 }, from: 5 },
    ],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 7, sched: wk(1), fixed: true },
      { name: "Fridge clean-out", pts: 2, day: 6, sched: wk(2, 1) },
      { name: "Change bedding", pts: 1, day: 6, sched: wk(2, 2) },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) },
    ],
  },
  {
    id: "leave", group: "Houses", name: "Three of you, someone moves out",
    blurb: "Sam moves out after week 6, with a missed John still owed. The other two carry on.",
    people: [
      { id: "you", name: "You", days: [2, 4, 6] },
      { id: "ada", name: "Ada", days: [1, 3, 7], prefs: { Bathroom: 1 } },
      { id: "sam", name: "Sam", days: [5, 6], until: 6 },
    ],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 7, sched: wk(1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 1) },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) },
    ],
    miss: [[6, "sam"]],
  },
  {
    id: "four", group: "Houses", name: "Four of you, a fortnight away",
    blurb: "A big house. Priya is away weeks 3 and 4, nobody likes the bathroom, and Ada misses in week 7.",
    people: [
      { id: "you", name: "You", days: [1, 3, 6], prefs: { Bathroom: -1, Hallway: 1 } },
      { id: "ada", name: "Ada", days: [2, 4, 6], prefs: { Bathroom: -1, Kitchen: 1 } },
      { id: "sam", name: "Sam", days: [5, 6, 7], prefs: { Bathroom: -1 } },
      { id: "pri", name: "Priya", days: [1, 2, 3], prefs: { Bathroom: -1, Garden: 1 } },
    ],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Downstairs loo", pts: 2, day: 4, sched: wk(1) },
      { name: "Hallway", pts: 1, day: 5, sched: wk(1) },
      { name: "Living room", pts: 2, day: 6, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Recycling", pts: 1, day: 1, sched: wk(2, 1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 2) },
      { name: "Oven clean", pts: 4, day: 7, sched: mo(1, 2) },
    ],
    trips: [["pri", 3, 4]], miss: [[7, "ada"]],
  },
  {
    id: "rare", group: "Houses", name: "Three of you, mostly rare Johns",
    blurb: "Few weekly Johns and many monthly and longer ones, to show turns counted in each John’s own schedule.",
    people: [
      { id: "you", name: "You", days: [6, 7] },
      { id: "ada", name: "Ada", days: [6, 7], prefs: { Windows: -1 } },
      { id: "sam", name: "Sam", days: [3, 6], prefs: { "Deep clean": 1 } },
    ],
    johns: [
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Kitchen", pts: 2, day: 3, sched: wk(1) },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 1) },
      { name: "Deep clean", pts: 5, day: 6, sched: mo(1, 1) },
      { name: "Oven clean", pts: 4, day: 7, sched: mo(1, 3) },
      { name: "Fridge clean-out", pts: 2, day: 6, sched: mo(2, 1) },
      { name: "Windows", pts: 4, day: 7, sched: mo(3, 2) },
      { name: "Gutters", pts: 5, day: 6, sched: mo(6, 2, 3) },
    ],
  },
  {
    id: "long", group: "Houses", name: "Two of you, a long list",
    blurb: "Ten weekly Johns for two people, about 18 points a week. Try Light to see Johns wait their turn instead of piling up.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }],
    johns: ([
      ["Kitchen", 2, 1], ["Bathroom", 3, 2], ["Hoovering", 2, 3], ["Mopping", 3, 4], ["Dusting", 1, 5],
      ["Laundry", 2, 6], ["Bedding", 1, 7], ["Windowsills", 1, 1], ["Shopping", 2, 2], ["Bins", 1, 7, true],
    ] as [string, number, number, boolean?][]).map(([name, pts, day, fixed]) => ({ name, pts, day, sched: wk(1), ...(fixed ? { fixed } : {}) })),
  },
  {
    id: "misser", group: "Houses", name: "Two of you, one keeps missing",
    blurb: "Ada misses a John every three weeks, for as long as the run goes. Each miss comes back to her and counts for nobody.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Floors", pts: 3, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 7, sched: wk(1), fixed: true },
      { name: "Deep clean", pts: 5, day: 6, sched: wk(4, 2) },
    ],
    miss: (W) => on(3, 2, W, (w): [number, string] => [w, "ada"]),
  },
  {
    id: "weekends", group: "Houses", name: "Three of you, one works nights",
    blurb: "Sam only has time at weekends, and most Johns are set for weekdays. Watch Johns move to a day that suits each person, never two on one day.",
    people: [
      { id: "you", name: "You", days: [1, 2, 3, 4] },
      { id: "ada", name: "Ada", days: [3, 4, 5] },
      { id: "sam", name: "Sam", days: [6, 7], prefs: { Garden: 1 } },
    ],
    johns: [
      { name: "Kitchen", pts: 2, day: 1, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 2, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 3, sched: wk(1) },
      { name: "Laundry", pts: 2, day: 4, sched: wk(1) },
      { name: "Bins", pts: 1, day: 4, sched: wk(1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 1) },
      { name: "Windows", pts: 4, day: 5, sched: mo(1, 1) },
    ],
  },
  {
    id: "big", group: "Houses", name: "Two of you, only big Johns",
    blurb: "Every John is 4 or 5 points, more than the Light budget. Everyone still gets one a week, and the rest wait their turn.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }],
    johns: [
      { name: "Kitchen deep clean", pts: 5, day: 6, sched: wk(2, 1) },
      { name: "Bathroom deep clean", pts: 5, day: 7, sched: wk(2, 2) },
      { name: "Full hoover and mop", pts: 4, day: 6, sched: wk(1) },
      { name: "Big shop", pts: 4, day: 4, sched: wk(1) },
      { name: "Garden", pts: 4, day: 7, sched: wk(2, 1) },
    ],
  },

  // ---- One mechanism each ----
  {
    id: "together", group: "Mechanisms", name: "Done together",
    blurb: "The garden is done by everyone home, every other Saturday. The big shop is done by two. Each place counts its points for whoever has it, and nobody gets two places in one job.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }],
    johns: [
      { name: "Garden together", pts: 3, day: 6, sched: wk(2, 1), crew: 0 },
      { name: "Big shop for two", pts: 2, day: 7, sched: wk(1), crew: 2 },
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
    ],
    away: { 3: ["sam"] }, miss: [[5, "ada"]],
  },
  {
    id: "groups", group: "Mechanisms", name: "Two bathrooms, two groups",
    blurb: "You and Ada share the upstairs bathroom, Sam and Priya the downstairs one. Each bathroom only goes to its group, and only its group owes a share of it.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }, { id: "pri", name: "Priya" }],
    johns: [
      { name: "Upstairs bathroom", pts: 3, day: 3, sched: wk(1), group: ["you", "ada"] },
      { name: "Downstairs bathroom", pts: 3, day: 4, sched: wk(1), group: ["sam", "pri"] },
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
    ],
    trips: [["ada", 4, 5]],
  },
  {
    id: "makeup", group: "Mechanisms", name: "Away, made up at half",
    blurb: "The house makes up time away at half. Ada is away weeks 3 to 5: she owes half her part of those weeks, and the deal hands her a little more after until it evens out.",
    makeup: 0.5,
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) },
    ],
    trips: [["ada", 3, 5]],
  },
  {
    id: "rejoin", group: "Mechanisms", name: "Moves out, then back",
    blurb: "Sam moves out after week 4 and back in at week 9, joining the back of every order of turns again. Balances carry over, as they do today.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam", stints: [[1, 4], [9, Infinity]] }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 2) },
    ],
    miss: [[4, "sam"]],
  },
  {
    id: "changes", group: "Mechanisms", name: "An admin changes things",
    blurb: "Week 3 a window clean is added, week 5 the budget drops to Light, week 6 the bathroom goes up to 4 points, week 7 the garden comes off the list, week 8 the kitchen deep clean moves to every 3 weeks, and week 9 the house switches mode.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1), changes: [{ w: 6, pts: 4 }] },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 1), until: 6 },
      { name: "Kitchen deep clean", pts: 4, day: 6, sched: wk(2, 2), changes: [{ w: 8, sched: wk(3, 8) }] },
      { name: "Windows", pts: 3, day: 7, sched: mo(1, 1), from: 3 },
    ],
    events: [{ w: 5, budget: 2 }, { w: 9, switchMode: true }],
  },
  {
    id: "covers", group: "Mechanisms", name: "Covers, excused and a swap",
    blurb: "Week 2 Ada covers your John, so it counts for her. Week 4 you’re excused (the house lets you off), so it still counts for you. Week 5 you and Ada swap after a “rather not”.",
    people: [{ id: "you", name: "You", prefs: { Bathroom: -1 } }, { id: "ada", name: "Ada" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
    ],
    cover: [[2, "you", "ada"]], excuse: [[4, "you"]], swaps: [[5, "you", "ada"]],
  },
  {
    id: "solo", group: "Mechanisms", name: "A house of one",
    blurb: "One person, a normal list. Everything goes to you, one a day, within the budget; the rest waits its turn.",
    people: [{ id: "you", name: "You", days: [1, 3, 5, 6] }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, LAST) },
    ],
  },
  {
    id: "eight", group: "Mechanisms", name: "Eight of you, a big shared house",
    blurb: "Eight housemates and twelve Johns: plenty of hands, so most weeks some people have one small John or nothing at all.",
    people: ["You", "Ada", "Sam", "Priya", "Tom", "Mo", "Lena", "Kit"].map((name, i) => ({ id: "p" + i, name })),
    johns: [
      { name: "Kitchen", pts: 2, day: 1, sched: wk(1) }, { name: "Kitchen floor", pts: 2, day: 4, sched: wk(1) },
      { name: "Bathroom 1", pts: 3, day: 2, sched: wk(1) }, { name: "Bathroom 2", pts: 3, day: 3, sched: wk(1) },
      { name: "Hoovering", pts: 2, day: 5, sched: wk(1) }, { name: "Stairs", pts: 1, day: 6, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true }, { name: "Recycling", pts: 1, day: 1, sched: wk(2, 1), fixed: true },
      { name: "Garden", pts: 3, day: 6, sched: wk(2, 2) }, { name: "Fridge clean-out", pts: 2, day: 7, sched: wk(4, 1) },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) }, { name: "Windows", pts: 4, day: 7, sched: mo(3, 2) },
    ],
    trips: [["p3", 2, 3], ["p6", 7, 9]],
  },
  {
    id: "yearly", group: "Mechanisms", name: "Once a year, and the last of the month",
    blurb: "Gutters on the last Sunday of November every year, the boiler service each March, windows twice a year, and the oven on the last Saturday of each month. Run it for three years to see each come round.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, LAST) },
      { name: "Windows", pts: 4, day: 7, sched: mo(6, 1) },
      { name: "Gutters", pts: 5, day: 7, sched: mo(12, LAST) },
      { name: "Boiler service", pts: 2, day: 3, sched: mo(12, 2, 15) },
    ],
  },
  {
    id: "holiday", group: "Mechanisms", name: "Everyone away for the holidays",
    blurb: "The whole house is away weeks 8 and 9 (Christmas). Nothing is dealt, nobody owes anything for those weeks, and the Johns wait for the first week back.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }, { id: "sam", name: "Sam" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Deep clean", pts: 5, day: 6, sched: wk(4, 1) },
      { name: "Oven clean", pts: 4, day: 6, sched: mo(1, 1) },
    ],
    trips: [["you", 8, 9], ["ada", 8, 9], ["sam", 8, 9]],
  },
  {
    id: "misstwice", group: "Mechanisms", name: "Missed, and missed again",
    blurb: "Ada misses the deep clean in week 2, then misses it again when it comes back in week 3. It keeps coming back to her until it’s done.",
    people: [{ id: "you", name: "You" }, { id: "ada", name: "Ada" }],
    johns: [
      { name: "Kitchen", pts: 2, day: 2, sched: wk(1) },
      { name: "Deep clean", pts: 5, day: 6, sched: wk(4, 2) },
      { name: "Bins", pts: 1, day: 1, sched: wk(1), fixed: true },
      { name: "Bathroom", pts: 3, day: 3, sched: wk(1) },
    ],
    miss: [[2, "ada", "Deep clean"], [3, "ada", "Deep clean"]],
  },
];

