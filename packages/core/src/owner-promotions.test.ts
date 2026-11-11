import { describe, expect, it } from "vitest";

import { ADMIN_GROUPS, ADMIN_PAGES } from "./owner-admin";
import {
  draftProblems,
  draftRequest,
  endOfDay,
  formatDay,
  personStage,
  PROMOTION_DRAFT,
  promotionEnds,
  promotionMeta,
  promotionPersonMeta,
  promotionUsed,
  promotionWho,
  promotionWhoSentence,
  toEmail,
  type PromotionRow,
} from "./owner-promotions";
import { draftTerms, promotionProblems, promotionSentence, type PromotionTerms } from "./promotions";

// A fixed clock: nothing here reads the real time.
const NOW = new Date("2026-11-20T12:00:00Z");
const ZONE = "Europe/London";

const half: PromotionTerms = { kind: "percent", percentOff: 50, amountOff: null, duration: "once", months: null, plans: ["yearly", "monthly"], endsAt: new Date("2026-12-31T23:59:00Z") };
const row: PromotionRow = { id: "p1", madeAt: "2026-11-01T00:00:00Z", code: "THANKS50", name: "Beta thanks", terms: half, audience: "named", people: 3, uses: 1, maxUses: null, state: "live" };

describe("the admin page", () => {
  it("is in the Send tab, after Notices", () => {
    expect(ADMIN_PAGES.find((p) => p.key === "promotions")?.path).toBe("/admin/promotions");
    expect(ADMIN_GROUPS.find((g) => g.key === "send")?.pages).toEqual(["messages", "notices", "promotions"]);
  });
});

describe("the form as typed", () => {
  it("makes half off for anyone, with only what its kind uses", () => {
    const req = draftRequest({ ...PROMOTION_DRAFT, name: " Launch ", code: "launch20", percent: "20%", maxUses: "200" });
    expect(req).toMatchObject({ name: "Launch", code: "LAUNCH20", kind: "percent", percent: 20, amount: null, duration: "once", months: null, maxUses: 200, people: [] });
    expect(promotionProblems(req, NOW)).toEqual({});
  });

  it("reads dollars as cents, and months only when it lasts some months", () => {
    const req = draftRequest({ ...PROMOTION_DRAFT, name: "Ten", code: "TENOFF", kind: "amount", amount: "$9.50", duration: "months", months: "6" });
    expect(req).toMatchObject({ amount: 950, percent: null, duration: "months", months: 6 });
  });

  it("drops Founding from any plan list, and plans and how long from a free Pass", () => {
    expect(draftRequest({ ...PROMOTION_DRAFT, kind: "trial", plans: ["yearly", "founding"] }).plans).toEqual(["yearly"]);
    const gift = draftRequest({ ...PROMOTION_DRAFT, kind: "gift", gift: "forever" });
    expect(gift).toMatchObject({ plans: [], duration: null, months: null });
    expect(draftRequest({ ...PROMOTION_DRAFT, kind: "gift", gift: "months", months: "12" }).months).toBe(12);
  });

  it("keeps the emails that aren't, so the check names them, and no limit for named people", () => {
    const req = draftRequest({ ...PROMOTION_DRAFT, name: "Beta", code: "BETA10", audience: "named", people: "Sam@Example.com\nnot-an-email, priya@example.com", maxUses: "5" });
    expect(req.people).toEqual(["sam@example.com", "priya@example.com", "not-an-email"]);
    expect(req.maxUses).toBeNull();
    expect(promotionProblems(req, NOW).people).toBe("not-an-email isn’t an email.");
  });

  it("ends at the end of the day typed, and says when a day or a number can't be read", () => {
    const end = endOfDay("2026-12-31")!;
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 11, 31, 23, 59]);
    expect(formatDay(end)).toBe("2026-12-31");
    expect(endOfDay("2026-02-30")).toBeNull();
    expect(draftRequest({ ...PROMOTION_DRAFT, ends: "day", endsOn: "2026-12-31" }).endsAt).toBe(end.toISOString());
    expect(draftProblems({ ...PROMOTION_DRAFT, ends: "day", endsOn: "soon" }).endsAt).toBe("Type the day as 2026-12-31.");
    expect(draftProblems({ ...PROMOTION_DRAFT, maxUses: "lots" }).maxUses).toBeDefined();
    expect(draftProblems({ ...PROMOTION_DRAFT, percent: "150" }).gives).toBeDefined();
    expect(draftProblems(PROMOTION_DRAFT)).toEqual({});
  });

  it("previews the sentence the people it's for read", () => {
    const terms = draftTerms(draftRequest({ ...PROMOTION_DRAFT, name: "Beta", code: "BETA10" }));
    expect(promotionSentence(terms, ZONE)).toBe("Half off the first payment, on Yearly or Monthly, for your whole house.");
  });
});

describe("a promotion in the owner's lists", () => {
  it("says who, how many used it and when it ends", () => {
    expect(promotionWho(row)).toBe("3 people");
    expect(promotionWho({ audience: "anyone", people: 0 })).toBe("Anyone");
    expect(promotionUsed(row)).toBe("1 of 3");
    expect(promotionUsed({ ...row, audience: "anyone", maxUses: 200, uses: 41 })).toBe("41 of 200");
    expect(promotionUsed({ ...row, audience: "anyone", maxUses: null, uses: 12 })).toBe("12");
    expect(promotionEnds(row, ZONE)).toBe("31 Dec");
    expect(promotionEnds({ ...row, terms: { ...half, endsAt: null } }, ZONE)).toBe("Never");
    expect(promotionEnds({ ...row, state: "stopped" }, ZONE)).toBe("Stopped");
    expect(promotionEnds({ ...row, state: "making" }, ZONE)).toBe("Not ready");
    expect(promotionMeta(row)).toBe("Half off, first payment, 3 people, 1 of 3 used");
  });

  it("says who can use it in a sentence", () => {
    expect(promotionWhoSentence("anyone", [], null, null, ZONE)).toBe("Anyone with the link, once a house.");
    expect(promotionWhoSentence("anyone", [], 200, half.endsAt, ZONE)).toBe("The first 200 houses with the link, once a house, until 31 December.");
    expect(promotionWhoSentence("named", ["a@x.com", "b@x.com"], null, null, ZONE)).toBe(
      "Only a@x.com and b@x.com, once each. Someone signed in with another email sees that it isn’t for them.",
    );
    expect(promotionWhoSentence("named", ["a@x.com", "b@x.com", "c@x.com", "d@x.com"], null, null, ZONE)).toContain("Only these 4 people");
  });

  it("says where each named person is, and who Email them would reach", () => {
    const base = { email: "a@x.com", name: null, openedAt: null, emailedAt: null, usedAt: null };
    const people = [
      { ...base, usedAt: "2026-11-04T10:00:00Z", emailedAt: "2026-11-02T10:00:00Z", name: "Sam" },
      { ...base, openedAt: "2026-11-06T10:00:00Z" },
      { ...base, emailedAt: "2026-11-05T10:00:00Z" },
      base,
    ];
    expect(people.map(personStage)).toEqual(["used", "opened", "emailed", "waiting"]);
    expect(promotionPersonMeta(people[0], ZONE)).toBe("Sam, used it 4 Nov");
    expect(promotionPersonMeta(people[1], ZONE)).toBe("Opened the link 6 Nov, not used");
    expect(toEmail(people)).toBe(2);
  });
});
