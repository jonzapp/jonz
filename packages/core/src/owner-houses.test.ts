import { describe, expect, it } from "vitest";

import {
  clockState,
  databaseState,
  houseAgo,
  houseLead,
  houseMeta,
  needRow,
  ownerFigures,
  overviewRange,
  passDetail,
  passLabel,
  percentOf,
  personMeta,
  type HouseDetail,
  type HouseRow,
  type Overview,
} from "./owner-houses";

const NOW = new Date("2026-10-30T16:40:00Z");
const minus = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

describe("houseAgo and percentOf", () => {
  it("says how long ago in words a person reads at a glance", () => {
    expect(houseAgo(minus(10_000), NOW)).toBe("just now");
    expect(houseAgo(minus(2 * MIN), NOW)).toBe("2 min ago");
    expect(houseAgo(minus(3 * 60 * MIN), NOW)).toBe("3 h ago");
    expect(houseAgo(minus(30 * 60 * MIN), NOW)).toBe("yesterday");
    expect(houseAgo(minus(4 * 24 * 60 * MIN), NOW)).toBe("4 days ago");
    expect(houseAgo("2026-09-12T10:00:00Z", NOW)).toBe("12 Sep");
  });

  it("gives a share as a whole percent, or nothing when nothing came due", () => {
    expect(percentOf(74, 100)).toBe("74%");
    expect(percentOf(2, 3)).toBe("67%");
    expect(percentOf(0, 0)).toBeNull();
  });
});

const row = (over: Partial<HouseRow> = {}): HouseRow => ({
  id: "h1",
  name: "Elm Street",
  joinCode: "K7P2QX",
  people: 5,
  passPlan: "yearly",
  passUntil: "2027-09-03T00:00:00Z",
  lastActive: minus(2 * MIN),
  onTime: 37,
  settled: 50,
  createdAt: "2026-09-12T10:00:00Z",
  sortAt: minus(2 * MIN),
  ...over,
});

describe("a house in the list", () => {
  it("names its Pass as it stands now", () => {
    expect(passLabel("yearly", "2027-09-03T00:00:00Z", NOW)).toBe("Pass");
    expect(passLabel("monthly", "2026-10-01T00:00:00Z", NOW)).toBe("None");
    expect(passLabel("trial", "2026-11-20T00:00:00Z", NOW)).toBe("Trial");
    expect(passLabel("trial", "2026-10-20T00:00:00Z", NOW)).toBe("None");
    expect(passLabel("founding", null, NOW)).toBe("Founding");
  });

  it("has one line under its name on a phone", () => {
    expect(houseMeta(row(), NOW)).toBe("5 people, Pass, active 2 min ago, 74% on time");
    expect(houseMeta(row({ people: 1, lastActive: null, settled: 0, passPlan: "founding", passUntil: null }), NOW)).toBe(
      "1 person, Founding, never",
    );
  });
});

const detail = (over: Partial<HouseDetail> = {}): HouseDetail => ({
  id: "h1",
  name: "Elm Street",
  joinCode: "K7P2QX",
  createdAt: "2026-09-03T10:00:00Z",
  firstDealtAt: "2026-09-04T10:00:00Z",
  timezone: "Europe/London",
  currency: "GBP",
  dealMode: "smart",
  passPlan: "yearly",
  passUntil: "2027-09-03T00:00:00Z",
  passBuyer: "Priya",
  billed: true,
  lastActive: minus(2 * MIN),
  johns: 9,
  people: [
    { id: "p", name: "Priya", role: "admin", joinedAt: "", movingOutOn: null, onTime: 6, settled: 7, awayUntil: null },
    { id: "a", name: "Ade", role: "admin", joinedAt: "", movingOutOn: null, onTime: 5, settled: 7, awayUntil: null },
    { id: "j", name: "Jo", role: "member", joinedAt: "", movingOutOn: "2026-12-03", onTime: 1, settled: 2, awayUntil: "2026-11-02" },
    { id: "m", name: "Mika", role: "member", joinedAt: "", movingOutOn: null, onTime: 0, settled: 0, awayUntil: null },
  ],
  ...over,
});

describe("one house", () => {
  it("leads with when it started and who its admins are", () => {
    expect(houseLead(detail())).toBe("Started 3 Sep, Priya and Ade are admins");
    expect(houseLead(detail({ people: [detail().people[0]] }))).toBe("Started 3 Sep, Priya is the admin");
  });

  it("gives each person their role, how they're doing, time away and moving out", () => {
    const [priya, , jo, mika] = detail().people;
    expect(personMeta(priya)).toBe("admin, 6 of 7 on time");
    expect(personMeta(jo)).toBe("away until 2 Nov, moving out 3 Dec");
    expect(personMeta(mika)).toBe("nothing due in four weeks");
  });

  it("says what the Pass is, who pays and when it renews or ends", () => {
    expect(passDetail(detail(), NOW)).toEqual({ title: "House Pass, yearly", meta: "Priya pays, renews 3 Sep 2027" });
    expect(passDetail(detail({ billed: false }), NOW).meta).toBe("Priya pays, ends 3 Sep 2027");
    expect(passDetail(detail({ passPlan: "trial", passUntil: "2026-11-20T00:00:00Z", passBuyer: null }), NOW)).toEqual({
      title: "The free month",
      meta: "Ends 20 Nov 2026",
    });
    expect(passDetail(detail({ passPlan: "monthly", passUntil: "2026-10-01T00:00:00Z" }), NOW)).toEqual({
      title: "No House Pass",
      meta: "Ended 1 Oct 2026",
    });
    expect(passDetail(detail({ passPlan: "founding", passUntil: null, passBuyer: null }), NOW)).toEqual({ title: "Founding Pass", meta: "For life" });
  });
});

const overview = (over: Partial<Overview> = {}): Overview => ({
  span: "week",
  from: "2026-11-02T00:00:00Z",
  houses: 128,
  housesNew: 12,
  housesNewBefore: 3,
  people: 412,
  inHouses: 410,
  active: 110,
  passes: { monthly: 10, yearly: 20, founding: 7, trial: 40 },
  onTime: { onTime: 900, late: 150, missed: 62 },
  ask: { turns: 1210, failed: 0 },
  weeks: [],
  clock: minus(4 * MIN),
  reports: 2,
  needs: [],
  ...over,
});

describe("the Overview", () => {
  it("gives six figures, each with what it means", () => {
    expect(ownerFigures(overview()).map((f) => [f.label, f.value, f.meta])).toEqual([
      ["Houses", "128", "12 new, up 9 on last week"],
      ["People", "412", "3.2 to a house"],
      ["Active houses", "86%", "110 of 128"],
      ["House Passes", "37", "20 yearly, 10 monthly, 7 Founding"],
      ["Johns on time", "81%", "212 late or missed"],
      ["Ask Jonz", "1,210", "every one answered"],
    ]);
    const quiet = ownerFigures(overview({ span: "month", houses: 0, housesNew: 0, housesNewBefore: 2, inHouses: 0, active: 0, onTime: { onTime: 0, late: 0, missed: 0 }, ask: { turns: 3, failed: 1 } }));
    expect(quiet.map((f) => f.meta)[0]).toBe("0 new, down 2 on last month");
    expect(quiet.map((f) => f.value)).toEqual(["0", "412", "0%", "37", "None due", "3"]);
    expect(quiet[5].meta).toBe("1 didn’t answer");
  });

  it("says the clock is late after half an hour without a tick, and the database slow past a second", () => {
    expect(clockState(minus(4 * MIN), NOW)).toEqual({ up: true, meta: "ticked 4 min ago" });
    expect(clockState(minus(45 * MIN), NOW).up).toBe(false);
    expect(clockState(null, NOW)).toEqual({ up: false, meta: "hasn’t ticked yet" });
    expect(databaseState(120)).toEqual({ up: true, meta: "this page read in 120 ms" });
    expect(databaseState(2400)).toEqual({ up: false, meta: "this page read in 2.4 s" });
  });

  it("turns what's waiting into rows that open their page", () => {
    expect(needRow({ kind: "report", id: "r1", name: "Sam", words: "Charged twice", house: "The Annexe", at: minus(120 * MIN) }, NOW)).toEqual({
      title: "Sam wrote in",
      meta: "Charged twice, The Annexe, 2 h ago",
      href: "/admin/inbox/r1",
    });
    expect(needRow({ kind: "deletion", id: "u1", name: "Leo", words: null, house: null, at: new Date(NOW.getTime() + 3 * 3_600_000).toISOString() }, NOW)).toEqual({
      title: "Leo’s account is deleted in 3 h",
      meta: "No house, unless they change their mind",
      href: "/admin/deletions",
    });
  });
});

describe("overviewRange", () => {
  it("names this week by its days and this month by its name, as the Track record does", () => {
    expect(overviewRange({ span: "week", from: "2026-11-02T00:00:00Z" }, "Europe/London")).toBe("2–8 Nov");
    expect(overviewRange({ span: "week", from: "2026-10-26T00:00:00Z" }, "Europe/London")).toBe("26 Oct–1 Nov");
    expect(overviewRange({ span: "month", from: "2026-11-01T00:00:00Z" }, "Europe/London")).toBe("November 2026");
  });
});
