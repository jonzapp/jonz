import { describe, expect, it } from "vitest";

import { offerEmail } from "./email";
import { humanError } from "./errors";
import { passLine } from "./pass";
import {
  draftTerms,
  newPromotionCode,
  offerRefusal,
  parsePeople,
  promotionAmounts,
  promotionArgs,
  promotionGives,
  promotionLegend,
  promotionPrice,
  promotionPrices,
  promotionProblems,
  PromotionRequest,
  promotionSentence,
  promotionState,
  promotionTitle,
  type OfferFacts,
  type PromotionTerms,
} from "./promotions";

// A fixed clock: nothing here reads the real time.
const NOW = new Date("2026-11-20T12:00:00Z");
const LATER = new Date("2026-12-31T23:59:00Z");
const ZONE = "Europe/London";

const half: PromotionTerms = { kind: "percent", percentOff: 50, amountOff: null, duration: "once", months: null, plans: ["yearly", "monthly"], endsAt: LATER };

describe("what it gives, in words", () => {
  it("says half off, a percent, an amount, months free and a free Pass", () => {
    expect(promotionLegend(half)).toBe("Half off");
    expect(promotionLegend({ ...half, percentOff: 20 })).toBe("20% off");
    expect(promotionLegend({ ...half, kind: "amount", percentOff: null, amountOff: promotionAmounts(1000) }, "GBP")).toBe("£8 off");
    expect(promotionLegend({ ...half, kind: "trial", percentOff: null, duration: null, months: 3 })).toBe("3 months free");
    expect(promotionLegend({ ...half, kind: "gift", percentOff: null, duration: null, months: null, plans: [] })).toBe("Free Pass");
    expect(promotionLegend({ ...half, kind: "gift", percentOff: null, duration: null, months: 12, plans: [] })).toBe("A free year");
  });

  it("says how long, for the owner's list", () => {
    expect(promotionGives(half)).toBe("Half off, first payment");
    expect(promotionGives({ ...half, duration: "always", percentOff: 30 })).toBe("30% off, always");
    expect(promotionGives({ ...half, duration: "months", months: 3 })).toBe("Half off, 3 months");
    expect(promotionGives({ ...half, kind: "gift", percentOff: null, duration: null, plans: [] })).toBe("Free Pass, for good");
  });

  it("writes the headline and the sentence the people it's for read", () => {
    expect(promotionTitle(half)).toBe("Half off your House Pass");
    expect(promotionSentence(half, ZONE)).toBe("Half off the first payment, on Yearly or Monthly, for your whole house. Use it by 31 December.");
    expect(promotionSentence({ ...half, kind: "trial", percentOff: null, duration: null, months: 1, plans: ["yearly"], endsAt: null }, ZONE)).toBe(
      "1 month free before the first payment, on Yearly, for your whole house.",
    );
  });
});

describe("what each plan costs with it", () => {
  it("takes half off the first payment, then the usual price", () => {
    expect(promotionPrice(half, "yearly", "USD")).toMatchObject({ first: "$24.99 the first year", then: "then $49.99 a year", firstMinor: 2499 });
    expect(promotionPrice(half, "monthly", "USD")).toMatchObject({ first: "$2.99 the first month", then: "then $5.99 a month" });
    expect(promotionPrice(half, "founding", "USD")).toBeNull();
  });

  it("knows some months, every payment, Founding's one payment and months free", () => {
    expect(promotionPrice({ ...half, duration: "months", months: 3 }, "monthly", "USD")?.first).toBe("$2.99 a month for 3 months");
    expect(promotionPrice({ ...half, duration: "always" }, "yearly", "GBP")).toMatchObject({ first: "£19.99 a year", then: null });
    expect(promotionPrice({ ...half, plans: ["founding"] }, "founding", "USD")).toMatchObject({ first: "$34.50 once", then: null });
    expect(promotionPrice({ ...half, kind: "trial", percentOff: null, duration: null, months: 2 }, "yearly", "USD")).toMatchObject({ first: "Free for 2 months", firstMinor: 0 });
  });

  it("never takes off more than the price", () => {
    const big: PromotionTerms = { ...half, kind: "amount", percentOff: null, amountOff: promotionAmounts(10_000) };
    expect(promotionPrice(big, "monthly", "USD")?.firstMinor).toBe(0);
  });

  it("lists the plans in the Pass page's order, and none for a free Pass", () => {
    expect(promotionPrices({ ...half, plans: ["monthly", "yearly"] }, "USD").map((p) => p.plan)).toEqual(["yearly", "monthly"]);
    expect(promotionPrices({ ...half, kind: "gift", plans: [] }, "USD")).toEqual([]);
  });

  it("scales an amount off to each currency, to the whole unit", () => {
    expect(promotionAmounts(1000)).toEqual({ USD: 1000, CAD: 1300, GBP: 800, EUR: 1000 });
  });
});

describe("the owner's form", () => {
  const draft = PromotionRequest.parse({
    name: "Beta thanks",
    code: "thanks50",
    kind: "percent",
    percent: 50,
    duration: "once",
    plans: ["yearly", "monthly"],
    audience: "named",
    people: ["Sam.Okafor@gmail.com, priya.n@outlook.com", "sam.okafor@gmail.com"],
    endsAt: LATER.toISOString(),
  });

  it("takes the code in capitals and is happy with a whole draft", () => {
    expect(draft.code).toBe("THANKS50");
    expect(promotionProblems(draft, NOW)).toEqual({});
  });

  it("says what's missing, field by field", () => {
    const bad = { ...draft, percent: null, plans: [], people: ["not-an-email"], endsAt: "2026-11-01T00:00:00Z" };
    expect(promotionProblems(bad, NOW)).toEqual({
      gives: "Say how much off, from 1 to 100%.",
      plans: "Pick at least one plan.",
      people: "not-an-email isn’t an email.",
      endsAt: "Pick an end day after today.",
    });
    expect(promotionProblems({ ...draft, kind: "trial", months: null, plans: ["founding"] }, NOW)).toMatchObject({
      months: "Say how many months.",
      plans: "Months free work on Yearly and Monthly, not Founding.",
    });
  });

  it("sends the database only what its kind uses, each email once in lower case", () => {
    const args = promotionArgs({ ...draft, months: 4, maxUses: 10 });
    expect(args).toMatchObject({ p_percent: 50, p_amount: null, p_duration: "once", p_months: null, p_max_uses: null });
    expect(args.p_people).toEqual(["sam.okafor@gmail.com", "priya.n@outlook.com"]);
    const gift = promotionArgs({ ...draft, kind: "gift", months: null, audience: "anyone", maxUses: 5 });
    expect(gift).toMatchObject({ p_percent: null, p_duration: null, p_plans: [], p_people: [], p_max_uses: 5 });
    expect(draftTerms(draft).endsAt).toEqual(LATER);
  });

  it("reads pasted emails, and keeps the ones that aren't", () => {
    expect(parsePeople("a@b.co\n<C@D.org>; nope, a@b.co")).toEqual({ emails: ["a@b.co", "c@d.org"], bad: ["nope"] });
  });

  it("makes a code from the name", () => {
    expect(newPromotionCode("Beta thanks!", () => 0.42)).toBe("BETATHAN47");
    expect(newPromotionCode("¡", () => 0)).toBe("JONZ10");
  });
});

describe("using one", () => {
  const trial = { plan: "trial" as const, until: new Date("2026-12-01T00:00:00Z"), buyerId: null };
  const facts: OfferFacts = { state: "live", audience: "named", terms: half, maxUses: null, uses: 0, listed: true, personUsed: false, houseUsed: false };

  it("lets someone it names use it on a plan it's on", () => {
    expect(offerRefusal(facts, { pass: trial, plan: "yearly" }, NOW)).toBeNull();
  });

  it("refuses an unknown, ended, stopped or used-up offer", () => {
    expect(offerRefusal(null, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_unknown");
    expect(offerRefusal(facts, { pass: trial, plan: "yearly" }, new Date("2027-01-01T00:00:00Z"))).toBe("offer_ended");
    expect(offerRefusal({ ...facts, state: "stopped" }, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_ended");
    expect(offerRefusal({ ...facts, audience: "anyone", maxUses: 3, uses: 3 }, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_used_up");
  });

  it("is only for the emails it names, once each and once a house", () => {
    expect(offerRefusal({ ...facts, listed: false }, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_not_yours");
    expect(offerRefusal({ ...facts, audience: "anyone", listed: false }, { pass: trial, plan: "yearly" }, NOW)).toBeNull();
    expect(offerRefusal({ ...facts, personUsed: true }, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_used");
    expect(offerRefusal({ ...facts, houseUsed: true }, { pass: trial, plan: "yearly" }, NOW)).toBe("offer_used");
  });

  it("works only on its plans, and a free Pass only for a house without a paid one", () => {
    expect(offerRefusal(facts, { pass: trial, plan: "founding" }, NOW)).toBe("offer_plan");
    const gift = { ...facts, terms: { ...half, kind: "gift" as const, plans: [] } };
    expect(offerRefusal(gift, { pass: trial, plan: null }, NOW)).toBeNull();
    expect(offerRefusal(gift, { pass: { plan: "yearly", until: LATER, buyerId: "x" }, plan: null }, NOW)).toBe("offer_has_pass");
    expect(offerRefusal(gift, { pass: { plan: "founding", until: null, buyerId: null }, plan: null }, NOW)).toBe("offer_has_pass");
  });

  it("says how it stands, as the owner's list does", () => {
    expect(promotionState(facts, NOW)).toBe("live");
    expect(promotionState({ ...facts, maxUses: 1, uses: 1 }, NOW)).toBe("ended");
    expect(promotionState(facts, new Date("2027-01-02T00:00:00Z"))).toBe("ended");
    expect(promotionState({ ...facts, state: "making" }, NOW)).toBe("making");
  });

  it("has a sentence for every refusal", () => {
    for (const code of ["offer_unknown", "offer_ended", "offer_used_up", "offer_not_yours", "offer_used", "offer_plan", "offer_has_pass"]) {
      expect(humanError({ message: code })).not.toBe("Something went wrong. Try again.");
    }
  });

  it("calls a free month made longer free until its day", () => {
    expect(passLine({ plan: "trial", until: new Date("2027-02-20T12:00:00Z"), buyerId: null }, NOW, ZONE)).toBe("Free until 20 Feb");
    expect(passLine({ plan: "trial", until: new Date("2026-11-30T12:00:00Z"), buyerId: null }, NOW, ZONE)).toBe("Free month, 10 days left");
  });
});

describe("the email", () => {
  it("puts the offer in the amber panel, the prices in rows, and says which email it works for", () => {
    const m = offerEmail({ name: "Priya Nair", email: "priya.n@outlook.com", terms: half, note: "Thanks for helping test Jonz.", url: "https://jonz.app/offer/THANKS50", zone: ZONE });
    expect(m.subject).toBe("Half off your House Pass");
    expect(m.text).toContain("Hi Priya,");
    expect(m.text).toContain("Thanks for helping test Jonz.");
    expect(m.text).toContain("$24.99 the first year, then $49.99 a year");
    expect(m.text).toContain("It works when you sign in to Jonz as priya.n@outlook.com, until 31 December.");
    expect(m.html).toContain("jz-panel-offer");
    expect(m.html).toContain("https://jonz.app/offer/THANKS50");
  });
});
