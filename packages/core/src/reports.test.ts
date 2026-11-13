import { describe, expect, it } from "vitest";

import { reportReplyEmail } from "./email";
import { pushFor, type NotificationPrefs } from "./notify";
import { REPORT_FACETS, REPORT_LIMITS, REPORT_PUSH, ReportRequest, reportAge, reportGist } from "./reports";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("a report as the app sends it", () => {
  const ok = { kind: "problem", words: "Bins vanished", details: { pages: "Today, then House" }, shots: [] };

  it("takes a kind, up to 2,000 letters, the details and up to three screenshots", () => {
    expect(ReportRequest.parse(ok)).toEqual(ok);
    expect(ReportRequest.parse({ ...ok, words: "  Bins  " }).words).toBe("Bins");
    expect(ReportRequest.safeParse({ ...ok, kind: "complaint" }).success).toBe(false);
    expect(ReportRequest.safeParse({ ...ok, words: " " }).success).toBe(false);
    expect(ReportRequest.safeParse({ ...ok, words: "x".repeat(REPORT_LIMITS.words + 1) }).success).toBe(false);
    expect(ReportRequest.safeParse({ ...ok, shots: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(ReportRequest.safeParse({ ...ok, details: { pages: "x".repeat(301) } }).success).toBe(false);
    expect(ReportRequest.safeParse({ ...ok, details: null }).success).toBe(true);
  });

  it("is shown by its first line, cut short with an ellipsis", () => {
    expect(reportGist("Bins vanished\nIt was there before")).toBe("Bins vanished");
    expect(reportGist("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
    expect(reportGist("The bins John vanished from Today right after I ticked the dishes. It’s still on Week.")).toBe(
      "The bins John vanished from Today right after I ticked the dishes. It’s still…",
    );
    expect(reportGist("Settle up says I owe nothing, and won’t go away", 30)).toBe("Settle up says I owe nothing…");
  });

  it("says how long ago it came, short enough for a column", () => {
    const now = new Date("2026-10-31T21:00:00Z");
    expect(reportAge("2026-10-31T20:59:50Z", now)).toBe("now");
    expect(reportAge("2026-10-31T20:56:00Z", now)).toBe("4 min");
    expect(reportAge("2026-10-31T18:00:00Z", now)).toBe("3 h");
    expect(reportAge("2026-10-01T12:00:00Z", now)).toBe("1 Oct");
  });
});

describe("the Inbox", () => {
  it("filters by state (waiting first among them), where it came from, and kind", () => {
    expect(REPORT_FACETS.map((f) => f.key)).toEqual(["state", "source", "kind"]);
    expect(REPORT_FACETS[0].options[0].value).toBe("waiting");
  });

  it("names the states as the owner and as the sender see them", () => {
    expect(words('common.report.ownerState.new')).toBe("New");
    expect(words('common.report.state.open')).toBe("Read");
  });
});

describe("telling the other side", () => {
  it("pushes in plain words", () => {
    expect(REPORT_PUSH.sent("idea", "Ava", words)).toBe("Ava sent an idea");
    expect(REPORT_PUSH.sent("problem", null, words)).toBe("Someone sent a problem");
    expect(REPORT_PUSH.replied("Glyn", words)).toBe("Glyn at Jonz replied");
    expect(REPORT_PUSH.replied(null, words)).toBe("Jonz replied");
  });

  it("sends a reply's push whatever the push switches say, quietly in quiet hours", () => {
    const off: NotificationPrefs = { reminders: false, checks: false, flags: false, deal: false, quietFrom: 22, quietUntil: 7, timezone: "UTC" };
    expect(pushFor(off, "support", new Date("2026-10-31T12:00:00Z"), "UTC")).toBe("send");
    expect(pushFor(off, "support", new Date("2026-10-31T23:00:00Z"), "UTC")).toBe("quiet");
    expect(pushFor(off, "checks", new Date("2026-10-31T12:00:00Z"), "UTC")).toBe("skip");
  });

  it("emails a reply with the words, a way back into the app, and what they wrote", () => {
    const email = reportReplyEmail({
      id: "1a2b3c4d-0000-4000-8000-000000000000",
      name: "Ava Brown",
      signed: "Glyn",
      kind: "problem",
      words: "The bins John vanished from Today right after I ticked the dishes.",
      reply: "Thanks Ava.\n\nIt's fixed in today's update.",
      url: "https://jonz.app/you/reports/r1",
    });
    expect(email.subject).toBe("Re: The bins John vanished from Today right after I ticked the… (ref 1a2b3c4d)");
    expect(email.text).toContain("Hi Ava,");
    expect(email.text).toContain("Glyn at Jonz replied.");
    expect(email.text).toContain("It's fixed in today's update.");
    expect(email.html).toContain("https://jonz.app/you/reports/r1");
    expect(email.text).toContain("You sent this problem to Jonz.");
  });

  it("answers an emailed report by email, under its own subject, with no app link", () => {
    const email = reportReplyEmail({
      id: "1a2b3c4d-0000-4000-8000-000000000000",
      name: "Sam",
      signed: "Glyn",
      kind: "question",
      words: "Can I pay the Stake by card?",
      subject: "Re: Paying the Stake",
      reply: "Yes, from House, Stake.",
      url: null,
    });
    expect(email.subject).toBe("Re: Paying the Stake (ref 1a2b3c4d)");
    expect(email.html).not.toContain("Open it in Jonz");
    expect(email.text).toContain("You emailed support@jonz.app. Reply to this email to write back.");
  });

  it("says it's fixed to everyone who reported it", () => {
    const email = reportReplyEmail({
      id: "1a2b3c4d-0000-4000-8000-000000000000",
      name: "Ava",
      signed: "Glyn",
      kind: "problem",
      words: "The bins John vanished",
      reply: "This is fixed now. Thank you for telling us.",
      url: "https://jonz.app/you/reports/r1",
      fixed: true,
    });
    expect(email.subject).toBe("Fixed: The bins John vanished (ref 1a2b3c4d)");
    expect(email.text).toContain("Glyn at Jonz fixed what you reported.");
    expect(REPORT_PUSH.fixed(words)).toBe("Fixed: the problem you reported");
  });
});
