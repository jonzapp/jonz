import { describe, expect, it } from "vitest";

import { buildWeekBoard, type AssignmentRow } from "./board";
import { POCKET_COPY } from "./copy";
import { DEFAULT_RULES } from "./domain";
import { payRows, pocketCard, pocketHistory, pocketMoney, pocketRules, pocketView } from "./pocket";
import { checkRules, rulesDraft, rulesRows } from "./setup";
import { nextUpMeta } from "./today";
import { describeEvent, type WallEvent } from "./wall";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

/** Pocket money and Pay day, family step 3 (docs/specs/family-houses.md). */

const HOUR = 3_600_000;
// Wednesday 14 Oct 2026, noon in London.
const now = new Date("2026-10-14T11:00:00Z");
const RULES = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" as const, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, disputeHours: 0 };
const PEOPLE = [
  { userId: "sam", name: "Sam Park", role: "admin" },
  { userId: "leo", name: "Leo Park", role: "member" },
  { userId: "maya", name: "Maya Park", role: "member" },
];
const KIDS = ["leo", "maya"];
const WEEK = { id: "w1", starts_on: "2026-10-12", starts_at: "2026-10-11T23:00:00Z", ends_at: "2026-10-18T23:00:00Z" };

function row(id: string, overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id,
    user_id: "leo",
    name: id,
    category: "other",
    points: 2,
    needs_photo: false,
    due_at: new Date(now.getTime() + 9 * HOUR).toISOString(),
    original_due_at: null,
    group_name: null,
    done_at: null,
    photo_path: null,
    outcome: null,
    excused: false,
    covered_by: null,
    week_id: "w1",
    pay_minor: 50,
    ...overrides,
  };
}

function board(rows: AssignmentRow[], earners?: string[]) {
  return buildWeekBoard({
    week: WEEK,
    assignments: rows,
    disputes: [],
    memberIds: PEOPLE.map((p) => p.userId),
    userId: "leo",
    everDealt: true,
    disputeHours: 0,
    now,
    ...(earners ? { earners } : {}),
  });
}

describe("what a John earns", () => {
  it("says pence and cents the way a kid would", () => {
    expect(pocketMoney(50, "GBP")).toBe("50p");
    expect(pocketMoney(50, "USD")).toBe("50¢");
    expect(pocketMoney(50, "EUR")).toBe("€0.50");
    expect(pocketMoney(100, "GBP")).toBe("£1");
    expect(pocketMoney(650, "GBP")).toBe("£6.50");
    expect(pocketMoney(0, "GBP")).toBe("£0");
  });

  it("is a kid's to earn, never a parent's or a housemate's", () => {
    const rows = [row("kid"), row("parent", { user_id: "sam" }), row("covered", { user_id: "sam", covered_by: "maya" })];
    const family = board(rows, KIDS);
    expect(family.items.map((i) => [i.id, i.payMinor])).toEqual([
      ["kid", 50],
      ["parent", undefined],
      ["covered", 50],
    ]);
    expect(board(rows).items.every((i) => i.payMinor === undefined)).toBe(true);
  });

  it("is said in Next up's meta where a housemate's cost would be", () => {
    const [item] = board([row("Feed the cat")], KIDS).items;
    expect(nextUpMeta(item, RULES, now, words).due).toBe("due today 21:00, earns 50p");
    const [mate] = board([row("Bins")]).items;
    expect(nextUpMeta(mate, RULES, now, words).due).toBe("due today 21:00");
  });
});

describe("the month's pocket money", () => {
  const earnings = [
    { user_id: "maya", month: "2026-09", amount_minor: 650 },
    { user_id: "leo", month: "2026-09", amount_minor: 500 },
    { user_id: "maya", month: "2026-10", amount_minor: 450 },
    { user_id: "leo", month: "2026-10", amount_minor: 270 },
  ];
  const paid = { user_id: "leo", month: "2026-09", amount_minor: 500, paid_by: "sam", created_at: "2026-10-01T08:00:00Z" };

  it("adds up this month so far, and what's still to pay, oldest first", () => {
    const view = pocketView({ earnings, pays: [], kids: KIDS, month: "2026-10" });
    expect(view.soFar).toBe(720);
    expect(view.earned).toEqual({ leo: 270, maya: 450 });
    expect(view.owed).toEqual([
      { userId: "leo", month: "2026-09", amount: 500 },
      { userId: "maya", month: "2026-09", amount: 650 },
    ]);
    expect(pocketCard(view, "GBP")).toEqual({
      label: "October so far",
      title: "£7.20 earned so far",
      payDay: "Pay day is 1 Nov",
    });
  });

  it("drops a month once it's paid", () => {
    const view = pocketView({ earnings, pays: [paid], kids: KIDS, month: "2026-10" });
    expect(view.owed).toEqual([{ userId: "maya", month: "2026-09", amount: 650 }]);
  });

  it("gives a parent Paid for each kid, the first amber, and a kid only their own", () => {
    const view = pocketView({ earnings, pays: [], kids: KIDS, month: "2026-10" });
    const parent = payRows({ owed: view.owed, members: PEOPLE, me: "sam", parent: true, currency: "GBP" });
    expect(parent.map((r) => [r.title, r.action, r.primary])).toEqual([
      ["Pay Leo £5 for September", "Paid Leo £5", true],
      ["Pay Maya £6.50 for September", "Paid Maya £6.50", false],
    ]);
    const kid = payRows({ owed: view.owed, members: PEOPLE, me: "maya", parent: false, currency: "GBP" });
    expect(kid.map((r) => [r.title, r.action])).toEqual([["£6.50 for September on its way", null]]);
  });

  it("keeps a history, newest month first", () => {
    const view = pocketView({ earnings, pays: [paid], kids: KIDS, month: "2026-10" });
    const months = pocketHistory({ view, members: PEOPLE, currency: "GBP", zone: "Europe/London" });
    expect(months.map((m) => m.label)).toEqual(["October 2026", "September 2026"]);
    expect(months[0].lines.map((l) => [l.name, l.value, l.meta])).toEqual([
      ["Leo", "£2.70", "So far"],
      ["Maya", "£4.50", "So far"],
    ]);
    expect(months[1].lines.map((l) => [l.name, l.value, l.meta])).toEqual([
      ["Leo", "£5", "Paid by Sam, 1 Oct"],
      ["Maya", "£6.50", "£6.50 still to pay"],
    ]);
  });

  it("says Paid on the Wall", () => {
    const e = { id: "e", kind: "pocket_paid", userId: "sam", data: { to: "maya", amount: 650, month: "2026-09" } } as unknown as WallEvent;
    const line = describeEvent(e, (id) => (id === "sam" ? "Sam" : "Maya"), "GBP");
    expect(line.parts.map((p) => p.text).join("")).toBe("Sam paid Maya £6.50 for September.");
  });
});

describe("a family's rules", () => {
  it("say the cap in place of the stake", () => {
    const rows = rulesRows(RULES, 100, "jonz", "family", 1000);
    expect(rows.find((r) => r.label === POCKET_COPY.rulesLabel)?.value).toBe("Up to £10 a month each");
    expect(pocketRules(1000, "GBP")[0].body).toContain("up to £10 a month");
  });

  it("let a parent change the cap, as money", () => {
    const start = rulesDraft("The Parks", RULES, 100, "jonz", 1000);
    expect(start.pocket).toBe("10");
    expect(checkRules({ ...start, pocket: "12.50" }).settings?.pocketCapMinor).toBe(1250);
    expect(checkRules({ ...start, pocket: "lots" }).problems?.pocket).toBeTruthy();
    // A housemates' form has no such field, and leaves it alone.
    expect(checkRules(rulesDraft("Flat", RULES, 100)).settings?.pocketCapMinor).toBeUndefined();
  });
});
