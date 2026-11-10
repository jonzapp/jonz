import { describe, expect, it } from "vitest";

import { PAGE_TITLE } from "./copy";
import { DEFAULT_RULES, houseKind } from "./domain";
import { familyHides, frontDoorWords, joinLine, kindParam, newHouseWords, roleCopy } from "./family";
import { afterSignIn, DOOR, houseDefaults, signInLine } from "./front-door";
import { CreateHouse } from "./schemas";
import { rulesRows } from "./setup";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("the kind of house", () => {
  it("reads a row's kind, and anything it doesn't know is housemates", () => {
    expect(houseKind("family")).toBe("family");
    expect(houseKind("housemates")).toBe("housemates");
    expect(houseKind(null)).toBe("housemates");
    expect(houseKind("commune")).toBe("housemates");
  });

  it("reads a kind from a link, and nothing else", () => {
    expect(kindParam("family")).toBe("family");
    expect(kindParam(["housemates", "family"])).toBe("housemates");
    expect(kindParam("Family")).toBeNull();
    expect(kindParam(undefined)).toBeNull();
  });

  it("is asked when a house starts, and is housemates when it isn't said", () => {
    const house = { name: "The Parks", timezone: "Europe/London", currency: "GBP", weekStarts: 1 };
    expect(CreateHouse.parse({ ...house, kind: "family" }).kind).toBe("family");
    expect(CreateHouse.parse(house).kind).toBeUndefined();
    expect(CreateHouse.safeParse({ ...house, kind: "commune" }).success).toBe(false);
  });
});

describe("the front door and Start a house, for a family", () => {
  it("has its own headline, sentences and Start", () => {
    expect(frontDoorWords("housemates", words).headline).toBe(words('door.front.headline'));
    const family = frontDoorWords("family", words);
    expect(family.headline).toBe("Jonz: chores that earn pocket money.");
    expect(family.points.map((p) => p.key)).toEqual(["list", "share", "stake"]);
    expect(family.start).toBe("Start a family");
  });

  it("sets up a family with its own heading and button", () => {
    expect(newHouseWords("family", words)).toEqual({
      title: PAGE_TITLE.newFamily,
      heading: "Start your family",
      intro: words('house.family.newIntro'),
      submit: "Start the family",
    });
    expect(newHouseWords("housemates", words).submit).toBe("Start the house");
  });

  it("carries a family's Start through sign-in, as it does a house's", () => {
    expect(afterSignIn(DOOR.startFamily)).toBe("/house/new?kind=family");
    expect(signInLine(DOOR.startFamily, words)).toBe(signInLine(DOOR.start, words));
    // Anything else on the way stays plain sign-in.
    expect(afterSignIn("/house/new?kind=commune")).toBeUndefined();
  });

  it("puts pocket money in place of the stake on a family's defaults line", () => {
    const base = { currency: "GBP", weekStarts: 1, timezone: "Europe/London", words } as const;
    expect(houseDefaults(base)[0]).toBe("GBP 20 a month each");
    expect(houseDefaults({ ...base, kind: "family" })).toEqual(["Pocket money up to GBP 10 a month each", ...houseDefaults(base).slice(1)]);
  });

  it("says a family on its join link", () => {
    expect(joinLine("family", 4, words)).toBe("4 people are in this family. Join and you’re dealt Johns from next week.");
    expect(joinLine("housemates", 4, words)).toBe(words('door.join.livesHere', { people: 4 }));
  });
});

describe("roleCopy", () => {
  it("calls an admin a parent and everyone else a kid in a family", () => {
    const family = roleCopy(wordsFor("en", "family"));
    expect(family.admins.addBody).toBe(words('house.adminsList.addBody'));
    expect(family.admins.title).toBe("Parents");
    expect(family.sub(true, false)).toBe("Parent");
    expect(family.sub(false, false)).toBe("Kid");
    expect(family.sub(false, true)).toBe("You, kid");
    expect(family.person).toMatchObject({ section: "Parent", makeAdmin: "Make a parent", makeMember: "Make a kid" });
    expect(family.youIn("The Parks", true)).toBe("The Parks, parent");
    expect(family.handOver("Alex")).toBe("Make Alex a parent and leave");
  });

  it("keeps the housemates' words as they were", () => {
    const house = roleCopy(wordsFor("en", "housemates"));
    expect(house.admins).toMatchObject({ addBody: "They can change the list and the rules, and fix anyone’s mistakes.", remove: "Remove", title: "Admins", add: "Add an admin" });
    expect(house.admins.make("Sam")).toBe("Make Sam admin");
    expect(house.sub(true, true)).toBe("You, admin");
    expect(house.sub(false, false)).toBe("Housemate");
    expect(house.person).toMatchObject({ section: "Admin", makeMember: "Make housemate", makeAdminMeta: words('people.person.makeAdminMeta') });
    expect(house.youIn("Elm Street", false)).toBe("Elm Street, housemate");
  });
});

describe("what a family hides", () => {
  it("is the Stake, and only in a family", () => {
    expect(familyHides("family").stake).toBe(true);
    expect(familyHides("housemates").stake).toBe(false);
  });

  it("leaves the money out of a family's rules", () => {
    const rules = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" as const, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 };
    const labels = rulesRows(rules, 100, words, "jonz", "family").map((r) => r.label);
    expect(labels).not.toContain(words('house.setup.stake'));
    expect(labels).not.toContain(words('house.setup.settleIn'));
    expect(labels).not.toContain(words('house.setup.late'));
    expect(rulesRows(rules, 100, words, "jonz").map((r) => r.label)).toEqual(expect.arrayContaining([words('house.setup.stake'), words('house.setup.settleIn')]));
  });
});

describe("a family's House setup", () => {
  it("says how Johns are shared on the Rules row, not the money", async () => {
    const { houseSetupValues } = await import("./house-lower");
    const rules = { currency: "USD" as const, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, dealMode: "smart" as const, dealBudget: 4 };
    const base = { rules, today: "2026-11-04", members: [], me: "sam", admin: true };
    expect(houseSetupValues({ ...base, kind: "family" }, words).rules).toBe("Smart, Usual, 4 points each");
    expect(houseSetupValues(base, words).rules).toContain("$0 late");
  });
});
