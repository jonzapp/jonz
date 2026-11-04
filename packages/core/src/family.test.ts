import { describe, expect, it } from "vitest";

import { ADMINS_COPY, FAMILY_COPY, FRONT_DOOR, JOIN_COPY, PAGE_TITLE, PARENTS_COPY, PERSON_COPY, SETUP_COPY } from "./copy";
import { DEFAULT_RULES, houseKind } from "./domain";
import { familyHides, frontDoorWords, joinLine, kindParam, newHouseWords, roleCopy } from "./family";
import { afterSignIn, DOOR, houseDefaults, signInLine } from "./front-door";
import { CreateHouse } from "./schemas";
import { rulesRows } from "./setup";

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
    expect(frontDoorWords("housemates").headline).toBe(FRONT_DOOR.headline);
    const family = frontDoorWords("family");
    expect(family.headline).toBe("Jonz: chores that earn pocket money.");
    expect(family.points.map((p) => p.key)).toEqual(["list", "share", "stake"]);
    expect(family.start).toBe("Start a family");
  });

  it("sets up a family with its own heading and button", () => {
    expect(newHouseWords("family")).toEqual({
      title: PAGE_TITLE.newFamily,
      heading: "Set up your family",
      intro: FAMILY_COPY.newIntro,
      submit: "Start the family",
    });
    expect(newHouseWords("housemates").submit).toBe("Start the house");
  });

  it("carries a family's Start through sign-in, as it does a house's", () => {
    expect(afterSignIn(DOOR.startFamily)).toBe("/house/new?kind=family");
    expect(signInLine(DOOR.startFamily)).toBe(signInLine(DOOR.start));
    // Anything else on the way stays plain sign-in.
    expect(afterSignIn("/house/new?kind=commune")).toBeUndefined();
  });

  it("leaves the stake off a family's defaults line", () => {
    const base = { currency: "GBP", weekStarts: 1, timezone: "Europe/London" } as const;
    expect(houseDefaults(base)[0]).toBe("GBP 20 a month each");
    expect(houseDefaults({ ...base, kind: "family" })).toEqual(houseDefaults(base).slice(1));
  });

  it("says a family on its join link", () => {
    expect(joinLine("family", 4)).toBe("4 people are in this family. Join and you’re handed Johns from next week.");
    expect(joinLine("housemates", 4)).toBe(JOIN_COPY.livesHere(4));
  });
});

describe("roleCopy", () => {
  it("calls an admin a parent and everyone else a kid in a family", () => {
    const family = roleCopy("family");
    expect(family.admins).toBe(PARENTS_COPY);
    expect(family.admins.title).toBe("Parents");
    expect(family.sub(true, false)).toBe("Parent");
    expect(family.sub(false, false)).toBe("Kid");
    expect(family.sub(false, true)).toBe("You, kid");
    expect(family.person).toMatchObject({ section: "Parent", makeAdmin: "Make a parent", makeMember: "Make a kid" });
    expect(family.youIn("The Parks", true)).toBe("The Parks, parent");
    expect(family.handOver("Alex")).toBe("Make Alex a parent and leave");
  });

  it("keeps the housemates' words as they were", () => {
    const house = roleCopy("housemates");
    expect(house.admins).toBe(ADMINS_COPY);
    expect(house.sub(true, true)).toBe(PERSON_COPY.sub(true, true));
    expect(house.person.makeMember).toBe(PERSON_COPY.makeHousemate);
  });
});

describe("what a family hides", () => {
  it("is the Stake, and only in a family", () => {
    expect(familyHides("family").stake).toBe(true);
    expect(familyHides("housemates").stake).toBe(false);
  });

  it("leaves the money out of a family's rules", () => {
    const rules = { ...DEFAULT_RULES, timezone: "Europe/London", currency: "GBP" as const, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 };
    const labels = rulesRows(rules, 100, "jonz", "family").map((r) => r.label);
    expect(labels).not.toContain(SETUP_COPY.stake);
    expect(labels).not.toContain(SETUP_COPY.settleIn);
    expect(labels).not.toContain(SETUP_COPY.late);
    expect(rulesRows(rules, 100, "jonz").map((r) => r.label)).toEqual(expect.arrayContaining([SETUP_COPY.stake, SETUP_COPY.settleIn]));
  });
});

describe("a family's House setup", () => {
  it("says how Johns are shared on the Rules row, not the money", async () => {
    const { houseSetupValues } = await import("./house-lower");
    const rules = { currency: "USD" as const, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0, dealMode: "smart" as const, dealBudget: 4 };
    const base = { rules, today: "2026-11-04", members: [], me: "sam", admin: true };
    expect(houseSetupValues({ ...base, kind: "family" }).rules).toBe("Smart, Usual, 4 points each");
    expect(houseSetupValues(base).rules).toContain("$0 late");
  });
});
