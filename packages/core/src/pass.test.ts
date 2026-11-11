import { describe, expect, it } from "vitest";

import { CURRENCIES } from "./domain";
import {
  hasPass,
  rulesAsStaked,
  PASS_ENFORCED,
  PASS_LOOKUP_KEYS,
  PASS_PURCHASES,
  passAfterSubscription,
  passFirstCharge,
  passFirstChargeNote,
  passFreeUntil,
  passPurchaseRefusal,
  purchaseOfLookupKey,
  purchaseOfPrice,
  subscriptionLive,
  type PassSubscription,
  PASS_PRICES,
  passDaysLeft,
  passLine,
  passOf,
  passOffers,
  passUnlocked,
  type HousePass,
} from "./pass";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const now = new Date("2026-11-10T12:00:00Z");
const at = (iso: string) => new Date(iso);
const pass = (plan: HousePass["plan"], until: string | null): HousePass => ({
  plan,
  until: until ? at(until) : null,
  buyerId: null,
});

describe("passOf", () => {
  it("reads a house row", () => {
    expect(passOf({ pass_plan: "yearly", pass_ends_at: "2027-11-10T12:00:00Z", pass_bought_by: "u1" })).toEqual({
      plan: "yearly",
      until: at("2027-11-10T12:00:00Z"),
      buyerId: "u1",
    });
  });

  it("gives a Founding house no end, whatever the row says", () => {
    expect(passOf({ pass_plan: "founding", pass_ends_at: "2026-01-01T00:00:00Z", pass_bought_by: null }).until).toBeNull();
  });

  it("reads an unknown plan, or a missing end, as ended, so it never unlocks by mistake", () => {
    const odd = passOf({ pass_plan: "platinum", pass_ends_at: null, pass_bought_by: null });
    expect(odd.plan).toBe("trial");
    expect(hasPass(odd, now)).toBe(false);
    expect(hasPass(passOf({ pass_plan: "monthly", pass_ends_at: null, pass_bought_by: null }), now)).toBe(false);
  });
});

describe("hasPass", () => {
  it("is always true for a Founding house", () => {
    expect(hasPass(pass("founding", null), now)).toBe(true);
  });

  it("is true until the moment it ends, and false from then", () => {
    expect(hasPass(pass("trial", "2026-11-10T12:00:01Z"), now)).toBe(true);
    expect(hasPass(pass("trial", "2026-11-10T12:00:00Z"), now)).toBe(false);
    expect(hasPass(pass("yearly", "2026-11-01T00:00:00Z"), now)).toBe(false);
  });
});

describe("passUnlocked", () => {
  const ended = pass("monthly", "2026-11-01T00:00:00Z");

  it("locks a house without the Pass: the Pass is on", () => {
    expect(PASS_ENFORCED).toBe(true);
    expect(passUnlocked(ended, now)).toBe(false);
  });

  it("unlocks every house when told it isn't enforced", () => {
    expect(passUnlocked(ended, now, false)).toBe(true);
  });

  it("follows the Pass once enforced", () => {
    expect(passUnlocked(ended, now, true)).toBe(false);
    expect(passUnlocked(pass("monthly", "2026-12-01T00:00:00Z"), now, true)).toBe(true);
    expect(passUnlocked(pass("founding", null), now, true)).toBe(true);
  });
});

describe("passDaysLeft", () => {
  it("counts a part day as a day", () => {
    expect(passDaysLeft(pass("trial", "2026-11-10T13:00:00Z"), now)).toBe(1);
    expect(passDaysLeft(pass("trial", "2026-11-22T12:00:00Z"), now)).toBe(12);
    expect(passDaysLeft(pass("trial", "2026-11-22T12:00:01Z"), now)).toBe(13);
  });

  it("is 0 once ended and null for Founding", () => {
    expect(passDaysLeft(pass("trial", "2026-11-10T12:00:00Z"), now)).toBe(0);
    expect(passDaysLeft(pass("trial", "2026-10-01T00:00:00Z"), now)).toBe(0);
    expect(passDaysLeft(pass("founding", null), now)).toBeNull();
  });
});

describe("passLine", () => {
  it("says each state in a few words", () => {
    expect(passLine(pass("founding", null), now, "Europe/London", words)).toBe("Founding house");
    expect(passLine(pass("trial", "2026-11-22T12:00:00Z"), now, "Europe/London", words)).toBe("Free month, 12 days left");
    expect(passLine(pass("trial", "2026-11-11T00:00:00Z"), now, "Europe/London", words)).toBe("Free month, 1 day left");
    expect(passLine(pass("trial", "2026-11-01T00:00:00Z"), now, "Europe/London", words)).toBe("Free month ended");
    expect(passLine(pass("yearly", "2027-11-12T12:00:00Z"), now, "Europe/London", words)).toBe("Yearly, renews 12 Nov");
    expect(passLine(pass("monthly", "2026-12-12T12:00:00Z"), now, "Europe/London", words)).toBe("Monthly, renews 12 Dec");
    expect(passLine(pass("monthly", "2026-11-02T12:00:00Z"), now, "Europe/London", words)).toBe("Ended 2 Nov");
  });

  it("names the day in the house's zone", () => {
    // 04:00 on the 13th in London is still the 12th in Vancouver.
    const late = pass("yearly", "2027-11-13T04:00:00Z");
    expect(passLine(late, now, "Europe/London", words)).toBe("Yearly, renews 13 Nov");
    expect(passLine(late, now, "America/Vancouver", words)).toBe("Yearly, renews 12 Nov");
  });
});

describe("passOffers", () => {
  it("puts Yearly first, with what it works out at a month", () => {
    const offers = passOffers("USD", words);
    expect(offers.map((o) => o.plan)).toEqual(["yearly", "monthly", "founding"]);
    expect(offers[0].price).toBe("$49.99 a year");
    expect(offers[0].meta).toBe("About $4.17 a month");
    expect(offers[1].price).toBe("$5.99 a month");
    expect(offers[2].price).toBe("$69 once");
  });

  it("has a whole-minor-unit price in every house currency, Yearly cheaper than twelve months, Founding dearer than a year", () => {
    for (const currency of CURRENCIES) {
      const p = PASS_PRICES[currency];
      for (const minor of [p.yearly, p.monthly, p.founding]) expect(Number.isInteger(minor) && minor > 0).toBe(true);
      expect(p.yearly).toBeLessThan(p.monthly * 12);
      expect(p.founding).toBeGreaterThan(p.yearly);
      expect(passOffers(currency, words)).toHaveLength(3);
    }
  });
});

describe("purchaseOfLookupKey", () => {
  it("names the plan for each Pass price, and nothing for any other", () => {
    for (const plan of PASS_PURCHASES) expect(purchaseOfLookupKey(PASS_LOOKUP_KEYS[plan])).toBe(plan);
    expect(purchaseOfLookupKey("pass_trial")).toBeNull();
    expect(purchaseOfLookupKey(null)).toBeNull();
  });
});

describe("purchaseOfPrice", () => {
  it("goes by lookup key, then by the metadata plan of a price whose key moved on", () => {
    expect(purchaseOfPrice({ lookup_key: "pass_yearly", metadata: {} })).toBe("yearly");
    expect(purchaseOfPrice({ lookup_key: null, metadata: { plan: "monthly" } })).toBe("monthly");
    expect(purchaseOfPrice({ lookup_key: null, metadata: { plan: "lifetime" } })).toBeNull();
    expect(purchaseOfPrice({ lookup_key: null })).toBeNull();
  });
});

describe("passFreeUntil", () => {
  it("is thirty days after the house was made", () => {
    expect(passFreeUntil(at("2026-11-01T09:00:00Z"))).toEqual(at("2026-12-01T09:00:00Z"));
  });
});

describe("passFirstCharge", () => {
  it("puts the first charge off to the end of the free month", () => {
    expect(passFirstCharge(pass("trial", "2026-11-22T12:00:00Z"), now)).toEqual(at("2026-11-22T12:00:00Z"));
  });

  it("charges at once with under two days left, after the free month, or on a paid plan", () => {
    expect(passFirstCharge(pass("trial", "2026-11-12T12:00:00Z"), now)).toBeNull();
    expect(passFirstCharge(pass("trial", "2026-11-01T00:00:00Z"), now)).toBeNull();
    expect(passFirstCharge(pass("monthly", "2026-11-22T12:00:00Z"), now)).toBeNull();
  });

  it("says when, in the house's zone", () => {
    expect(passFirstChargeNote(pass("trial", "2026-11-22T12:00:00Z"), now, "Europe/London", words)).toBe(
      "Nothing to pay until your free month ends on 22 Nov.",
    );
    expect(passFirstChargeNote(pass("trial", "2026-11-12T12:00:00Z"), now, "Europe/London", words)).toBeNull();
  });
});

describe("passPurchaseRefusal", () => {
  it("lets a house in or after its free month buy any plan", () => {
    for (const plan of PASS_PURCHASES) {
      expect(passPurchaseRefusal(pass("trial", "2026-11-22T12:00:00Z"), plan, now, words)).toBeNull();
      expect(passPurchaseRefusal(pass("trial", "2026-11-01T00:00:00Z"), plan, now, words)).toBeNull();
      expect(passPurchaseRefusal(pass("yearly", "2026-11-01T00:00:00Z"), plan, now, words)).toBeNull();
    }
  });

  it("sends a house on a paid plan to Manage, except for Founding", () => {
    const paid = pass("monthly", "2026-12-01T00:00:00Z");
    expect(passPurchaseRefusal(paid, "yearly", now, words)).toMatch(/Manage plan/);
    expect(passPurchaseRefusal(paid, "monthly", now, words)).toMatch(/Manage plan/);
    expect(passPurchaseRefusal(paid, "founding", now, words)).toBeNull();
  });

  it("has nothing to sell a Founding house", () => {
    expect(passPurchaseRefusal(pass("founding", null), "founding", now, words)).toMatch(/for life/);
  });
});

describe("passAfterSubscription", () => {
  const freeUntil = at("2026-11-22T12:00:00Z");
  const sub = (status: string, periodEnd: string, endedAt: string | null = null): PassSubscription => ({
    plan: "yearly",
    status,
    periodEnd: at(periodEnd),
    endedAt: endedAt ? at(endedAt) : null,
    buyerId: "u1",
  });

  it("runs a live subscription's Pass to the end of its period", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(subscriptionLive(status)).toBe(true);
      expect(passAfterSubscription(pass("trial", "2026-11-22T12:00:00Z"), sub(status, "2027-11-22T12:00:00Z"), freeUntil, now)).toEqual({
        plan: "yearly",
        until: at("2027-11-22T12:00:00Z"),
        buyerId: "u1",
      });
    }
  });

  it("stops the Pass when the subscription ends", () => {
    const ended = passAfterSubscription(
      pass("yearly", "2027-01-01T00:00:00Z"),
      sub("canceled", "2027-01-01T00:00:00Z", "2026-12-20T00:00:00Z"),
      at("2026-10-01T00:00:00Z"),
      at("2026-12-20T00:00:05Z"),
    );
    expect(ended).toEqual({ plan: "yearly", until: at("2026-12-20T00:00:00Z"), buyerId: "u1" });
    // Unpaid has no end of its own: it stops when the webhook hears.
    expect(passAfterSubscription(pass("yearly", "2027-01-01T00:00:00Z"), sub("unpaid", "2027-01-01T00:00:00Z"), at("2026-10-01T00:00:00Z"), now)!.until).toEqual(now);
  });

  it("gives back the rest of the free month to a plan stopped during it", () => {
    expect(
      passAfterSubscription(pass("yearly", "2026-11-22T12:00:00Z"), sub("canceled", "2026-11-22T12:00:00Z", "2026-11-10T12:00:00Z"), freeUntil, now),
    ).toEqual({ plan: "trial", until: freeUntil, buyerId: null });
  });

  it("waits while a first payment goes through, and never touches a Founding house", () => {
    expect(passAfterSubscription(pass("trial", "2026-11-22T12:00:00Z"), sub("incomplete", "2027-11-22T12:00:00Z"), freeUntil, now)).toBeNull();
    expect(passAfterSubscription(pass("trial", "2026-11-22T12:00:00Z"), sub("incomplete_expired", "2027-11-22T12:00:00Z"), freeUntil, now)).toBeNull();
    expect(passAfterSubscription(pass("founding", null), sub("active", "2027-11-22T12:00:00Z"), freeUntil, now)).toBeNull();
  });
});

describe("rulesAsStaked", () => {
  const rules = { stakeMinor: 2000, lateForfeitMinor: 100, missedForfeitMinor: 300, currency: "GBP" };

  it("keeps the rules with the Stake, and costs nothing without it", () => {
    expect(rulesAsStaked(rules, true)).toBe(rules);
    expect(rulesAsStaked(rules, false)).toEqual({ ...rules, stakeMinor: 0, lateForfeitMinor: 0, missedForfeitMinor: 0 });
  });
});
