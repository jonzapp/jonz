import { describe, expect, it } from "vitest";

import {
  andNames,
  crewByJob,
  crewLine,
  jobPlaces,
  rollCallPlan,
  rollCallStart,
  tableInputs,
  type CreditPlace,
  type RollCallPlace,
} from "./crew";
import { fairSharesExplained, togetherPlaces, type DealJohn } from "./deal";
import { settleOutcome } from "./outcome";
import { standings } from "./points";
import { settleMonth } from "./stake";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const NOW = new Date("2026-10-28T12:00:00Z");
const EARLIER = new Date("2026-10-27T12:00:00Z");

/** A place of a John for the roll call: open unless said otherwise. */
const place = (userId: string, extra: Partial<RollCallPlace> = {}): RollCallPlace => ({
  userId,
  points: 4,
  doneAt: null,
  absentAt: null,
  coveredBy: null,
  outcome: null,
  excused: false,
  ...extra,
});

describe("the roll call, before it's sent", () => {
  const garden = [place("ann"), place("ben"), place("cal")];

  it("starts with whoever ticks it, then everyone else still holding an open place", () => {
    expect(rollCallStart(garden, "ben")).toEqual(["ben", "ann", "cal"]);
    expect(rollCallStart([place("ann"), place("ben", { excused: true })], "ann")).toEqual(["ann"]);
  });

  it("shares every open place's points among everyone on it", () => {
    expect(rollCallPlan(garden, ["ann", "ben", "cal"])).toEqual({ total: 12, each: 4, absent: [], helpers: [] });
  });

  it("leaves off a holder as a miss, and their part goes to whoever did it", () => {
    expect(rollCallPlan(garden, ["ann", "ben"])).toEqual({ total: 12, each: 6, absent: ["cal"], helpers: [] });
  });

  it("counts a helper in the split: bins done with help is 1 each", () => {
    expect(rollCallPlan([place("ann", { points: 2 })], ["ann", "dee"])).toEqual({ total: 2, each: 1, absent: [], helpers: ["dee"] });
  });

  it("brings in an excused place whose holder turns up anyway, and never one already settled", () => {
    const places = [place("ann"), place("ben", { excused: true }), place("cal", { doneAt: EARLIER })];
    expect(rollCallPlan(places, ["ann"]).total).toBe(4);
    expect(rollCallPlan(places, ["ann", "ben"])).toMatchObject({ total: 8, each: 4, helpers: [] });
  });
});

describe("the Table's credit", () => {
  const crew = { tickedFrom: "p1", tickedBy: "ann", total: 12, people: [
    { userId: "ann", helper: false, points: 4 },
    { userId: "ben", helper: false, points: 4 },
    { userId: "dee", helper: true, points: 4 },
  ] };
  const places: CreditPlace[] = [
    { id: "p1", jobId: "j", userId: "ann", points: 4, status: "done", coveredBy: null, crew },
    { id: "p2", jobId: "j", userId: "ben", points: 4, status: "done", coveredBy: null, crew },
    { id: "p3", jobId: "j", userId: "cal", points: 4, status: "missed", coveredBy: null, absentAt: EARLIER, crew },
  ];

  it("counts a roll call once, shared by everyone on it, helpers included", () => {
    const { rows, jobs } = tableInputs(places);
    expect(rows.map((r) => r.shared)).toEqual([true, true, true]);
    expect(jobs).toEqual([{ status: "done", points: 12, crew: crew.people }]);
    const table = standings(rows, ["ann", "ben", "cal", "dee"], jobs);
    const by = Object.fromEntries(table.map((r) => [r.userId, r]));
    expect([by.ann.points, by.ben.points, by.dee.points, by.cal.points]).toEqual([4, 4, 4, 0]);
    expect(by.dee.helped).toBe(1);
    expect(by.ann.helped).toBe(0);
    // Left off: a miss for Cal.
    expect(by.cal.missed).toBe(1);
  });

  it("halves a late roll call's share, and splits thirds to a hundredth", () => {
    const late = places.map((p) => ({ ...p, status: p.status === "done" ? ("late" as const) : p.status }));
    const { rows, jobs } = tableInputs(late);
    const table = standings(rows, ["ann", "ben", "cal", "dee"], jobs);
    expect(table.find((r) => r.userId === "ann")!.points).toBe(2);
    const odd = tableInputs([{ ...places[0], points: 2, crew: { ...crew, total: 2 } }]);
    expect(standings(odd.rows, ["ann", "ben", "dee"], odd.jobs).find((r) => r.userId === "ann")!.points).toBe(0.67);
  });

  it("credits a place no roll call has touched to its holder, as before", () => {
    const { rows, jobs } = tableInputs([{ id: "p9", userId: "ann", points: 3, status: "done", coveredBy: null }]);
    expect(jobs).toEqual([]);
    expect(standings(rows, ["ann"], jobs)[0].points).toBe(3);
  });

  it("reads each roll call from the place it was ticked from, its ticker first", () => {
    const read = crewByJob([
      { id: "p2", user_id: "ben", job_id: "j", crew: null },
      {
        id: "p1",
        user_id: "ann",
        job_id: "j",
        crew: [
          { user_id: "ben", helper: false, points: "1.5" },
          { user_id: "ann", helper: false, points: 1.5 },
        ],
      },
    ]);
    expect(read.get("j")).toEqual({
      tickedFrom: "p1",
      tickedBy: "ann",
      total: 3,
      people: [
        { userId: "ann", helper: false, points: 1.5 },
        { userId: "ben", helper: false, points: 1.5 },
      ],
    });
  });
});

describe("a place left off", () => {
  const facts = { dueAt: EARLIER, doneAt: null, excused: false, disputeOpen: false, weekEndsAt: NOW, absentAt: EARLIER };

  it("is a miss once the roll call stands, and not while it can be disputed", () => {
    expect(settleOutcome(facts, new Date(EARLIER.getTime() + 3_600_000), 24)).toBeNull();
    expect(settleOutcome(facts, new Date(EARLIER.getTime() + 25 * 3_600_000), 24)).toBe("missed");
    expect(settleOutcome({ ...facts, disputeOpen: true }, new Date(EARLIER.getTime() + 25 * 3_600_000), 24)).toBeNull();
  });

  it("splits a no-show's forfeit among whoever did the job, the odd penny to the first", () => {
    const month = settleMonth(["ann", "ben", "cal"], 2000, [{ userId: "cal", amount: 301, to: ["ann", "ben"] }], "2026-10");
    expect(month.received).toEqual({ ann: 151, ben: 150, cal: 0 });
  });
});

describe("the deal", () => {
  const garden: DealJohn = { johnId: "garden", points: 4, lastUserId: null, sharers: ["a", "b", "c", "d"], home: ["a", "b", "c"] };

  it("hands a John done together out as one place per person, never more than are home", () => {
    expect(togetherPlaces(garden, 1, "job")).toEqual([garden]);
    expect(togetherPlaces(garden, 2, "job").map((p) => [p.johnId, p.jobId])).toEqual([
      ["garden#1", "job"],
      ["garden#2", "job"],
    ]);
    expect(togetherPlaces(garden, 6, "job")).toHaveLength(3);
    expect(togetherPlaces(garden, 0, "job")).toHaveLength(3);
  });

  it("never deals anyone two places in one job, and gives them to whoever is furthest behind", () => {
    const places = togetherPlaces(garden, 2, "job");
    const members = ["a", "b", "c", "d"].map((userId, i) => ({ userId, balance: [-9, -1, -5, 0][i], share: 2 }));
    const out = fairSharesExplained(places, members, "w1");
    expect(out.map((o) => o.userId).sort()).toEqual(["a", "c"]);
  });
});

describe("the words", () => {
  it("says what a John done together adds up to", () => {
    expect(crewLine(1, 4, words)).toBeNull();
    expect(crewLine(3, 4, words)).toBe("4 pts each, so 12 pts in all");
    expect(crewLine(0, 2, words)).toBe("2 pts each, for everyone at home that day");
  });

  it("joins names as people say them", () => {
    expect(andNames([])).toBe("");
    expect(andNames(["Ben"])).toBe("Ben");
    expect(andNames(["Ben", "Cal"])).toBe("Ben and Cal");
    expect(andNames(["Ben", "Cal", "Dee"])).toBe("Ben, Cal and Dee");
  });

  it("finds a John's places on the board: its job's, or itself", () => {
    const items = [
      { id: "1", jobId: "j" },
      { id: "2", jobId: "j" },
      { id: "3", jobId: null },
    ];
    expect(jobPlaces(items[0], items).map((i) => i.id)).toEqual(["1", "2"]);
    expect(jobPlaces(items[2], items).map((i) => i.id)).toEqual(["3"]);
  });
});
