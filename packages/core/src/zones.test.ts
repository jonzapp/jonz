import { describe, expect, it } from "vitest";

import { wordsFor } from "./words-for";
import { ZONE_COUNTRY } from "./zone-countries";
import { clocksDiffer, findZones, offsetLabel, utcOffset, zoneChoices, zoneCity, zoneClock, zoneCountry, zoneGap, zonePlace } from "./zones";

const words = wordsFor("en", "housemates");
const french = wordsFor("fr", "housemates");
// Winter and summer in London, at fixed moments: the house is on GMT, then BST.
const WINTER = new Date("2026-11-14T01:22:00Z");
const SUMMER = new Date("2026-07-01T12:00:00Z");

describe("zoneCity", () => {
  it("names the place a zone is named after", () => {
    expect(zoneCity("Europe/London")).toBe("London");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneCity("UTC")).toBe("UTC");
  });
});

describe("zoneCountry and zonePlace", () => {
  it("adds the country in the reader's language", () => {
    expect(zonePlace("America/Regina", words)).toBe("Regina, Canada");
    expect(zonePlace("Europe/London", words)).toBe("London, United Kingdom");
    expect(zoneCountry("Europe/London", french)).toBe("Royaume-Uni");
  });

  it("says the city alone where a zone has no country", () => {
    expect(zoneCountry("UTC", words)).toBeNull();
    expect(zonePlace("UTC", words)).toBe("UTC");
    expect(zonePlace("US/Central", words)).toBe("Central");
  });
});

describe("utcOffset and offsetLabel", () => {
  it("reads a zone's offset at the moment given, clock changes and all", () => {
    expect(utcOffset("Europe/London", WINTER)).toBe(0);
    expect(utcOffset("Europe/London", SUMMER)).toBe(60);
    expect(utcOffset("America/Regina", WINTER)).toBe(-360);
    expect(utcOffset("America/Regina", SUMMER)).toBe(-360);
    expect(utcOffset("Asia/Kolkata", WINTER)).toBe(330);
  });

  it("writes an offset as UTC and its hours, and minutes only when there are some", () => {
    expect(offsetLabel(-360)).toBe("UTC−6");
    expect(offsetLabel(330)).toBe("UTC+5:30");
    expect(offsetLabel(345)).toBe("UTC+5:45");
    expect(offsetLabel(-210)).toBe("UTC−3:30");
    expect(offsetLabel(0)).toBe("UTC+0");
  });

  it("says a zone's offset and its clock now", () => {
    expect(zoneClock("Europe/London", WINTER, words)).toBe("UTC+0, 01:22 there now");
    expect(zoneClock("America/Regina", WINTER, words)).toBe("UTC−6, 19:22 there now");
  });
});

describe("clocksDiffer", () => {
  it("is false for two zones whose clocks agree at that moment", () => {
    expect(clocksDiffer("Europe/London", "Europe/Dublin", WINTER)).toBe(false);
    expect(clocksDiffer("Europe/London", "Europe/London", SUMMER)).toBe(false);
  });

  it("is true when they don't, which can change with the season", () => {
    expect(clocksDiffer("Europe/London", "America/Regina", WINTER)).toBe(true);
    expect(clocksDiffer("Europe/London", "Africa/Abidjan", WINTER)).toBe(false);
    expect(clocksDiffer("Europe/London", "Africa/Abidjan", SUMMER)).toBe(true);
  });
});

describe("zoneGap", () => {
  it("says how far ahead or behind one clock is", () => {
    expect(zoneGap("Europe/London", "America/Regina", WINTER, words)).toBe("6 hours ahead");
    expect(zoneGap("America/Regina", "Europe/London", WINTER, words)).toBe("6 hours behind");
    expect(zoneGap("Europe/Paris", "Europe/London", WINTER, words)).toBe("1 hour ahead");
    expect(zoneGap("Asia/Kolkata", "Europe/London", WINTER, words)).toBe("5.5 hours ahead");
  });

  it("is said in the reader's language", () => {
    expect(zoneGap("Europe/London", "America/Regina", WINTER, french)).toBe("6 heures d’avance");
    expect(zoneGap("America/Regina", "Europe/London", WINTER, french)).toBe("6 heures de retard");
  });
});

describe("zoneChoices", () => {
  const known = ["US/Central", "Asia/Calcutta", "Europe/London", "America/Regina", "UTC", "Etc/GMT+5", "Asia/Kolkata"];

  it("keeps the database's zones that are a place, and UTC, A to Z by city", () => {
    expect(zoneChoices(known, WINTER, words).map((c) => c.zone)).toEqual(["Asia/Kolkata", "Europe/London", "America/Regina", "UTC"]);
  });

  it("keeps the house's own zone even when it's an old spelling", () => {
    expect(zoneChoices(known, WINTER, words, "Asia/Calcutta").map((c) => c.zone)).toContain("Asia/Calcutta");
  });

  it("gives each its city, country and offset at the moment given", () => {
    expect(zoneChoices(["America/Regina"], WINTER, words)).toEqual([{ zone: "America/Regina", city: "Regina", country: "Canada", offset: -360 }]);
  });

  it("is empty when the database knows none", () => {
    expect(zoneChoices([], WINTER, words)).toEqual([]);
  });
});

describe("findZones", () => {
  const choices = zoneChoices(Object.keys(ZONE_COUNTRY), WINTER, words);
  const found = (query: string) => findZones(choices, query).map((c) => c.zone);

  it("finds a city from the start of its name", () => {
    expect(found("reg")).toContain("America/Regina");
    expect(found("new y")).toEqual(["America/New_York"]);
  });

  it("finds every zone in a country, by its name or its code", () => {
    expect(found("canada")).toHaveLength(Object.values(ZONE_COUNTRY).filter((code) => code === "CA").length);
    expect(found("GB")).toEqual(["Europe/London"]);
  });

  it("ignores accents and capitals", () => {
    expect(found("SAO PAULO")).toEqual(["America/Sao_Paulo"]);
    expect(found("cote")).toEqual(["Africa/Abidjan"]);
  });

  it("gives everything for an empty search and nothing for a stranger one", () => {
    expect(findZones(choices, "  ")).toHaveLength(choices.length);
    expect(found("zzzz")).toEqual([]);
  });
});
