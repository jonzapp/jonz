import { describe, expect, it } from "vitest";

import { CHAT_SAVED_TURNS, CHAT_TITLE_MAX, chatGroups, chatTitle, chatWhen, savedTurns } from "./ask-chats";
import { SUMMARY_MAX } from "./house-draft";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

describe("chatTitle", () => {
  it("is the first thing said, on one line", () => {
    expect(chatTitle([{ role: "user", text: "  Add Ivy\nto main floor " }], words)).toBe("Add Ivy to main floor");
  });
  it("cuts a long one at a word", () => {
    const title = chatTitle([{ role: "user", text: "Can you move the bathroom clean to Sunday mornings and give the bins to whoever is home on Mondays" }], words);
    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX);
    expect(title).toBe("Can you move the bathroom clean to Sunday…");
  });
  it("has a title even before anything is said", () => {
    expect(chatTitle([], words)).toBe(words('ask.chats.untitled'));
  });
});

describe("savedTurns", () => {
  it("keeps only valid turns, and only the last ones", () => {
    const many = Array.from({ length: CHAT_SAVED_TURNS + 5 }, (_, i) => ({ role: "user", text: `t${i}` }));
    const kept = savedTurns([...many, { role: "assistant", text: "x" }, { role: "nobody" }]);
    expect(kept).toHaveLength(CHAT_SAVED_TURNS);
    expect(kept.at(-1)).toEqual({ role: "user", text: `t${CHAT_SAVED_TURNS + 4}` });
    expect(savedTurns(null)).toEqual([]);
  });
  it("keeps the summary a reply came with, and drops one that's too long", () => {
    const summed = { role: "assistant", text: "Done.", ask: null, hadCard: false, summed: { text: "- Bins on Tuesday.", count: 32 } };
    const tooLong = { ...summed, summed: { text: "x".repeat(SUMMARY_MAX + 1), count: 32 } };
    expect(savedTurns([summed, tooLong])).toEqual([summed]);
  });
});

describe("chatWhen", () => {
  const now = new Date("2026-11-06T00:30:00Z");
  it("says Today and Yesterday in the house's own zone", () => {
    expect(chatWhen(new Date("2026-11-06T00:10:00Z"), now, "Europe/London", words)).toBe("Today");
    // 18:30 in New York is still "today" there at 19:30, though London has moved on.
    expect(chatWhen(new Date("2026-11-05T23:30:00Z"), now, "America/New_York", words)).toBe("Today");
    expect(chatWhen(new Date("2026-11-05T12:00:00Z"), now, "Europe/London", words)).toBe("Yesterday");
  });
  it("gives the date before that", () => {
    expect(chatWhen(new Date("2026-11-02T12:00:00Z"), now, "Europe/London", words)).toBe("Mon 2 Nov");
  });
});

describe("chatGroups", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const at = (iso: string, id: string) => ({ id, updatedAt: iso });

  it("puts chats under Today, Last 7 days and Earlier, by the house's day, latest first as given", () => {
    const groups = chatGroups(
      [
        at("2026-11-06T09:00:00Z", "a"),
        at("2026-11-05T23:30:00Z", "b"),
        at("2026-10-31T12:00:00Z", "c"),
        at("2026-10-30T12:00:00Z", "d"),
      ],
      now,
      "Europe/London",
     words);
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      [words('ask.chats.today'), ["a"]],
      [words('ask.chats.lastWeek'), ["b", "c"]],
      [words('ask.chats.earlier'), ["d"]],
    ]);
  });

  it("counts the day in the house's zone", () => {
    const groups = chatGroups([at("2026-11-06T03:00:00Z", "late")], now, "America/New_York", words);
    expect(groups[0].label).toBe(words('ask.chats.lastWeek'));
  });

  it("leaves out empty groups", () => {
    expect(chatGroups([], now, "Europe/London", words)).toEqual([]);
  });
});
