import { describe, expect, it } from "vitest";

import { johnDef } from "./board";
import { humanError } from "./errors";
import { bornYearOk, checkKid, oldEnough, parseMinAge, switchChoices } from "./kids";
import { JohnDraft } from "./schemas";

/** Kids without a sign-in, family step 4 (docs/specs/family-houses.md). */

const PEOPLE = [
  { userId: "sam", name: "Sam Park", role: "admin", signsIn: true },
  { userId: "leo", name: "Leo Park", role: "member", signsIn: true },
  { userId: "maya", name: "Maya Park", role: "member", signsIn: false },
];

describe("adding a child", () => {
  it("wants a name and a year that makes them 18 or under", () => {
    expect(checkKid({ name: " Maya ", born: "2018" }, 2026)).toEqual({ kid: { name: "Maya", bornYear: 2018 } });
    expect(checkKid({ name: "", born: "2018" }, 2026).problems?.name).toBeTruthy();
    expect(checkKid({ name: "Maya", born: "18" }, 2026).problems?.born).toBeTruthy();
    expect(checkKid({ name: "Maya", born: "2000" }, 2026).problems?.born).toBeTruthy();
    expect(checkKid({ name: "Maya", born: "2027" }, 2026).problems?.born).toBeTruthy();
    expect(bornYearOk(2008, 2026)).toBe(true);
    expect(bornYearOk(2007, 2026)).toBe(false);
  });

  it("says why the database refused, in words", () => {
    expect(humanError({ message: "parents_add_kids" })).toBe("Only a parent in a family can add a child.");
  });
});

describe("Today's switcher", () => {
  it("is a parent's, with each kid who doesn't sign in", () => {
    expect(switchChoices(PEOPLE, "sam", true)).toEqual([
      { value: "sam", label: "You" },
      { value: "maya", label: "Maya" },
    ]);
  });

  it("isn't there for a kid, for housemates, or with nobody to switch to", () => {
    expect(switchChoices(PEOPLE, "leo", true)).toEqual([]);
    expect(switchChoices(PEOPLE, "sam", false)).toEqual([]);
    expect(switchChoices(PEOPLE.slice(0, 2), "sam", true)).toEqual([]);
  });
});

describe("a John's youngest age", () => {
  it("counts the age a kid turns that year", () => {
    expect(oldEnough(2016, 10, "2026-10-12")).toBe(true);
    expect(oldEnough(2017, 10, "2026-10-12")).toBe(false);
    // Anyone with no year born, and any John with no age.
    expect(oldEnough(null, 10, "2026-10-12")).toBe(true);
    expect(oldEnough(2020, null, "2026-10-12")).toBe(true);
  });

  it("is typed as a whole age, or left empty", () => {
    expect(parseMinAge("")).toBeNull();
    expect(parseMinAge(" 8 ")).toBe(8);
    expect(parseMinAge("1")).toBeUndefined();
    expect(parseMinAge("19")).toBeUndefined();
    expect(parseMinAge("ten")).toBeUndefined();
  });

  it("is kept with the John", () => {
    const row = { id: "j", name: "Use the oven", category: "kitchen", points: 3, every_weeks: 1, due_dow: 7, due_time: "18:00:00", needs_photo: false, group_id: null };
    expect(johnDef({ ...row, min_age: 10 }).minAge).toBe(10);
    expect(johnDef(row).minAge).toBeNull();
    const draft = { name: "Use the oven", category: "kitchen", points: 3, everyWeeks: 1, dueDow: 7, dueTime: "18:00", needsPhoto: false, groupId: null };
    expect(JohnDraft.parse({ ...draft, minAge: 10 }).minAge).toBe(10);
    expect(JohnDraft.safeParse({ ...draft, minAge: 30 }).success).toBe(false);
  });
});
