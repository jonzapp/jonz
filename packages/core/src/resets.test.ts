import { describe, expect, it } from "vitest";

import { actionLine } from "./history";
import { resetItemLine, resetSheet, resetTitle, resetWhat, toldLine, type ResetPreview, type ResetWords } from "./resets";

const names: Record<string, string> = { glyn: "Glyn Finck", sam: "Sam Lee", ada: "Ada Park" };

function words(overrides: Partial<ResetWords> = {}): ResetWords {
  return {
    kind: "week",
    nameOf: (id) => (id === "glyn" ? "You" : names[id]),
    viewerId: "glyn",
    currency: "GBP",
    zone: "Europe/London",
    ...overrides,
  };
}

function preview(overrides: Partial<ResetPreview> = {}): ResetPreview {
  return {
    kind: "week",
    week: { id: "w1", starts_on: "2026-10-26", starts_at: "2026-10-26T00:00:00Z", ends_at: "2026-11-02T00:00:00Z" },
    month: "2026-10",
    people: { ada: { ticks: 3, points: -7 }, sam: { ticks: 2, forfeit: 200 }, glyn: { ticks: 1 } },
    told: ["ada", "sam"],
    reopened: 6,
    past_due: 0,
    flags: 0,
    disputes: 0,
    correction: false,
    nothing: false,
    ...overrides,
  };
}

describe("the reset sheet", () => {
  it("says what resetting the week clears, in numbers, and who is told", () => {
    const sheet = resetSheet(preview(), words());
    expect(sheet.title).toBe("Reset this week?");
    expect(sheet.body).toBe("Everyone keeps the Johns they were dealt. Ticks, covers and flags from 26 Oct–1 Nov are cleared.");
    expect(sheet.lines).toEqual([
      { key: "ticks", label: "6 ticks cleared", value: "Ada 3, Sam 2, you 1" },
      { key: "balances", label: "Balances", value: "Ada −7 pts" },
      { key: "stake", label: "Stake", value: "£2 of forfeits removed" },
      { key: "track", label: "Track record", value: "This week shows open again" },
    ]);
    expect(sheet.told).toBe("Ada and Sam get a notification");
    expect(sheet.undo).toBe("You can undo this from History until October’s forfeits are split.");
    expect(sheet.confirm).toBe("Reset this week");
  });

  it("names one John's change, and a correction for a month already shared out", () => {
    const sheet = resetSheet(
      preview({ kind: "result", people: { sam: { points: 5, forfeit: 300 } }, told: ["sam"], correction: true }),
      words({ kind: "result", person: "Sam Lee", john: "Bathroom", outcome: "done", was: "missed" }),
    );
    expect(sheet.title).toBe("Mark Bathroom done?");
    expect(sheet.body).toBe("Sam’s Bathroom changes from missed to done.");
    expect(sheet.lines.find((l) => l.key === "stake")!.value).toBe("£3 of forfeits removed, as a correction this month");
    expect(sheet.told).toBe("Sam gets a notification");
    expect(sheet.confirm).toBe("Mark it done");
  });

  it("warns that reopened Johns past due turn late", () => {
    const sheet = resetSheet(preview({ past_due: 2 }), words({ kind: "person_week", person: "Ada Park" }));
    expect(sheet.title).toBe("Reset Ada’s week?");
    expect(sheet.lines.find((l) => l.key === "track")!.value).toMatch(/^Shows open again\. 2 past due/);
  });

  it("asks before its numbers are in", () => {
    expect(resetTitle(words({ kind: "skip" }))).toBe("Skip this week?");
    expect(resetTitle(words({ kind: "letoff", month: "2026-09" }))).toBe("Let everyone off September?");
  });
});

describe("a reset in History and on the Wall", () => {
  it("says who did what", () => {
    expect(resetWhat({ what: "person_week" }, "Sam")).toBe("reset Sam’s week");
    expect(resetWhat({ what: "result", name: "Bins", outcome: "missed" }, "You")).toBe("marked your Bins missed");
    expect(actionLine("reset", { what: "skip" }, "Glyn", "Someone", "GBP", "housemates")).toBe("Glyn skipped the week");
  });
});

describe("Ask Jonz's Resets card", () => {
  it("puts a reset's numbers in one line, without the Track record", () => {
    const line = resetItemLine({ kind: "reset", ask: { kind: "week", week: "w1" }, preview: preview(), words: {} }, words());
    expect(line).toEqual({ title: "Reset this week", meta: "6 ticks cleared, Ada −7 pts, £2 of forfeits removed", told: ["ada", "sam"] });
  });

  it("says an undo in History's words, and tells whoever's move it was", () => {
    const line = resetItemLine({ kind: "undo", action: "h1", line: "Sam ticked Bins", actor: "sam" }, words());
    expect(line).toEqual({ title: "Undo: Sam ticked Bins", meta: "Back as it was before", told: ["sam"] });
  });

  it("names everyone told once", () => {
    expect(toldLine(["sam", "ada", "sam"], words().nameOf)).toBe("Ada and Sam get a notification");
    expect(toldLine([], words().nameOf)).toBe("Nobody else is told");
  });
});
