import { describe, expect, it } from "vitest";

import { confirmsDelete, DELETE_PATH, DELETION_DAYS, deletedOnDay, deletionDay, passDay, previewFromRow, statusFromRow } from "./account-deletion";
import { signInPath, signInReason } from "./auth-paths";
import { LEGAL, PRIVACY_POLICY } from "./legal";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("deleting an account", () => {
  it("needs the word typed, however it's cased or spaced, and nothing else", () => {
    expect(confirmsDelete("DELETE")).toBe(true);
    expect(confirmsDelete(" delete ")).toBe(true);
    expect(confirmsDelete("DELE")).toBe(false);
    expect(confirmsDelete("DELETE ME")).toBe(false);
    expect(confirmsDelete("")).toBe(false);
  });

  it("says the day it goes, and the day a Pass runs to", () => {
    expect(deletionDay("2026-11-29T09:00:00Z", "Europe/London")).toBe("Sun 29 Nov");
    expect(passDay("2027-10-12")).toBe("12 Oct 2027");
  });

  it("says the day it went in their own zone, and in UTC when the zone isn't one", () => {
    const late = new Date("2026-10-31T23:30:00Z");
    expect(deletedOnDay(late, "Europe/London")).toBe("31 October 2026");
    expect(deletedOnDay(late, "Pacific/Auckland")).toBe("1 November 2026");
    expect(deletedOnDay(late, null)).toBe("31 October 2026");
    expect(deletedOnDay(late, "Not/AZone")).toBe("31 October 2026");
  });

  it("reads the database's answers, and nothing it doesn't recognise", () => {
    expect(previewFromRow({ house: "The Annexe", pass_until: "2027-10-12", delete_after: "2026-11-30T09:00:00Z" })).toEqual({
      house: "The Annexe",
      passUntil: "2027-10-12",
      deleteAfter: "2026-11-30T09:00:00Z",
    });
    expect(previewFromRow({ house: null, pass_until: null, delete_after: "2026-11-30T09:00:00Z" })).toMatchObject({
      house: null,
      passUntil: null,
    });
    expect(statusFromRow(null)).toBeNull();
    expect(statusFromRow({ delete_after: "2026-11-30T09:00:00Z", requested_by: "owner" })).toEqual({
      deleteAfter: "2026-11-30T09:00:00Z",
      requestedBy: "owner",
    });
  });

  it("is at jonz.app/delete, which sign-in comes back to", () => {
    expect(`${LEGAL.site}${DELETE_PATH}`).toBe("https://jonz.app/delete");
    expect(signInPath(DELETE_PATH)).toBe("/signin?next=%2Fdelete");
    expect(signInReason(DELETE_PATH)).toBe(words('people.delete.signInReason'));
  });

  it("is in the Privacy Policy as it works: in the app or on the web, 30 days to change your mind", () => {
    const section = PRIVACY_POLICY.sections.find((s) => s.heading === "Deleting your account")!;
    const text = section.body.join(" ");
    expect(text).toContain("jonz.app/delete");
    expect(text).toContain(`${DELETION_DAYS} days`);
    expect(text).toContain("Keep my account");
    expect(text).toContain("Someone who left");
    expect(section.links?.[0]).toEqual({ label: "Delete your account", href: "https://jonz.app/delete" });
  });
});
