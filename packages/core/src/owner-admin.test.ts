import { describe, expect, it } from "vitest";

import {
  auditChanges,
  auditLine,
  auditParts,
  auditRowWords,
  daysUntil,
  formatLocalDateTime,
  noticeEndsAt,
  noticeProblems,
  noticeLine,
  noticeWindow,
  parseLocalDateTime,
  type AuditEntry,
  type NoticeDraft,
} from "./owner-admin";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const NOW = new Date("2026-11-02T12:00:00Z");
const draft = (over: Partial<NoticeDraft> = {}): NoticeDraft => ({
  kind: "status",
  title: "Jonz is slow right now",
  body: "",
  linkLabel: "",
  linkUrl: "",
  startsAt: null,
  endsAt: null,
  ...over,
});

describe("checking a notice before it's saved", () => {
  it("passes a plain status notice", () => {
    expect(noticeProblems(draft(), NOW)).toEqual({});
  });

  it("needs a title of 80 letters at most", () => {
    expect(noticeProblems(draft({ title: "  " }), NOW).title).toBe("Give it a title.");
    expect(noticeProblems(draft({ title: "x".repeat(81) }), NOW).title).toMatch(/80/);
  });

  it("needs both halves of a button, and a link in the app or https", () => {
    expect(noticeProblems(draft({ linkLabel: "See the Pass" }), NOW).linkUrl).toBe("Say where the button goes.");
    expect(noticeProblems(draft({ linkUrl: "/house/pass" }), NOW).linkLabel).toBe("Give the button some words.");
    expect(noticeProblems(draft({ linkLabel: "Go", linkUrl: "javascript:alert(1)" }), NOW).linkUrl).toMatch(/https/);
    expect(noticeProblems(draft({ linkLabel: "Go", linkUrl: "//evil.example" }), NOW).linkUrl).toMatch(/https/);
    expect(noticeProblems(draft({ linkLabel: "Status", linkUrl: "https://status.supabase.com" }), NOW)).toEqual({});
  });

  it("ends after it starts", () => {
    expect(noticeProblems(draft({ endsAt: new Date("2026-11-02T11:00:00Z") }), NOW).endsAt).toBeDefined();
    const startsAt = new Date("2026-11-10T09:00:00Z");
    expect(noticeProblems(draft({ startsAt, endsAt: new Date("2026-11-03T09:00:00Z") }), NOW).endsAt).toBeDefined();
    expect(noticeProblems(draft({ startsAt, endsAt: new Date("2026-11-11T09:00:00Z") }), NOW)).toEqual({});
  });
});

describe("when a notice ends", () => {
  it("follows the Ends choice from its start", () => {
    expect(noticeEndsAt("never", NOW, null)).toBeNull();
    expect(noticeEndsAt("2h", NOW, null)?.toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(noticeEndsAt("tomorrow", NOW, null)?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    const typed = new Date("2026-11-30T23:59:00Z");
    expect(noticeEndsAt("date", NOW, typed)).toBe(typed);
  });

  it("reads a typed date and time on this device, and refuses one that isn't", () => {
    const date = parseLocalDateTime("2026-11-30 09:05")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 30, 9, 5]);
    expect(parseLocalDateTime("2026-11-30T09:05")).not.toBeNull();
    expect(parseLocalDateTime("2026-02-30 09:00")).toBeNull();
    expect(parseLocalDateTime("30/11/2026")).toBeNull();
    expect(parseLocalDateTime("2026-11-30 24:00")).toBeNull();
    expect(formatLocalDateTime(date)).toBe("2026-11-30 09:05");
  });
});

describe("the audit log", () => {
  const owner = "u-owner";
  const entry = (over: Partial<AuditEntry>): AuditEntry => ({
    id: 1,
    at: "2026-10-30T16:41:00Z",
    actor: owner,
    action: "notice.save",
    targetKind: "notice",
    targetId: "n1",
    reason: null,
    before: null,
    after: { kind: "status", title: "Jonz is slow right now", body: "", starts_at: "2026-10-30T16:41:00Z", ends_at: null },
    ...over,
  });

  it("says who did what in plain words", () => {
    expect(auditLine(entry({}), owner, words)).toEqual({ title: "You wrote a status notice", meta: "Jonz is slow right now" });
    expect(auditLine(entry({ before: { title: "Ticks may be slow" } }), owner, words).title).toBe("You changed a status notice");
    expect(auditLine(entry({ action: "notice.end", after: { kind: "offer", title: "Founding pass" } }), owner, words).title).toBe(
      "You ended an offer",
    );
    expect(auditLine(entry({}), "someone-else", words).title).toBe("The owner wrote a status notice");
  });

  it("lists only what changed, old beside new", () => {
    const changes = auditChanges(
      entry({
        before: { kind: "status", title: "Ticks may be slow", body: "", ends_at: "2026-10-30T18:41:00Z" },
        after: { kind: "status", title: "Jonz is slow right now", body: "", ends_at: null },
      }),
      "UTC",
    );
    expect(changes).toEqual([
      { field: "title", label: "Title", from: "Ticks may be slow", to: "Jonz is slow right now" },
      { field: "ends_at", label: "Ends", from: "Fri 30 Oct, 18:41", to: null },
    ]);
  });

  it("lists what a new notice was saved with", () => {
    expect(auditChanges(entry({}), "UTC").map((c) => c.label)).toEqual(["Kind", "Title", "Starts"]);
  });

  it("says what happened to an account by its id alone, never a name", () => {
    const account = (action: string, actor: string | null, after: unknown = null) =>
      auditLine(entry({ action, actor, targetKind: "account", targetId: "a1b2c3d4-0000-4000-8000-000000000000", before: null, after }), owner, words);
    expect(account("account.delete_request", "a1b2c3d4", { requested_by: "self" })).toEqual({
      title: "Someone asked to delete their account",
      meta: "Account a1b2c3d4",
    });
    expect(account("account.delete_request", owner, { requested_by: "owner" }).title).toBe("You started deleting an account");
    expect(account("account.delete_keep", "a1b2c3d4").title).toBe("Someone kept their account");
    expect(account("account.delete_stop", owner).title).toBe("You stopped a deletion");
    expect(account("account.delete_now", owner).title).toBe("You deleted an account sooner");
    expect(account("account.delete_done", null).title).toBe("Jonz deleted an account");
  });

  it("splits an entry into who, what, where and its detail, for a table's columns", () => {
    expect(auditParts(entry({}), owner, words)).toEqual({
      who: "You",
      what: "wrote a status notice",
      where: "Notices",
      detail: "Jonz is slow right now",
    });
    const done = entry({ action: "account.delete_done", actor: null, targetKind: "account", targetId: "a1b2c3d4-0000", after: null });
    expect(auditParts(done, owner, words)).toEqual({ who: "Jonz", what: "deleted an account", where: "Account a1b2c3d4", detail: "" });
    expect(auditParts(entry({ action: "house.open", actor: null, targetId: "h1" }), owner, words)).toEqual({
      who: "Jonz",
      what: "house.open",
      where: "h1",
      detail: "",
    });
  });

  it("gives every word a row shows, for the search box to find", () => {
    expect(auditRowWords(entry({}), owner, words)).toBe("You wrote a status notice Notices Jonz is slow right now");
    expect(auditRowWords(entry({}), "someone-else", words)).toBe("The owner wrote a status notice Notices Jonz is slow right now");
    const done = entry({ action: "account.delete_done", actor: null, targetKind: "account", targetId: "a1b2c3d4-0000", after: null });
    expect(auditRowWords(done, owner, words)).toBe("Jonz deleted an account Account a1b2c3d4");
    expect(auditRowWords(entry({ action: "house.open", actor: null, targetId: "h1" }), owner, words)).toBe("Jonz house.open h1");
  });

  it("lists what changed on a deletion in words", () => {
    const changes = auditChanges(
      { before: { state: "pending", delete_after: "2026-11-30T09:00:00Z" }, after: { state: "kept" } },
      "UTC",
    );
    expect(changes).toEqual([
      { field: "state", label: "State", from: "Waiting", to: "Kept" },
      { field: "delete_after", label: "Goes", from: "Mon 30 Nov, 09:00", to: null },
    ]);
    expect(auditChanges({ before: null, after: { requested_by: "self", delete_after: "2026-11-30T09:00:00Z" } }, "UTC")).toEqual([
      { field: "requested_by", label: "Asked", from: null, to: "In the app" },
      { field: "delete_after", label: "Goes", from: null, to: "Mon 30 Nov, 09:00" },
    ]);
  });

});

describe("a notice's window, as its row says it", () => {
  const at = (iso: string) => iso;
  it("says since when, and until when or until you end it", () => {
    expect(noticeWindow({ startsAt: at("2026-11-02T09:05:00Z"), endsAt: null }, NOW, "UTC")).toBe("since Mon 2 Nov, 09:05, until you end it");
    expect(noticeWindow({ startsAt: at("2026-11-02T09:05:00Z"), endsAt: at("2026-11-02T14:00:00Z") }, NOW, "UTC")).toBe(
      "since Mon 2 Nov, 09:05, until Mon 2 Nov, 14:00",
    );
  });

  it("says from when for one that starts later, and when it ended for one that's over", () => {
    expect(noticeWindow({ startsAt: at("2026-11-09T08:00:00Z"), endsAt: null }, NOW, "UTC")).toBe("from Mon 9 Nov, 08:00, until you end it");
    expect(noticeWindow({ startsAt: at("2026-11-01T08:00:00Z"), endsAt: at("2026-11-01T10:00:00Z") }, NOW, "UTC")).toBe("ended Sun 1 Nov, 10:00");
  });
});

describe("a notice's line in Every notice", () => {
  it("says whether it's on in the same words as when", () => {
    expect(noticeLine({ startsAt: "2026-11-02T09:05:00Z", endsAt: null }, NOW, "UTC")).toBe("Showing since Mon 2 Nov, 09:05, until you end it");
    expect(noticeLine({ startsAt: "2026-11-09T08:00:00Z", endsAt: "2026-11-16T08:00:00Z" }, NOW, "UTC")).toBe(
      "Starts Mon 9 Nov, 08:00, until Mon 16 Nov, 08:00",
    );
    expect(noticeLine({ startsAt: "2026-11-01T08:00:00Z", endsAt: "2026-11-01T10:00:00Z" }, NOW, "UTC")).toBe("Ended Sun 1 Nov, 10:00");
  });
});

describe("days until a deletion", () => {
  it("counts whole days up, and none once it's due", () => {
    expect(daysUntil("2026-12-02T11:00:00Z", NOW)).toBe(30);
    expect(daysUntil("2026-11-03T12:00:00Z", NOW)).toBe(1);
    expect(daysUntil("2026-11-02T12:00:00Z", NOW)).toBe(0);
    expect(daysUntil("2026-11-01T12:00:00Z", NOW)).toBeLessThan(0);
  });
});
