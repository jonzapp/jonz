import { describe, expect, it } from "vitest";

import { NO_PREFS } from "./steady-prefs";
import { swapAsk, swapOffersToYou, type SwapOfferRow } from "./steady-swap";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const now = new Date("2026-11-16T08:10:00Z");
const day = (d: number) => new Date(`2026-11-${16 + d}T20:00:00Z`);
const item = (id: string, userId: string, johnId: string, name: string, points: number, due: number, over = {}) => ({
  id,
  johnId,
  userId,
  name,
  points,
  status: "upcoming" as const,
  flaggedAt: null,
  dueAt: day(due),
  carried: false,
  jobId: null,
  ...over,
});
const ITEMS = [
  item("a1", "me", "garbage", "Garbage", 1, 3),
  item("a2", "ada", "kitchen", "Kitchen", 2, 2),
  item("a3", "ada", "mop", "Mopping", 4, 1),
  item("a4", "cal", "bath", "Bathroom", 3, 4),
];
const members = (over: Record<string, Partial<typeof NO_PREFS>> = {}) =>
  [
    { userId: "me", name: "Glyn Finck" },
    { userId: "ada", name: "Ada Lovelace" },
    { userId: "cal", name: "Cal Jones" },
  ].map((m) => ({ ...m, prefs: { ...NO_PREFS, ...over[m.userId] } }));
const PREFS = { me: { rather: { garbage: -1 as const } }, ada: { rather: { garbage: 1 as const } } };
const offer = (over: Partial<SwapOfferRow> = {}): SwapOfferRow => ({
  id: "o1",
  mine: "a1",
  theirs: "a2",
  asked_by: "me",
  asked_user_id: "ada",
  expires_at: "2026-11-17T00:00:00Z",
  ...over,
});

describe("swapAsk", () => {
  it("finds who would rather do your John, and theirs nearest in points", () => {
    const ask = swapAsk({ items: ITEMS, viewerId: "me", members: members(PREFS), offers: [], now }, words);
    expect(ask).toMatchObject({
      kind: "suggest",
      mine: { id: "a1" },
      theirs: { id: "a2" },
      withUserId: "ada",
      title: "Ada would rather do it",
      meta: "Swap it for Ada’s Kitchen, 2 pts",
      button: "Ask Ada",
      note: "If Ada says no or doesn’t answer by tonight, Garbage stays yours.",
    });
  });

  it("never offers one of theirs you'd rather not either", () => {
    const ask = swapAsk({ items: ITEMS, viewerId: "me", members: members({ ...PREFS, me: { rather: { garbage: -1, kitchen: -1 } } }), offers: [], now }, words);
    expect(ask).toMatchObject({ kind: "suggest", theirs: { id: "a3" } });
  });

  it("says an ask is waiting, until it runs out", () => {
    expect(swapAsk({ items: ITEMS, viewerId: "me", members: members(PREFS), offers: [offer()], now }, words)).toEqual({
      kind: "asked",
      mine: ITEMS[0],
      withUserId: "ada",
      note: "Asked Ada. If they say no or don’t answer by tonight, it stays yours.",
    });
    const ranOut = offer({ expires_at: "2026-11-16T00:00:00Z" });
    expect(swapAsk({ items: ITEMS, viewerId: "me", members: members(PREFS), offers: [ranOut], now }, words)?.kind).toBe("suggest");
  });

  it("is nothing with no John you'd rather not, nobody keen, or nothing of theirs to swap", () => {
    expect(swapAsk({ items: ITEMS, viewerId: "me", members: members({ ada: PREFS.ada }), offers: [], now }, words)).toBeNull();
    expect(swapAsk({ items: ITEMS, viewerId: "me", members: members({ me: PREFS.me }), offers: [], now }, words)).toBeNull();
    const busy = ITEMS.map((i) => (i.userId === "ada" ? { ...i, status: "checking" as const } : i));
    expect(swapAsk({ items: busy, viewerId: "me", members: members(PREFS), offers: [], now }, words)).toBeNull();
    const done = ITEMS.map((i) => (i.id === "a1" ? { ...i, status: "done" as const } : i));
    expect(swapAsk({ items: done, viewerId: "me", members: members(PREFS), offers: [], now }, words)).toBeNull();
  });
});

describe("swapOffersToYou", () => {
  it("shows an ask made to you, with both Johns", () => {
    const offers = swapOffersToYou({ items: ITEMS, viewerId: "ada", members: members(), offers: [offer()], now }, words);
    expect(offers).toEqual([
      {
        id: "o1",
        fromUserId: "me",
        theirs: ITEMS[0],
        yours: ITEMS[1],
        title: "Glyn asks to swap",
        body: "Your Kitchen for their Garbage, 1 pt. You’d rather do Garbage.",
      },
    ]);
  });

  it("leaves out an ask to someone else, one that ran out, and one whose Johns moved on", () => {
    const base = { items: ITEMS, members: members(), now };
    expect(swapOffersToYou({ ...base, viewerId: "cal", offers: [offer()] }, words)).toEqual([]);
    expect(swapOffersToYou({ ...base, viewerId: "ada", offers: [offer({ expires_at: "2026-11-16T08:00:00Z" })] }, words)).toEqual([]);
    const done = ITEMS.map((i) => (i.id === "a2" ? { ...i, status: "checking" as const } : i));
    expect(swapOffersToYou({ ...base, items: done, viewerId: "ada", offers: [offer()] }, words)).toEqual([]);
  });
});
