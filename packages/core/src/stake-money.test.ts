import { describe, expect, it } from "vitest";

import { CURRENCIES } from "./domain";
import { CURRENCY_SYMBOL, currencyForCountry, formatMoney, formatSigned, moneyInput, parseMoney } from "./money";
import { balances, buildStake, forfeitFor, HISTORY_LENGTH, settleMonth, settleUp, type LedgerEntry, type LedgerRow } from "./stake";

const RULES = { lateForfeitMinor: 100, missedForfeitMinor: 300 };

describe("forfeitFor", () => {
  it("charges late and missed only", () => {
    expect(forfeitFor("late", RULES)).toBe(100);
    expect(forfeitFor("missed", RULES)).toBe(300);
    expect(forfeitFor("done", RULES)).toBe(0);
    expect(forfeitFor("excused", RULES)).toBe(0);
  });

  it("charges a covered John as missed", () => {
    expect(forfeitFor("covered", RULES)).toBe(300);
  });
});

/** A month whose odd pennies start at the top of the order. */
const FIRST_TURN = "0000-01";

/** The month's whole ledger: forfeits as written during it, plus its close. */
function monthLedger(
  ids: string[],
  stake: number,
  forfeits: { userId: string; amount: number; to?: string | null }[],
  month = FIRST_TURN,
) {
  const s = settleMonth(ids, stake, forfeits, month);
  const entries: LedgerEntry[] = [
    ...forfeits.map((f) => ({ userId: f.userId, kind: "forfeit" as const, amount: -f.amount })),
    ...s.entries,
  ];
  return { s, entries, bal: balances(entries) };
}

describe("settleMonth", () => {
  it("shares one person's forfeits among the rest", () => {
    const { s, bal } = monthLedger(["a", "b", "c", "d"], 2000, [{ userId: "d", amount: 300 }]);
    expect(s.received).toEqual({ a: 100, b: 100, c: 100, d: 0 });
    expect(Object.fromEntries(bal)).toEqual({ a: 100, b: 100, c: 100, d: -300 });
  });

  it("always sums to zero", () => {
    const { bal } = monthLedger(["a", "b", "c"], 2000, [
      { userId: "a", amount: 100 },
      { userId: "b", amount: 300 },
      { userId: "b", amount: 300 },
      { userId: "c", amount: 100 },
    ]);
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("gives the odd penny to the earliest members, consistently", () => {
    const { s } = monthLedger(["a", "b", "c", "d"], 2000, [{ userId: "a", amount: 100 }]);
    expect(s.received).toEqual({ a: 0, b: 34, c: 33, d: 33 });
    expect(monthLedger(["a", "b", "c", "d"], 2000, [{ userId: "a", amount: 100 }]).s).toEqual(s);
  });

  it("moves the odd penny one place down the order each month", () => {
    const forfeit = [{ userId: "a", amount: 100 }];
    expect(monthLedger(["a", "b", "c", "d"], 2000, forfeit, "0000-02").s.received).toEqual({ a: 0, b: 33, c: 34, d: 33 });
    expect(monthLedger(["a", "b", "c", "d"], 2000, forfeit, "0000-03").s.received).toEqual({ a: 0, b: 33, c: 33, d: 34 });
    expect(monthLedger(["a", "b", "c", "d"], 2000, forfeit, "0000-04").s.received).toEqual({ a: 0, b: 34, c: 33, d: 33 });
    // And on across the new year: December's penny is d's, January's b's.
    expect(monthLedger(["a", "b", "c", "d"], 2000, forfeit, "2026-12").s.received.d).toBe(34);
    expect(monthLedger(["a", "b", "c", "d"], 2000, forfeit, "2027-01").s.received.b).toBe(34);
  });

  it("never takes more than the stake", () => {
    const forfeits = Array.from({ length: 10 }, () => ({ userId: "slob", amount: 300 }));
    const { s, entries, bal } = monthLedger(["slob", "tidy"], 2000, forfeits);
    expect(s.forfeited.slob).toBe(2000);
    expect(entries).toContainEqual({ userId: "slob", kind: "cap_refund", amount: 1000 });
    expect(bal.get("slob")).toBe(-2000);
    expect(bal.get("tidy")).toBe(2000);
  });

  it("refunds everything in a house of one", () => {
    const { bal } = monthLedger(["solo"], 2000, [{ userId: "solo", amount: 300 }]);
    expect(bal.get("solo")).toBe(0);
  });

  it("includes someone who forfeited and then left", () => {
    const { bal } = monthLedger(["a", "b"], 2000, [{ userId: "gone", amount: 300 }]);
    expect(bal.get("gone")).toBe(-300);
    expect(bal.get("a")! + bal.get("b")!).toBe(300);
  });

  it("writes nothing for a clean month", () => {
    expect(settleMonth(["a", "b"], 2000, [], FIRST_TURN).entries).toEqual([]);
  });

  it("pays a covered John's forfeit whole to whoever covered it", () => {
    const { s, bal } = monthLedger(["glyn", "sam", "alex", "jo"], 2000, [{ userId: "sam", amount: 300, to: "glyn" }]);
    expect(s.received).toEqual({ glyn: 300, sam: 0, alex: 0, jo: 0 });
    expect(Object.fromEntries(bal)).toEqual({ glyn: 300, sam: -300 });
  });

  it("shares the rest of a coverer's payer's forfeits as usual", () => {
    const { s, bal } = monthLedger(["glyn", "sam", "alex"], 2000, [
      { userId: "sam", amount: 300, to: "glyn" },
      { userId: "sam", amount: 100 },
    ]);
    expect(s.received).toEqual({ glyn: 350, sam: 0, alex: 50 });
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("shrinks covered forfeits in proportion when the cap bites, and still sums to zero", () => {
    // 2400 forfeited against a 2000 stake: each keeps 5/6.
    const { s, bal } = monthLedger(["glyn", "sam", "alex"], 2000, [
      { userId: "sam", amount: 300, to: "glyn" },
      { userId: "sam", amount: 300, to: "alex" },
      { userId: "sam", amount: 1800 },
    ]);
    expect(s.forfeited.sam).toBe(2000);
    expect(s.received.glyn).toBe(250 + 750);
    expect(s.received.alex).toBe(250 + 750);
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("rounds a trimmed cover down and shares the odd penny", () => {
    // 3 × 700 = 2100 against 2000: each cover keeps floor(700 × 2000 / 2100) = 666.
    const { s, bal } = monthLedger(["glyn", "sam"], 2000, [
      { userId: "sam", amount: 700, to: "glyn" },
      { userId: "sam", amount: 700, to: "glyn" },
      { userId: "sam", amount: 700, to: "glyn" },
    ]);
    expect(s.received.glyn).toBe(2000);
    expect(bal.get("sam")).toBe(-2000);
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("shares a cover round the house when the coverer has left", () => {
    const { s } = monthLedger(["sam", "alex", "jo"], 2000, [{ userId: "sam", amount: 300, to: "gone" }]);
    expect(s.received).toEqual({ sam: 0, alex: 150, jo: 150 });
  });

  it("gives someone who left none of the others' forfeits, though they pay their own", () => {
    // Priya moved out mid-month: her forfeit is still taken, and Sam's goes only to Alex and Jo.
    const { s, bal } = monthLedger(["sam", "alex", "jo"], 2000, [
      { userId: "sam", amount: 300 },
      { userId: "priya", amount: 100 },
    ]);
    expect(s.received.priya).toBe(0);
    expect(s.received.sam + s.received.alex + s.received.jo).toBe(400);
    expect(s.received.alex + s.received.jo).toBeGreaterThanOrEqual(300 + 66);
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe("settleUp", () => {
  it("clears every balance", () => {
    const bal = new Map([
      ["a", 100],
      ["b", 250],
      ["c", -50],
      ["d", -300],
    ]);
    const transfers = settleUp(bal);
    const after = new Map(bal);
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amount);
      after.set(t.to, after.get(t.to)! - t.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual(3);
  });

  it("pays the biggest debt to the biggest credit first", () => {
    expect(settleUp(new Map([["x", -300], ["y", 200], ["z", 100]]))).toEqual([
      { from: "x", to: "y", amount: 200 },
      { from: "x", to: "z", amount: 100 },
    ]);
  });

  it("has nothing to do when everyone is square", () => {
    expect(settleUp(new Map([["a", 0]]))).toEqual([]);
  });
});

describe("money", () => {
  it("formats by currency, dropping zero pence", () => {
    expect(formatMoney(1400, "GBP")).toBe("£14");
    expect(formatMoney(250, "GBP")).toBe("£2.50");
    expect(formatMoney(2000, "CAD")).toBe("$20");
    expect(formatMoney(150, "EUR")).toBe("€1.50");
  });

  it("always shows a sign", () => {
    expect(formatSigned(200, "GBP")).toBe("+£2");
    expect(formatSigned(-350, "GBP")).toBe("−£3.50");
    expect(formatSigned(0, "GBP")).toBe("£0");
  });

  it("parses what people type", () => {
    expect(parseMoney("2")).toBe(200);
    expect(parseMoney("£2.5")).toBe(250);
    expect(parseMoney("2,75")).toBe(275);
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("starts a field from an amount, and reads back the same", () => {
    expect(moneyInput(2000)).toBe("20");
    expect(moneyInput(250)).toBe("2.50");
    expect(moneyInput(5)).toBe("0.05");
    expect(moneyInput(0)).toBe("0");
    for (const minor of [0, 5, 250, 2000, 100_000]) expect(parseMoney(moneyInput(minor))).toBe(minor);
  });

  it("guesses currency from the country", () => {
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("ca")).toBe("CAD");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("IE")).toBe("EUR");
    expect(currencyForCountry(null)).toBe("GBP");
    expect(currencyForCountry("JP")).toBe("GBP");
  });
});

describe("CURRENCY_SYMBOL", () => {
  it("marks every currency a house can use", () => {
    expect(Object.keys(CURRENCY_SYMBOL).sort()).toEqual([...CURRENCIES].sort());
    expect(CURRENCY_SYMBOL.GBP).toBe("£");
    expect(CURRENCY_SYMBOL.EUR).toBe("€");
  });
});

describe("buildStake", () => {
  let id = 0;
  const entry = (user_id: string, kind: string, amount_minor: number, month: string, counterparty: string | null = null): LedgerRow => ({
    id: ++id,
    user_id,
    kind,
    amount_minor,
    month,
    counterparty,
    created_at: `2026-10-${String(10 + (id % 18)).padStart(2, "0")}T12:00:00Z`,
  });

  it("projects this month as if it ended now, capped at the stake", () => {
    const view = buildStake({
      ledger: [entry("ava", "forfeit", -300, "2026-10"), entry("ava", "forfeit", -2500, "2026-10"), entry("ben", "forfeit", -100, "2026-10")],
      closedMonths: [],
      memberIds: ["ava", "ben", "cal"],
      stakeMinor: 2000,
      month: "2026-10",
    });
    expect(view.projection).toEqual([
      { userId: "ava", forfeitedRaw: 2800, forfeited: 2000, received: 50, net: -1950 },
      { userId: "ben", forfeitedRaw: 100, forfeited: 100, received: 1000, net: 900 },
      { userId: "cal", forfeitedRaw: 0, forfeited: 0, received: 1050, net: 1050 },
    ]);
    // Nothing is owed until the month closes.
    expect(view.transfers).toEqual([]);
    // A month's projection sums to zero.
    expect(view.projection.reduce((sum, p) => sum + p.net, 0)).toBe(0);
  });

  it("owes only what closed months left, after payments", () => {
    const view = buildStake({
      ledger: [
        entry("ava", "forfeit", -400, "2026-09"),
        entry("ben", "share", 400, "2026-09"),
        entry("ava", "payment", 100, "2026-10", "ben"),
        entry("ben", "payment", -100, "2026-10", "ava"),
        entry("cal", "forfeit", -300, "2026-10"),
      ],
      closedMonths: ["2026-09"],
      memberIds: ["ava", "ben", "cal"],
      stakeMinor: 2000,
      month: "2026-10",
    });
    expect(view.outstanding).toEqual(new Map([["ava", -300], ["ben", 300]]));
    expect(view.transfers).toEqual([{ from: "ava", to: "ben", amount: 300 }]);
  });

  it("is square, with nothing listed, for a house with no ledger yet", () => {
    const view = buildStake({ ledger: [], closedMonths: [], memberIds: ["ava"], stakeMinor: 2000, month: "2026-10" });
    expect(view.transfers).toEqual([]);
    expect(view.history).toEqual([]);
    expect(view.projection).toEqual([{ userId: "ava", forfeitedRaw: 0, forfeited: 0, received: 0, net: 0 }]);
  });

  it("lists the latest entries, as many as the Stake shows", () => {
    const ledger = Array.from({ length: HISTORY_LENGTH + 5 }, () => entry("ava", "forfeit", -100, "2026-08"));
    const view = buildStake({ ledger, closedMonths: [], memberIds: ["ava"], stakeMinor: 2000, month: "2026-10" });
    expect(view.history).toHaveLength(HISTORY_LENGTH);
    expect(view.history[0]).toEqual({
      id: ledger[0].id,
      userId: "ava",
      kind: "forfeit",
      amount: -100,
      month: "2026-08",
      counterparty: null,
      createdAt: ledger[0].created_at,
    });
  });
});
