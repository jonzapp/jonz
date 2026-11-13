/**
 * The houses the deal is tested on, and the simulator runs: named houses
 * (each tells one story), one-mechanism houses, the mechanism matrix (every
 * pair of values from two mechanisms in at least one house) and seeded
 * random houses. Everything here is fixed: the same seed always builds the
 * same house, on any machine (a seeded Fisher-Yates shuffle, never a random
 * comparator, which engines sort differently).
 */
import type { RunHouse, RunJohn, RunPerson, Sched } from "./steady-run";
import { LAST_OF_MONTH, periodOf } from "./steady-run";

type MPerson = RunPerson & { days: number[]; prefs: Record<string, number> };
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

const wk = (every: number, start = 1): Sched => ({ every, start });
const mo = (months: number, nth: number, from?: number): Sched => (from ? { months, nth, from } : { months, nth });
const LAST = LAST_OF_MONTH;
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

// ---- Seeded random numbers: the same seed, the same numbers, everywhere ----
function mulberry(a: number): () => number { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES = ["You", "Ada", "Sam", "Priya", "Tom", "Mo", "Lena", "Kit", "Ola"];

// ---- The mechanism matrix ----
// Each mechanism and the ways it can be. Every pair of values from two different mechanisms is in at least
// one house, and each house runs in both modes at every budget.
export const MECHANISMS: { id: string; label: string; values: string[] }[] = [
  { id: "size", label: "People", values: ["1", "2", "3", "5", "8"] },
  { id: "load", label: "How much the list needs", values: ["under the budget", "about the budget", "twice the budget", "four times the budget"] },
  { id: "sizes", label: "John sizes", values: ["mixed", "only big (4 to 5)", "only small (1 to 2)"] },
  { id: "sched", label: "Schedules", values: ["weekly", "every few weeks", "monthly and last of the month", "yearly and twice a year"] },
  { id: "keep", label: "Keeps its day", values: ["none", "some", "two on the same day"] },
  { id: "together", label: "Done together", values: ["none", "everyone home", "two people"] },
  { id: "oncall", label: "On call", values: ["none", "one on-call John"] },
  { id: "groups", label: "Groups", values: ["whole house", "a John for half the house"] },
  { id: "prefs", label: "Preferences", values: ["none", "days that suit", "rather do and rather not", "everyone rather not the same John"] },
  { id: "away", label: "Time away", values: ["none", "odd weeks", "a six-week trip", "everyone away together"] },
  { id: "makeup", label: "Away made up", values: ["in full", "half", "none"] },
  { id: "people", label: "Moving in and out", values: ["nobody", "someone joins", "someone leaves", "leaves and comes back", "one leaves as another joins"] },
  { id: "misses", label: "Misses", values: ["none", "now and then", "one person keeps missing", "misses the comeback too"] },
  { id: "covers", label: "Covers and excused", values: ["none", "covers", "excused"] },
  { id: "admin", label: "Admin changes", values: ["none", "budget changes", "mode switches", "John added", "John removed", "points change", "schedule changes"] },
  { id: "swaps", label: "Swaps", values: ["none", "a swap now and then"] },
];

// Greedy pairwise cover (deterministic): each new row is the candidate, of 60 seeded tries, that covers the most
// pairs not yet covered. Stops when every pair is covered.
export function pairwise(dims: { values: string[] }[], seed = 1): number[][] {
  const r = mulberry(seed);
  const key = (a: number, x: number, b: number, y: number) => `${a}:${x}|${b}:${y}`;
  const left = new Set<string>();
  dims.forEach((A, a) => dims.forEach((Bd, b) => { if (b > a) A.values.forEach((_, x) => Bd.values.forEach((__, y) => left.add(key(a, x, b, y)))); }));
  const rows: number[][] = [];
  while (left.size) {
    let best: { row: number[]; gain: number } | null = null;
    for (let t = 0; t < 60; t++) {
      // Start from one uncovered pair so every row makes progress, then fill the rest greedily.
      const [first] = left;
      const [p1, p2] = first.split("|");
      const [a, x] = p1.split(":").map(Number), [b, y] = p2.split(":").map(Number);
      const row = dims.map(() => -1); row[a] = x; row[b] = y;
      // A seeded shuffle (Fisher–Yates). Never sort with a random comparator: engines sort differently.
      const orderDims = dims.map((_, i) => i).filter((i) => row[i] < 0);
      for (let i = orderDims.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [orderDims[i], orderDims[k]] = [orderDims[k], orderDims[i]]; }
      for (const d of orderDims) {
        let bv = 0, bs = -1;
        dims[d].values.forEach((_, v) => {
          let s = 0;
          row.forEach((rv, e) => { if (rv >= 0 && e !== d && left.has(e < d ? key(e, rv, d, v) : key(d, v, e, rv))) s++; });
          s += r() * 0.5;
          if (s > bs) { bs = s; bv = v; }
        });
        row[d] = bv;
      }
      let gain = 0;
      row.forEach((x1, a1) => row.forEach((y1, b1) => { if (b1 > a1 && left.has(key(a1, x1, b1, y1))) gain++; }));
      if (!best || gain > best.gain) best = { row, gain };
    }
    const chosen = best!.row;
    chosen.forEach((x1, a1) => chosen.forEach((y1, b1) => { if (b1 > a1) left.delete(key(a1, x1, b1, y1)); }));
    rows.push(chosen);
  }
  return rows;
}

// A house from one row of the matrix. `W` is how many weeks it will run, so time away and misses spread over it.
export function matrixHouse(row: number[], index: number, W = 156): RunHouse {
  const v = Object.fromEntries(MECHANISMS.map((m, i) => [m.id, m.values[row[i]]]));
  const r = mulberry(1000 + index);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const n = Number(v.size);
  const people: MPerson[] = NAMES.slice(0, n).map((name, i) => ({ id: "p" + i, name, days: [], prefs: {} }));
  const extra: MPerson = { id: "p" + n, name: NAMES[n], days: [], prefs: {} };
  const ids = () => people.map((p) => p.id);

  // Johns: enough to need the chosen multiple of a Usual budget (4 points each).
  const want = ({ "under the budget": 0.6, "about the budget": 1, "twice the budget": 2, "four times the budget": 4 } as Record<string, number>)[v.load] * 4 * Math.max(n, 1);
  const ptsOf = () => (v.sizes === "only big (4 to 5)" ? 4 + Math.floor(r() * 2) : v.sizes === "only small (1 to 2)" ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 5));
  const schedOf = (i: number): Sched => {
    if (v.sched === "weekly") return wk(1);
    if (v.sched === "every few weeks") return i % 3 === 0 ? wk(1) : wk(pick([2, 3, 4, 6, 8]), 1 + Math.floor(r() * 4));
    if (v.sched === "monthly and last of the month") return i % 3 === 0 ? wk(1) : mo(pick([1, 1, 2, 3]), pick([1, 2, 3, 4, LAST]));
    return i % 3 === 0 ? wk(1) : i % 3 === 1 ? mo(pick([6, 12]), pick([1, 2, LAST]), 1 + Math.floor(r() * 30)) : wk(pick([2, 4]));
  };
  const johns: RunJohn[] = [];
  let need = 0;
  for (let i = 1; need < want || johns.length < 3; i++) {
    const sched = schedOf(i);
    const j: RunJohn = { name: "John " + i, pts: ptsOf(), day: 1 + Math.floor(r() * 7), sched };
    johns.push(j);
    need += j.pts / periodOf(sched);
    if (johns.length >= 24) break;
  }
  const weeklyish = johns.filter((j) => j.sched && !("months" in j.sched) && j.sched.every <= 2);
  if (v.keep === "some") weeklyish.slice(0, 2).forEach((j) => (j.fixed = true));
  if (v.keep === "two on the same day") {
    johns.push({ name: "Bins", pts: 1, day: 3, sched: wk(1), fixed: true });
    johns.push({ name: "Recycling", pts: 1, day: 3, sched: wk(1), fixed: true });
  }
  if (v.together === "everyone home") johns.push({ name: "Garden together", pts: 3, day: 6, sched: wk(2, 1), crew: 0 });
  if (v.together === "two people") johns.push({ name: "Big shop for two", pts: 2, day: 7, sched: wk(1), crew: 2 });
  if (v.oncall !== "none") johns.push({ name: "Dishwasher (on call)", pts: 3, day: 1, onCall: true });
  if (v.groups !== "whole house" && n >= 2) johns.push({ name: "Upstairs bathroom", pts: 3, day: 3, sched: wk(1), group: ids().slice(0, Math.ceil(n / 2)) });

  if (v.prefs === "days that suit") people.forEach((p) => (p.days = range(1, 7).filter(() => r() < 0.45)));
  if (v.prefs === "rather do and rather not") people.forEach((p) => johns.forEach((j) => { const x = r(); if (x < 0.15) p.prefs[j.name] = 1; else if (x < 0.3) p.prefs[j.name] = -1; }));
  if (v.prefs === "everyone rather not the same John") people.forEach((p) => (p.prefs[johns[0].name] = -1));

  // Moving in and out, scaled to the run.
  const at = (f: number) => Math.max(2, Math.round(W * f));
  if (v.people === "someone joins") people.push({ ...extra, from: at(0.3) });
  if (v.people === "someone leaves") { if (n >= 2) people[n - 1].until = at(0.4); else people.push({ ...extra, from: at(0.2), until: at(0.6) }); }
  if (v.people === "leaves and comes back") { const p = n >= 2 ? people[n - 1] : (people.push({ ...extra }), people[people.length - 1]); p.stints = [[1, at(0.3)], [at(0.55), Infinity]]; }
  if (v.people === "one leaves as another joins") { if (n >= 2) people[n - 1].until = at(0.5); people.push({ ...extra, from: at(0.5) + 1 }); }

  const everyone = people.map((p) => p.id);
  const trips: [string, number, number][] = [];
  const away: Record<number, string[]> = {};
  if (v.away === "odd weeks") range(1, W).forEach((w) => everyone.forEach((id) => { if (r() < 0.05) (away[w] = away[w] || []).push(id); }));
  if (v.away === "a six-week trip") trips.push([everyone[0], at(0.25), at(0.25) + 5]);
  if (v.away === "everyone away together") { const a = at(0.45); everyone.forEach((id) => trips.push([id, a, a + 1])); }
  const makeup = ({ "in full": 1, half: 0.5, none: 0 } as Record<string, number>)[v.makeup];

  const miss: [number, string][] = [];
  if (v.misses === "now and then") range(1, W).forEach((w) => everyone.forEach((id) => { if (r() < 0.04) miss.push([w, id]); }));
  if (v.misses === "one person keeps missing") range(1, W).forEach((w) => { if (w % 3 === 2) miss.push([w, everyone[0]]); });
  if (v.misses === "misses the comeback too") range(1, W).forEach((w) => { if (w % 10 === 3 || w % 10 === 4) miss.push([w, everyone[0]]); });

  const cover: [number, string, string][] = [];
  const excuse: [number, string][] = [];
  const swaps: [number, string, string][] = [];
  if (v.covers === "covers" && everyone.length >= 2) range(1, W).forEach((w) => { if (r() < 0.06) { const a = pick(everyone); const b = pick(everyone.filter((x) => x !== a)); cover.push([w, a, b]); } });
  if (v.covers === "excused") range(1, W).forEach((w) => { if (r() < 0.05) excuse.push([w, pick(everyone)]); });
  if (v.swaps !== "none" && everyone.length >= 2) range(1, W).forEach((w) => { if (r() < 0.05) { const a = pick(everyone); const b = pick(everyone.filter((x) => x !== a)); swaps.push([w, a, b]); } });

  const events: NonNullable<Exclude<RunHouse["events"], (w: number) => unknown>> = [];
  const mid = at(0.5);
  if (v.admin === "budget changes") events.push({ w: mid, budgetStep: true });
  if (v.admin === "mode switches") events.push({ w: mid, switchMode: true });
  if (v.admin === "John added") johns.push({ name: "New John", pts: 3, day: 5, sched: wk(1), from: mid });
  if (v.admin === "John removed") johns[0].until = mid;
  if (v.admin === "points change") johns[0].changes = [{ w: mid, pts: johns[0].pts >= 4 ? 1 : 5 }];
  if (v.admin === "schedule changes") johns[0].changes = [{ w: mid, sched: johns[0].sched && "months" in johns[0].sched ? wk(1) : mo(1, 2) }];

  const label = MECHANISMS.map((m) => `${m.label}: ${v[m.id]}`).join("; ");
  return { id: "matrix-" + (index + 1), group: "Matrix", name: `Matrix house ${index + 1}`, blurb: label, values: v, people, johns, away, trips, makeup, miss, cover, excuse, swaps, events };
}

// ---- Random houses for the stress test ----
const KINDS: ((r: () => number) => Sched)[] = [() => wk(1), () => wk(1), () => wk(1), (r) => wk(2, 1 + Math.floor(r() * 2)), (r) => wk(4, 1 + Math.floor(r() * 4)), (r) => mo(1, 1 + Math.floor(r() * 5)), (r) => mo(2, 1 + Math.floor(r() * 4)), (r) => mo(12, 1 + Math.floor(r() * 5), 1 + Math.floor(r() * 50))];
export function randomHouse(seed: number, W = 52): RunHouse {
  const r = mulberry(seed);
  const n = 1 + Math.floor(r() * 6);
  const people: MPerson[] = NAMES.slice(0, n).map((nm, i) => ({ id: "p" + i, name: nm, days: r() < 0.5 ? [] : range(1, 7).filter(() => r() < 0.45), prefs: {} }));
  if (n > 1 && r() < 0.25) people[n - 1].from = 2 + Math.floor(r() * (W - 4));
  else if (n > 1 && r() < 0.25) people[n - 1].until = 2 + Math.floor(r() * (W - 4));
  const nj = 3 + Math.floor(r() * 11);
  const johns: RunJohn[] = range(1, nj).map((i) => {
    const sched = KINDS[Math.floor(r() * KINDS.length)](r);
    const j: RunJohn = { name: "John " + i, pts: 1 + Math.floor(r() * 5), day: 1 + Math.floor(r() * 7), sched };
    if (!("months" in sched) && sched.every <= 2 && r() < 0.2) j.fixed = true;
    if (r() < 0.05) j.crew = r() < 0.5 ? 0 : 2;
    if (n >= 3 && r() < 0.08) j.group = people.slice(0, 2).map((p) => p.id);
    return j;
  });
  if (r() < 0.2) johns.push({ name: "On call", pts: 1 + Math.floor(r() * 4), day: 1, onCall: true });
  people.forEach((p) => johns.forEach((j) => { const x = r(); if (x < 0.08) p.prefs[j.name] = 1; else if (x < 0.16) p.prefs[j.name] = -1; }));
  const away: Record<number, string[]> = {};
  const miss: [number, string][] = [];
  range(1, W).forEach((w) => people.forEach((p) => { if (r() < 0.06) (away[w] = away[w] || []).push(p.id); else if (r() < 0.04) miss.push([w, p.id]); }));
  const makeup = [1, 1, 0.5, 0][Math.floor(r() * 4)];
  return { id: "random-" + seed, group: "Stress test", name: `Random house #${seed}`, blurb: `A random house from the stress test: ${n} ${n === 1 ? "person" : "people"} and ${johns.length} Johns, time away made up ${makeup === 1 ? "in full" : makeup ? "at half" : "not at all"}.`, people, johns, away, miss, makeup };
}

