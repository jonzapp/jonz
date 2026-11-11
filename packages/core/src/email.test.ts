import { describe, expect, it } from "vitest";

import { accountDeletedEmail, noticeEmail, ownerMessageEmail, renderEmail, safeEmailUrl, EMAIL_ASSETS } from "./email";
import { wordsFor } from "./words-for";

describe("renderEmail", () => {
  it("escapes everything a person typed", () => {
    const email = renderEmail({
      subject: "Hi <b>",
      preheader: "x",
      headline: `<script>alert(1)</script>`,
      blocks: [{ type: "text", text: `Sam & "Jo"` }],
      why: "y",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Sam &amp; &quot;Jo&quot;");
  });

  it("refuses a link that isn't https", () => {
    expect(() => safeEmailUrl("javascript:alert(1)")).toThrow();
    expect(() => safeEmailUrl("http://jonz.app")).toThrow();
    expect(safeEmailUrl("https://jonz.app/house")).toBe("https://jonz.app/house");
    expect(safeEmailUrl("{{ .ConfirmationURL }}")).toBe("{{ .ConfirmationURL }}");
  });

  it("writes a plain-text copy with the button's address", () => {
    const email = renderEmail({
      subject: "s",
      preheader: "p",
      headline: "Check it's you",
      blocks: [{ type: "button", label: "Confirm", url: "https://jonz.app/c" }],
      why: "w",
    });
    expect(email.text).toContain("Check it's you");
    expect(email.text).toContain("Confirm: https://jonz.app/c");
    expect(email.html).toContain(`${EMAIL_ASSETS}/sign.png`);
  });
});

describe("noticeEmail", () => {
  const base = { title: "Jonz is slow right now.", body: "Nothing is lost.", name: "Priya Shah" };

  it("is a panel in the banner's kind, titled without the full stop", () => {
    const email = noticeEmail({ ...base, kind: "status" });
    expect(email.subject).toBe("Jonz is slow right now");
    expect(email.html).toContain("jz-panel-status");
    expect(email.html).toContain("notice-status.png");
    expect(email.html).toContain("hazard-tape.png");
    expect(email.html).toContain("Hi Priya,");
  });

  it("offers a way out of offers and news, never of a status", () => {
    const offer = noticeEmail({ ...base, kind: "offer", unsubscribeUrl: "https://jonz.app/settings" });
    expect(offer.html).toContain("Stop offers and news");
    const status = noticeEmail({ ...base, kind: "status", unsubscribeUrl: "https://jonz.app/settings" });
    expect(status.html).not.toContain("Stop offers and news");
  });

  it("gives news a light icon for dark mode", () => {
    expect(noticeEmail({ ...base, kind: "news" }).html).toContain("notice-news-dark.png");
  });
});

describe("accountDeletedEmail", () => {
  it("says when, and how to object", () => {
    const email = accountDeletedEmail({ name: null, deletedOn: "31 October 2026" });
    expect(email.subject).toBe("Your Jonz account is deleted");
    expect(email.html).toContain("We deleted your account on 31 October 2026.");
    expect(email.text).toContain("reply to this email today");
    expect(email.html).toContain("Hi,");
  });

  it("has no exclamation marks, as the brand asks", () => {
    const email = accountDeletedEmail({ name: "Sam", deletedOn: "1 November 2026" });
    expect(email.text).not.toContain("!");
  });
});

describe("an email in its reader's language", () => {
  const english = wordsFor("en", "housemates");
  const test = wordsFor("en-XA", "housemates");
  const message = { name: "Ava Lin", subject: "Bins day moved", body: "It's Tuesday now.", url: "https://jonz.app" };

  it("says Jonz's words in their language, down to the foot", () => {
    const email = ownerMessageEmail({ ...message, language: "en-XA" });
    expect(email.text).toContain(test("email.hi", { name: "Ava" }));
    expect(email.text).toContain(test("email.message.why"));
    expect(email.text).toContain(test("email.foot.tagline"));
    expect(email.text).not.toContain(english("email.foot.tagline"));
  });

  it("keeps what the owner wrote as they wrote it", () => {
    expect(ownerMessageEmail({ ...message, language: "en-XA" }).text).toContain("It's Tuesday now.");
  });

  it("is English when it's left out", () => {
    expect(ownerMessageEmail(message).text).toContain(english("email.foot.tagline"));
  });
});
