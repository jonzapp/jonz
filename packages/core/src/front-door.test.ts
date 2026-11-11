import { describe, expect, it } from "vitest";

import { signInPath, signInReason } from "./auth-paths";
import { CURRENCIES } from "./domain";
import {
  afterSignIn,
  CURRENCY_CHOICES,
  dayChoices,
  DOOR,
  googleReturn,
  signedOutTo,
  houseDefaults,
  inviteCode,
  signInLine,
  timeZoneName,
} from "./front-door";
import { DOOR_POINTS } from "./family";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("afterSignIn", () => {
  it("leads to where the front door's choice or a join link said", () => {
    expect(afterSignIn(DOOR.start)).toBe("/house/new");
    expect(afterSignIn(DOOR.invite)).toBe("/welcome");
    expect(afterSignIn("/join/AB3DEF7H")).toBe("/join/AB3DEF7H");
    // A bad code is the join page's to say, so the link keeps it.
    expect(afterSignIn("/join/nope")).toBe("/join/nope");
    // jonz.app/delete, for anyone, house or not.
    expect(afterSignIn("/delete")).toBe("/delete");
    expect(googleReturn("/delete")).toBe("/signin?next=%2Fdelete");
  });

  it("survives the trip through /signin?next=", () => {
    const next = new URL(signInPath(DOOR.start), "https://johns.glyn.dev").searchParams.get("next");
    expect(afterSignIn(next)).toBe("/house/new");
  });

  it("leaves everything else to the root layout, so nothing goes round in circles", () => {
    const nowhere = [null, undefined, "", "/", "/signin", "/signin?next=%2Fwelcome", "/today", "/house/stake"];
    const offSite = ["//evil.example", "/\\evil", "https://evil.example", "//evil.example/house/new"];
    const near = ["/house/new/x", "/welcome?x=1", "/join/", "/join/AB3DEF7H/more", "/join/AB3DEF7H?x=1", "/delete/x", "/delete?x=1"];
    for (const next of [...nowhere, ...offSite, ...near]) expect(afterSignIn(next)).toBeUndefined();
  });
});

describe("signedOutTo", () => {
  it("carries a link to starting a house or the invite through sign-in", () => {
    expect(signedOutTo("/house/new")).toBe("/signin?next=%2Fhouse%2Fnew");
    expect(signedOutTo("/welcome")).toBe("/signin?next=%2Fwelcome");
  });

  it("sends anything else to plain sign-in", () => {
    for (const path of ["/", "/today", "/house/stake", "/signin", "//evil.example", ""]) expect(signedOutTo(path)).toBe("/signin");
  });
});

describe("googleReturn", () => {
  it("brings the web back to sign-in, carrying the front door's choice", () => {
    expect(googleReturn(DOOR.start)).toBe("/signin?next=%2Fhouse%2Fnew");
    expect(googleReturn(DOOR.invite)).toBe("/signin?next=%2Fwelcome");
  });

  it("brings a join link back to itself, which anyone can open", () => {
    expect(googleReturn("/join/AB3DEF7H")).toBe("/join/AB3DEF7H");
  });

  it("brings anything else back to plain sign-in", () => {
    for (const next of [null, undefined, "", "/", "/today", "//evil.example", "https://evil.example", "/signin"]) {
      expect(googleReturn(next)).toBe("/signin");
    }
  });
});

describe("signInLine", () => {
  it("names the front door's choice", () => {
    expect(signInLine("/house/new", words)).toBe(words('door.welcome.startReason'));
    expect(signInLine("/welcome", words)).toBe(words('door.welcome.inviteReason'));
  });

  it("says what anything else is shut on, as the web does", () => {
    expect(signInLine("/join/AB3DEF7H", words)).toBe(signInReason("/join/AB3DEF7H"));
    expect(signInLine(null, words)).toBe(signInReason(null));
    expect(signInLine("//evil.example/house/new", words)).toBe(signInReason(null));
  });

  it("warns, wherever it leads, that with Apple the house stays with the account chosen", () => {
    for (const next of [null, "/house/new", "/welcome", "/join/AB3DEF7H"]) {
      expect(signInLine(next, words, true)).toBe(words('door.signIn.eitherAccount'));
    }
  });
});

describe("inviteCode", () => {
  it("reads the code alone, however it's spelt", () => {
    expect(inviteCode("AB3DEF7H")).toBe("AB3DEF7H");
    expect(inviteCode("ab3d-ef7h")).toBe("AB3DEF7H");
    expect(inviteCode("  AB3D EF7H \n")).toBe("AB3DEF7H");
  });

  it("reads it out of a whole link, on the web or the phone", () => {
    expect(inviteCode("https://johns.glyn.dev/join/AB3DEF7H")).toBe("AB3DEF7H");
    expect(inviteCode("https://jonz.app/join/AB3DEF7H")).toBe("AB3DEF7H");
    expect(inviteCode("jonz://join/ab3def7h")).toBe("AB3DEF7H");
    // Links shared before the move to jonz.app still work.
    expect(inviteCode("johns://join/ab3def7h")).toBe("AB3DEF7H");
    expect(inviteCode("johns.glyn.dev/join/AB3D-EF7H/")).toBe("AB3DEF7H");
    expect(inviteCode("https://johns.glyn.dev/JOIN/AB3DEF7H?from=chat#top")).toBe("AB3DEF7H");
  });

  it("finds the link in the message it was shared in", () => {
    expect(inviteCode("Join 29 Albert Road on Jonz: https://jonz.app/join/AB3DEF7H")).toBe("AB3DEF7H");
  });

  it("leaves off the punctuation a chat puts round it", () => {
    const link = "https://johns.glyn.dev/join/AB3DEF7H";
    for (const pasted of [`${link}.`, `(${link})`, `<${link}>`, `Join here: ${link}!`, `“${link}”`, `${link}, see you there`]) {
      expect(inviteCode(pasted)).toBe("AB3DEF7H");
    }
    for (const pasted of ["AB3DEF7H.", "(AB3D-EF7H)", "“ab3def7h”", "AB3DEF7H!"]) {
      expect(inviteCode(pasted)).toBe("AB3DEF7H");
    }
  });

  it("is null for nothing, or anything that can't be a code", () => {
    for (const input of ["", "   ", "nope", "...", "AB3DEF7", "AB3DEF7HJ", "AB0DEF1H", "https://johns.glyn.dev/today"]) {
      expect(inviteCode(input)).toBeNull();
    }
  });

  it("doesn't fall back to the rest of the text when a link's code is bad", () => {
    expect(inviteCode("https://johns.glyn.dev/join/NOPE")).toBeNull();
    expect(inviteCode("https://johns.glyn.dev/join/")).toBeNull();
    expect(inviteCode("https://johns.glyn.dev/join/.")).toBeNull();
  });
});

describe("timeZoneName", () => {
  it("swaps underscores for spaces", () => {
    expect(timeZoneName("America/New_York")).toBe("America/New York");
    expect(timeZoneName("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos Aires");
    expect(timeZoneName("Europe/London")).toBe("Europe/London");
    expect(timeZoneName("")).toBe("");
  });
});

describe("houseDefaults", () => {
  it("says the stake, the week and the zone, in that order", () => {
    expect(houseDefaults({ currency: "GBP", weekStarts: 1, timezone: "Europe/London", words })).toEqual([
      "GBP 20 a month each",
      "weeks start Monday",
      "Europe/London",
    ]);
  });

  it("follows the currency, the day and the zone as they change", () => {
    expect(houseDefaults({ currency: "CAD", weekStarts: 7, timezone: "America/St_Johns", words })).toEqual([
      "CAD 20 a month each",
      "weeks start Sunday",
      "America/St Johns",
    ]);
  });

  it("shows pence only when there are some, and a stake of nothing as 0", () => {
    expect(houseDefaults({ currency: "EUR", weekStarts: 3, timezone: "Europe/Dublin", stakeMinor: 2050, words })[0]).toBe(
      "EUR 20.50 a month each",
    );
    expect(houseDefaults({ currency: "USD", weekStarts: 1, timezone: "UTC", stakeMinor: 0, words })[0]).toBe("USD 0 a month each");
    expect(houseDefaults({ currency: "USD", weekStarts: 1, timezone: "UTC", stakeMinor: 5, words })[0]).toBe("USD 0.05 a month each");
  });
});

describe("the choices behind Change", () => {
  it("offers every currency by its code, as the line says it", () => {
    expect(CURRENCY_CHOICES.map((c) => c.value)).toEqual([...CURRENCIES]);
    for (const choice of CURRENCY_CHOICES) expect(choice.label).toBe(choice.value);
  });

  it("offers the seven days from Monday, three letters to see and the whole day to hear", () => {
    const days = dayChoices(words);
    expect(days.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days[6].spoken).toBe("Sunday");
  });
});

describe("the front door's words", () => {
  it("names the phone's time zone in the note under Change", () => {
    expect(words('door.welcome.zoneNote', { zone: "America/New York" })).toBe(
      "The time zone is this phone’s, America/New York. Change it later from House.",
    );
  });

  it("says the front door in three sentences", () => {
    expect(DOOR_POINTS).toHaveLength(3);
    for (const key of DOOR_POINTS) expect(words(`door.welcome.points.${key}`)).toMatch(/\.$/);
  });
});
