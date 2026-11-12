import { describe, expect, it } from "vitest";

import { GOOGLE_LIMITED_USE, LEGAL, PRIVACY_POLICY, TERMS } from "./legal";
import { docText } from "./reply-format";

const words = (page: typeof PRIVACY_POLICY) =>
  [page.lead, ...page.sections.flatMap((s) => [s.heading, docText(s.body)])].join(" ");

describe("the Privacy Policy", () => {
  const text = words(PRIVACY_POLICY);

  it("carries Google's Limited Use sentence word for word", () => {
    expect(PRIVACY_POLICY.sections.some((s) => docText(s.body).split("\n").includes(GOOGLE_LIMITED_USE))).toBe(true);
    expect(GOOGLE_LIMITED_USE).toMatch(/Google API Services User Data Policy, including the Limited Use requirements\.$/);
  });

  it("names what each sign-in gives us, and every company that helps run Jonz", () => {
    for (const name of ["Google", "Microsoft", "Apple", "User.Read", "Supabase", "Vercel", "Anthropic", "Stripe", "Link", "Resend"]) {
      expect(text).toContain(name);
    }
  });

  it("says how to delete an account, and who to ask", () => {
    expect(PRIVACY_POLICY.sections.map((s) => s.heading)).toContain("Deleting your account");
    expect(text).toContain(LEGAL.email);
    expect(text).toContain(LEGAL.operator);
  });

  it("only links to https pages", () => {
    for (const page of [PRIVACY_POLICY, TERMS]) {
      for (const link of page.sections.flatMap((s) => s.links ?? [])) expect(link.href).toMatch(/^https:\/\//);
    }
  });
});

describe("the Terms of Service", () => {
  const text = words(TERMS);

  it("says how the House Pass renews, cancels and refunds, and who sells it", () => {
    for (const heading of ["The House Pass", "Refunds"]) expect(TERMS.sections.map((s) => s.heading)).toContain(heading);
    expect(text).toMatch(/renew automatically/);
    expect(text).toMatch(/Cancel any time/);
    expect(text).toMatch(/seller of record/);
    expect(text).toContain("$39.99 a year");
  });

  it("names the law and how to reach us", () => {
    expect(text).toContain(LEGAL.law);
    expect(text).toContain(LEGAL.email);
  });

  it("has Apple's terms for apps from the App Store", () => {
    expect(text).toMatch(/third party/);
  });
});

describe("the two addresses", () => {
  it("never move: the stores and sign-in providers link to them", () => {
    expect(`${LEGAL.site}${LEGAL.privacyPath}`).toBe("https://jonz.app/privacy");
    expect(`${LEGAL.site}${LEGAL.termsPath}`).toBe("https://jonz.app/terms");
  });
});
