import { describe, expect, it } from "vitest";

import type { AwayPeriod } from "./away";
import { FOCUS_SHELL_COPY, HOUSE_PAGE_COPY, PERSON_COPY, STAKE_HISTORY_COPY } from "./copy";
import {
  awayLines,
  joinParts,
  monthAbbr,
  monthCard,
  overviewFigures,
  moneyLines,
  monthsInWords,
  monthWord,
  owedMonths,
  owingLines,
  perkLines,
  recordLines,
  settleRows,
  shareLine,
  shareOutDay,
  stakeHistory,
  stakeRules,
  tableLines,
  tableMetaFit,
  type HistoryRow,
  type PageMember,
} from "./house-page";
import type { TableRow } from "./points";
import { buildStake, type LedgerRow } from "./stake";

const MEMBERS: PageMember[] = [
  { userId: "sam", name: "Sam Carter", role: "admin", streak: 6, immunityTokens: 1, swapTokens: 1 },
  { userId: "priya", name: "Priya Shah", role: "member", streak: 5, immunityTokens: 0, swapTokens: 0 },
  { userId: "tom", name: "Tom Reilly", role: "member", streak: 0, immunityTokens: 0, swapTokens: 0 },
  { userId: "megan", name: "Megan Doyle", role: "member", streak: 0, immunityTokens: 0, swapTokens: 0 },
];
const IDS = MEMBERS.map((m) => m.userId);

let nextId = 1;
function entry(user_id: string, kind: string, amount_minor: number, month: string, extra: Partial<LedgerRow> = {}): LedgerRow {
  const id = nextId++;
  return { id, user_id, kind, amount_minor, month, counterparty: null, created_at: `${month}-10T12:00:00Z`, ...extra };
}

function row(userId: string, points: number, done = 0, late = 0, missed = 0, rank = 1): TableRow {
  return { userId, points, done, late, missed, covered: 0, helped: 0, rank };
}

const projection = (net: Record<string, number>, forfeited: Record<string, number> = {}) =>
  IDS.map((id) => ({
    userId: id,
    forfeitedRaw: forfeited[id] ?? 0,
    forfeited: forfeited[id] ?? 0,
    received: (net[id] ?? 0) + (forfeited[id] ?? 0),
    net: net[id] ?? 0,
  }));

describe("month words", () => {
  it("names a month, short and long, the same in every time zone", () => {
    expect(monthWord("2026-10")).toBe("October");
    expect(monthAbbr("2026-10")).toBe("Oct");
    expect(monthWord("2026-01")).toBe("January");
  });

  it("shares a month out on the 1st of the next, over the new year too", () => {
    expect(shareOutDay("2026-10")).toBe("1 Nov");
    expect(shareOutDay("2026-12")).toBe("1 Jan");
  });

  it("lists months in words", () => {
    expect(monthsInWords([])).toBe("");
    expect(monthsInWords(["2026-09"])).toBe("September");
    expect(monthsInWords(["2026-08", "2026-09"])).toBe("August and September");
    expect(monthsInWords(["2026-07", "2026-08", "2026-09"])).toBe("July, August and September");
  });
});

describe("joinParts", () => {
  it("joins segments with a middle dot and merges neighbours of one tone", () => {
    expect(joinParts([[{ text: "1 pt" }], [{ text: "7 late", hazard: true }, { text: " in Oct" }], [{ text: "away" }]])).toEqual([
      { text: "1 pt, " },
      { text: "7 late", hazard: true },
      { text: " in Oct, away" },
    ]);
  });

  it("skips empty segments, and says nothing for nothing", () => {
    expect(joinParts([[{ text: "" }], [{ text: "5 pts" }], []])).toEqual([{ text: "5 pts" }]);
    expect(joinParts([])).toEqual([]);
  });
});

describe("overviewFigures", () => {
  const stake = (net: Record<string, number>, forfeited: Record<string, number> = {}) => ({
    month: "2026-10",
    projection: projection(net, forfeited),
  });
  const base = { month: "2026-10", me: "sam", rules: { currency: "GBP" as const, stakeMinor: 2000 }, housemates: 4 };

  it("gives your month, the stake, the housemates and the John list, in that order", () => {
    const johns = [
      { points: 3, everyWeeks: 1 },
      { points: 2, everyWeeks: 2 },
    ];
    const figures = overviewFigures({ ...base, stake: stake({ sam: 401 }), johns });
    expect(figures.map((f) => f.key)).toEqual(["money", "stake", "people", "johns"]);
    expect(figures[0]).toEqual({
      key: "money",
      value: "£4.01",
      label: HOUSE_PAGE_COPY.upIn("October"),
      note: "Nothing forfeited, shared out 1 Nov",
      good: true,
    });
    expect(figures[1]).toMatchObject({ value: "£20", label: HOUSE_PAGE_COPY.stakeEach });
    expect(figures[2]).toMatchObject({ value: "4", label: "housemates" });
    expect(figures[3]).toMatchObject({ value: "2", label: "Johns on the list", note: "about 4 pts a week" });
  });

  it("says what you're down in words, not in green", () => {
    const [money] = overviewFigures({ ...base, me: "tom", stake: stake({ tom: -934 }, { tom: 1000 }) });
    expect(money).toMatchObject({ value: "£9.34", label: HOUSE_PAGE_COPY.downIn("October"), note: "£10 forfeited, shared out 1 Nov", good: false });
  });

  it("gives what you forfeited when you're square, and when it's shared out", () => {
    expect(overviewFigures({ ...base, stake: stake({}) })[0]).toMatchObject({
      value: "£0",
      label: HOUSE_PAGE_COPY.forfeitedIn("October"),
      note: HOUSE_PAGE_COPY.sharedOutAlone("1 Nov"),
    });
    expect(overviewFigures({ ...base, stake: stake({ sam: 0 }, { sam: 200 }) })[0]).toMatchObject({ value: "£2" });
  });

  it("leaves a figure empty until it's read, and says one housemate and one John in the singular", () => {
    const figures = overviewFigures({ ...base, month: "2026-11", housemates: 1, johns: undefined });
    expect(figures[0]).toMatchObject({ value: null, label: HOUSE_PAGE_COPY.forfeitedIn("November") });
    expect(figures[2].label).toBe("housemate");
    expect(figures[3]).toMatchObject({ value: null, note: null });
    expect(overviewFigures({ ...base, johns: [{ points: 1, everyWeeks: 1 }] })[3].label).toBe("John on the list");
    expect(overviewFigures({ ...base, johns: [] })[3]).toMatchObject({ value: "0", note: null });
  });
});

describe("monthCard", () => {
  const stake = (net: Record<string, number>, forfeited: Record<string, number> = {}) => ({
    month: "2026-10",
    projection: projection(net, forfeited),
  });

  it("says you're up, the figure green, with nothing forfeited", () => {
    expect(monthCard(stake({ sam: 401 }), "sam", "GBP")).toEqual({
      label: "October so far",
      lead: HOUSE_PAGE_COPY.up,
      figure: "£4.01",
      good: true,
      meta: "Nothing forfeited, shared out 1 Nov",
    });
  });

  it("says you're down, in ink, with what you forfeited", () => {
    const card = monthCard(stake({ tom: -934 }, { tom: 1000 }), "tom", "GBP");
    expect(card).toMatchObject({ lead: HOUSE_PAGE_COPY.down, figure: "£9.34", good: false });
    expect(card.meta).toBe("£10 forfeited, shared out 1 Nov");
  });

  it("says nothing's forfeited yet in a quiet month, without saying it twice", () => {
    expect(monthCard(stake({}), "sam", "GBP")).toEqual({
      label: "October so far",
      lead: HOUSE_PAGE_COPY.nothingYet,
      figure: null,
      good: false,
      meta: HOUSE_PAGE_COPY.sharedOutAlone("1 Nov"),
    });
  });

  it("says you're even when what you forfeited came back", () => {
    const card = monthCard(stake({ sam: 0 }, { sam: 200 }), "sam", "GBP");
    expect(card.lead).toBe(HOUSE_PAGE_COPY.even);
    expect(card.meta).toBe("£2 forfeited, shared out 1 Nov");
  });

  it("treats someone not in the month as square", () => {
    expect(monthCard({ month: "2026-12", projection: [] }, "sam", "EUR").meta).toBe(HOUSE_PAGE_COPY.sharedOutAlone("1 Jan"));
  });
});

describe("owedMonths", () => {
  const closed = ["2026-08", "2026-09"];

  it("names the closed month a debt is from", () => {
    const ledger = [entry("tom", "forfeit", -400, "2026-09"), entry("sam", "share", 400, "2026-09")];
    expect(owedMonths(ledger, closed, "tom")).toEqual(["2026-09"]);
  });

  it("clears the oldest debt first with what's been paid", () => {
    const ledger = [
      entry("tom", "forfeit", -300, "2026-08"),
      entry("tom", "forfeit", -500, "2026-09"),
      entry("tom", "payment", 300, "2026-10", { counterparty: "sam" }),
    ];
    expect(owedMonths(ledger, closed, "tom")).toEqual(["2026-09"]);
  });

  it("keeps a month that's only partly paid", () => {
    const ledger = [entry("tom", "forfeit", -300, "2026-08"), entry("tom", "payment", 299, "2026-10", { counterparty: "sam" })];
    expect(owedMonths(ledger, closed, "tom")).toEqual(["2026-08"]);
  });

  it("lets a month someone was owed pay off another's debt", () => {
    const ledger = [entry("tom", "share", 200, "2026-08"), entry("tom", "forfeit", -200, "2026-09")];
    expect(owedMonths(ledger, closed, "tom")).toEqual([]);
  });

  it("ignores this month, still open, and other people", () => {
    const ledger = [entry("tom", "forfeit", -300, "2026-10"), entry("sam", "forfeit", -300, "2026-09")];
    expect(owedMonths(ledger, closed, "tom")).toEqual([]);
    expect(owedMonths([], closed, "tom")).toEqual([]);
  });

  it("counts several entries in one month together, cap refunds included", () => {
    const ledger = [
      entry("tom", "forfeit", -2300, "2026-09"),
      entry("tom", "cap_refund", 300, "2026-09"),
      entry("tom", "forfeit", -100, "2026-08"),
    ];
    expect(owedMonths(ledger, closed, "tom")).toEqual(["2026-08", "2026-09"]);
  });
});

describe("settleRows", () => {
  const ledger = [
    entry("tom", "forfeit", -935, "2026-09"),
    entry("sam", "share", 401, "2026-09"),
    entry("priya", "share", 534, "2026-09"),
  ];
  const stake = buildStake({ ledger, closedMonths: ["2026-09"], memberIds: IDS, stakeMinor: 2000, month: "2026-10" });

  it("gives what's owed to you a button each, the first one amber", () => {
    const rows = settleRows({ transfers: stake.transfers, me: "priya", members: MEMBERS, currency: "GBP", ledger, closedMonths: ["2026-09"] });
    expect(rows).toEqual([
      {
        key: "tom-priya",
        userId: "tom",
        name: "Tom Reilly",
        owedToYou: true,
        amount: 534,
        title: "Tom owes you £5.34 for September",
        meta: HOUSE_PAGE_COPY.paidHowYouLike,
        action: "Mark £5.34 received",
        // A screen reader hears the button away from its row, so it names who paid.
        spoken: "Mark Tom’s £5.34 received",
        primary: true,
        splitwise: null,
      },
    ]);
  });

  it("makes only the first button amber when several owe you", () => {
    const transfers = [
      { from: "tom", to: "sam", amount: 300 },
      { from: "megan", to: "sam", amount: 100 },
    ];
    const rows = settleRows({ transfers, me: "sam", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [] });
    expect(rows.map((r) => [r.title, r.primary, r.meta])).toEqual([
      ["Tom owes you £3", true, HOUSE_PAGE_COPY.paidHowYouLike],
      ["Megan owes you £1", false, HOUSE_PAGE_COPY.paidHowYouLike],
    ]);
  });

  it("says what you owe, for when, and that it waits on them", () => {
    const rows = settleRows({ transfers: stake.transfers, me: "tom", members: MEMBERS, currency: "GBP", ledger, closedMonths: ["2026-09"] });
    expect(rows.map((r) => [r.title, r.meta, r.action, r.primary])).toEqual([
      ["You owe Priya £5.34 for September", "Waiting for Priya to confirm", null, false],
      ["You owe Sam £4.01 for September", "Waiting for Sam to confirm", null, false],
    ]);
    // With no closed month to name, it only waits.
    const bare = settleRows({ transfers: stake.transfers, me: "tom", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [] });
    expect([bare[0].title, bare[0].meta]).toEqual(["You owe Priya £5.34", HOUSE_PAGE_COPY.waitingFor("Priya")]);
  });

  it("draws nothing when you're square, or it's between others", () => {
    expect(settleRows({ transfers: [], me: "sam", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [] })).toEqual([]);
    const theirs = [{ from: "tom", to: "priya", amount: 534 }];
    expect(settleRows({ transfers: theirs, me: "megan", members: MEMBERS, currency: "GBP", ledger, closedMonths: [] })).toEqual([]);
  });

  it("names someone who has left as a former housemate, with no button the database would refuse", () => {
    const transfers = [
      { from: "ben", to: "sam", amount: 50 },
      { from: "tom", to: "sam", amount: 300 },
    ];
    const rows = settleRows({ transfers, me: "sam", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [] });
    expect(rows.map((r) => [r.title, r.meta, r.action, r.primary])).toEqual([
      [`${FOCUS_SHELL_COPY.formerHousemate} owes you £0.50`, HOUSE_PAGE_COPY.gone, null, false],
      // The amber button goes to the first one that can be marked.
      ["Tom owes you £3", HOUSE_PAGE_COPY.paidHowYouLike, "Mark £3 received", true],
    ]);
    const owing = settleRows({ transfers: [{ from: "sam", to: "ben", amount: 50 }], me: "sam", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [] });
    expect(owing.map((r) => [r.title, r.meta])).toEqual([["You owe a former housemate £0.50", HOUSE_PAGE_COPY.gone]]);
  });

  it("in a Splitwise house, gives what's owed to you its line to copy there and Added to Splitwise", () => {
    const owed = settleRows({ transfers: stake.transfers, me: "priya", members: MEMBERS, currency: "GBP", ledger, closedMonths: ["2026-09"], settleIn: "splitwise" });
    expect(owed.map((r) => [r.title, r.meta, r.action, r.spoken, r.primary])).toEqual([
      ["Tom owes you £5.34 for September", "Add it in Splitwise: paid by you, Tom owes all of it", "Added to Splitwise", "Mark Tom’s £5.34 added to Splitwise", true],
    ]);
    // Splitwise's amount box takes the bare number.
    expect(owed[0].splitwise).toEqual({ description: "Jonz Stake, September", amount: "5.34", copy: "Copy 5.34", spoken: "Copy Tom’s £5.34" });
    // What you owe waits for them to add it; nothing to copy.
    const owing = settleRows({ transfers: stake.transfers, me: "tom", members: MEMBERS, currency: "GBP", ledger, closedMonths: ["2026-09"], settleIn: "splitwise" });
    expect(owing.map((r) => [r.meta, r.splitwise])).toEqual([
      ["Priya adds it to Splitwise", null],
      ["Sam adds it to Splitwise", null],
    ]);
    // Whole amounts copy without pence, and someone who has left still can't be marked.
    const left = settleRows({ transfers: [{ from: "ben", to: "sam", amount: 50 }, { from: "tom", to: "sam", amount: 300 }], me: "sam", members: MEMBERS, currency: "GBP", ledger: [], closedMonths: [], settleIn: "splitwise" });
    expect(left.map((r) => [r.meta, r.action, r.splitwise?.amount ?? null, r.splitwise?.description ?? null])).toEqual([
      [HOUSE_PAGE_COPY.gone, null, null, null],
      ["Add it in Splitwise: paid by you, Tom owes all of it", "Added to Splitwise", "3", "Jonz Stake"],
    ]);
  });
});

describe("tableLines", () => {
  const base = {
    members: MEMBERS,
    me: "sam",
    month: "2026-10",
    currency: "GBP" as const,
    today: "2026-10-26",
  };
  const away: AwayPeriod[] = [{ id: "a1", userId: "megan", startsOn: "2026-10-29", endsOn: "2026-11-01", note: "Cork" }];

  it("keeps the standings' order, with you as You and everyone else by first name", () => {
    const lines = tableLines({ ...base, rows: [row("priya", 7), row("sam", 5, 0, 0, 0, 2), row("megan", 5, 0, 0, 0, 2), row("tom", 1)] });
    expect(lines.map((l) => [l.title, l.me, l.name])).toEqual([
      ["Priya", false, "Priya Shah"],
      ["You", true, "Sam Carter"],
      ["Megan", false, "Megan Doyle"],
      ["Tom", false, "Tom Reilly"],
    ]);
  });

  it("says points, then streak and tokens", () => {
    const [priya, sam] = tableLines({ ...base, rows: [row("priya", 7), row("sam", 1)], column: 680 });
    expect(priya.meta).toEqual([{ text: "7 pts, 5-week streak" }]);
    expect(sam.meta).toEqual([{ text: "1 pt, 6-week streak, 1 immunity" }]);
    const swapper = MEMBERS.map((m) => (m.userId === "tom" ? { ...m, swapTokens: 1 } : m));
    expect(tableLines({ ...base, members: swapper, rows: [row("tom", 3)] })[0].meta).toEqual([{ text: "3 pts, swap ready" }]);
  });

  it("puts the month's late and missed first, in hazard, then time away", () => {
    const lines = tableLines({
      ...base,
      rows: [row("tom", 1), row("megan", 5)],
      monthRows: [row("tom", 6, 2, 7, 1), row("megan", 20, 8)],
      away,
    });
    expect(lines[0].meta).toEqual([{ text: "1 pt, " }, { text: "7 late, 1 missed", hazard: true, icon: "x" }, { text: " in Oct" }]);
    expect(lines[1].meta).toEqual([{ text: "5 pts, away 29 Oct–1 Nov" }]);
    // Only late: late's clock marks it.
    const [late] = tableLines({ ...base, rows: [row("tom", 1)], monthRows: [row("tom", 6, 2, 2, 0)] });
    expect(late.meta[1]).toEqual({ text: "2 late", hazard: true, icon: "clock" });
  });

  it("says at most two things after the points, and only what fits on one line", () => {
    const busy = MEMBERS.map((m) => (m.userId === "megan" ? { ...m, streak: 3, immunityTokens: 2 } : m));
    const text = (line: { meta: { text: string }[] }) => line.meta.map((p) => p.text).join("");
    // The month's misses come first; time away doesn't fit after them, so nothing lesser is said instead.
    const [missed] = tableLines({ ...base, members: busy, rows: [row("megan", 2)], monthRows: [row("megan", 2, 0, 0, 1)], away });
    expect(text(missed)).toBe("2 pts, 1 missed in Oct");
    const [home] = tableLines({ ...base, members: busy, rows: [row("megan", 2)], column: 680 });
    expect(text(home)).toBe("2 pts, 3-week streak, 2 immunity");
    const [gone] = tableLines({ ...base, members: busy, rows: [row("megan", 2)], away });
    expect(text(gone)).toBe("2 pts, away 29 Oct–1 Nov");
    // On the narrowest phone the tokens are left out whole rather than cut off.
    const [narrow] = tableLines({ ...base, members: busy, rows: [row("megan", 2)], column: 360 });
    expect(text(narrow)).toBe("2 pts, 3-week streak");
    expect(tableLines({ ...base, members: busy, rows: [row("megan", 2)] })[0].meta).toEqual(narrow.meta);
  });

  it("leaves out what doesn't fit beside the money as it's drawn, on the reference phone", () => {
    const text = (line: { meta: { text: string }[] }) => line.meta.map((p) => p.text).join("");
    // Two-digit points and "+£4.01": the immunity token would be cut off, so it's left out.
    const [owed] = tableLines({ ...base, rows: [row("sam", 31)], projection: projection({ sam: 401 }), column: 390 });
    expect([text(owed), owed.money]).toEqual(["31 pts, 6-week streak", "+£4.01"]);
    // Level money is short, which leaves room for it.
    const [level] = tableLines({ ...base, rows: [row("sam", 31)], projection: projection({}), column: 390 });
    expect([text(level), level.money]).toEqual(["31 pts, 6-week streak, 1 immunity", "£0"]);
  });

  it("fits the meta line to the column it's in", () => {
    // Before the Stake is read, with room kept for a usual figure.
    expect(tableMetaFit(360)).toBe(25);
    expect(tableMetaFit(375)).toBe(27);
    expect(tableMetaFit(390)).toBe(30);
    // A laptop's column is capped at 680.
    expect(tableMetaFit(680)).toBe(71);
    // Beside the money as it's drawn.
    expect(tableMetaFit(390, "£0")).toBe(35);
    expect(tableMetaFit(390, "−£10.50")).toBe(28);
    expect(tableMetaFit(100)).toBe(0);
  });

  it("trails the month's money with its sign, in hazard only when it's lost", () => {
    const lines = tableLines({
      ...base,
      rows: [row("priya", 7), row("tom", 1), row("megan", 0)],
      projection: projection({ priya: 400, tom: -934 }, { tom: 1000 }),
    });
    expect(lines.map((l) => [l.money, l.losing])).toEqual([
      ["+£4", false],
      ["−£9.34", true],
      ["£0", false],
    ]);
  });

  it("leaves the money off until the Stake is read", () => {
    const [line] = tableLines({ ...base, rows: [row("sam", 0)], column: 390 });
    // The room for it is kept, so the line doesn't lose its end when the money lands.
    expect(line).toMatchObject({ money: null, losing: false, meta: [{ text: "0 pts, 6-week streak" }] });
  });

  it("shows nobody for an empty table, and a former housemate by name", () => {
    expect(tableLines({ ...base, rows: [] })).toEqual([]);
    expect(tableLines({ ...base, rows: [row("ben", 3)] })[0]).toMatchObject({
      title: FOCUS_SHELL_COPY.formerHousemate,
      name: FOCUS_SHELL_COPY.formerHousemate,
    });
  });
});

describe("stakeRules", () => {
  it("puts the house's own amounts in the words", () => {
    const rules = stakeRules({ currency: "GBP", stakeMinor: 2000, lateForfeitMinor: 100, missedForfeitMinor: 300 }, 50);
    expect(rules.map((r) => r.label)).toEqual(["Points", "The Stake", "Immunity", "Swap", "Fair shares"]);
    expect(rules[1].body).toContain("Everyone puts in £20 a month. A late John costs £1 and a missed one £3");
    expect(rules[2].body).toContain("Every 4 clean weeks in a row");
    expect(rules[4].body).toContain("from the day they joined");
    expect(rules[4].body).toContain("made up by half");
  });

  it("falls back to in full for a setting it doesn't know", () => {
    const rules = stakeRules({ currency: "EUR", stakeMinor: 1050, lateForfeitMinor: 50, missedForfeitMinor: 150 }, 75);
    expect(rules[1].body).toContain("€10.50");
    expect(rules[4].body).toContain("made up in full");
  });
});

describe("a housemate's page", () => {
  it("gives their week and month, late and missed in hazard only when there are any", () => {
    const lines = recordLines(row("tom", 1, 1, 0, 0), row("tom", 6, 2, 7, 1), "2026-10");
    expect(lines).toEqual([
      { key: "week", title: "This week", meta: [{ text: "1 on time" }], value: "1 pt" },
      {
        key: "month",
        title: "October",
        meta: [{ text: "2 on time, " }, { text: "7 late, 1 missed", hazard: true, icon: "x" }],
        value: "6 pts",
      },
    ]);
    expect(recordLines(row("tom", 0, 0, 1, 0), null, "2026-10")[0].meta).toEqual([
      { text: "0 on time, " },
      { text: "1 late", hazard: true, icon: "clock" },
    ]);
    expect(recordLines(row("tom", 0), undefined, "2026-10").map((l) => l.key)).toEqual(["week"]);
    expect(recordLines(null, null, "2026-10")).toEqual([]);
  });

  it("says where they stand against their share, rounded to the half point", () => {
    expect(shareLine({ userId: "tom", balance: -3.4, weeksToEven: 2 }, false)).toEqual({
      key: "share",
      title: "3.5 points behind their share",
      meta: [{ text: PERSON_COPY.catchingUp(2) }],
      value: "−3.5",
    });
    expect(shareLine({ userId: "sam", balance: 1.1, weeksToEven: 0 }, true)).toMatchObject({
      title: "1 point ahead of your share",
      value: "+1",
    });
    expect(shareLine({ userId: "sam", balance: 0.2, weeksToEven: 0 }, true)).toEqual({
      key: "share",
      title: "Level with your share",
      meta: [{ text: PERSON_COPY.sinceJoining }],
    });
    expect(shareLine({ userId: "tom", balance: -0.6, weeksToEven: 0 }, false).meta).toEqual([{ text: PERSON_COPY.sinceJoining }]);
    // Nobody has dealt them anything lately (they've just joined): level.
    expect(shareLine(undefined, false)).toEqual({
      key: "share",
      title: "Level with their share",
      meta: [{ text: PERSON_COPY.sinceJoining }],
    });
  });

  it("counts down to the next immunity token, and lists the tokens held", () => {
    expect(perkLines({ streak: 6, immunityTokens: 1, swapTokens: 1 }).map((l) => [l.title, l.meta[0].text])).toEqual([
      ["6-week streak", "Next immunity token in 2 weeks"],
      ["1 immunity token", PERSON_COPY.immunityMeta],
      ["Swap ready", PERSON_COPY.swapMeta],
    ]);
    expect(perkLines({ streak: 4, immunityTokens: 0, swapTokens: 0 }).map((l) => l.meta[0].text)).toEqual([
      "Next immunity token in 4 weeks",
      PERSON_COPY.noTokensMeta,
    ]);
    expect(perkLines({ streak: 9, immunityTokens: 2, swapTokens: 0 })[0].meta[0].text).toBe(PERSON_COPY.fullImmunity);
    expect(perkLines({ streak: 0, immunityTokens: 0, swapTokens: 0 }).map((l) => l.title)).toEqual([
      PERSON_COPY.noStreak,
      PERSON_COPY.noTokens,
    ]);
  });

  it("breaks down the month's money, forfeits in hazard", () => {
    const lines = moneyLines({
      projection: { userId: "tom", forfeitedRaw: 1000, forfeited: 1000, received: 66, net: -934 },
      month: "2026-10",
      stakeMinor: 2000,
      record: row("tom", 6, 2, 7, 1),
      currency: "GBP",
    });
    expect(lines.map((l) => [l.title, l.value, l.losing])).toEqual([
      [PERSON_COPY.forfeited, "−£10", true],
      [PERSON_COPY.share, "+£0.66", undefined],
      [PERSON_COPY.net, "−£9.34", true],
    ]);
    expect(lines[0].meta).toEqual([{ text: "7 late, 1 missed", hazard: true, icon: "x" }, { text: " in Oct" }]);
    expect(lines[1].meta).toEqual([{ text: "Shared out 1 Nov" }]);
  });

  it("says when the stake capped what they forfeited, and nothing for a clean month", () => {
    const capped = moneyLines({
      projection: { userId: "tom", forfeitedRaw: 2300, forfeited: 2000, received: 0, net: -2000 },
      month: "2026-10",
      stakeMinor: 2000,
      currency: "GBP",
    });
    expect(capped[0].meta).toEqual([{ text: "Capped at the £20 stake" }]);
    const clean = moneyLines({ projection: undefined, month: "2026-10", stakeMinor: 2000, currency: "GBP" });
    expect(clean.map((l) => [l.value, l.losing])).toEqual([
      ["£0", false],
      ["£0", undefined],
      ["£0", false],
    ]);
    expect(clean[0].meta).toEqual([{ text: PERSON_COPY.noneForfeited }]);
  });

  it("says what they owe you or you owe them, and keeps what others owe between them", () => {
    const ledger = [entry("tom", "forfeit", -935, "2026-09")];
    const transfers = [
      { from: "tom", to: "priya", amount: 534 },
      { from: "tom", to: "sam", amount: 401 },
    ];
    const input = { transfers, members: MEMBERS, currency: "GBP" as const, ledger, closedMonths: ["2026-09"] };
    // Yours to mark received, said as House's settle-up says it; what Tom owes Priya stays between them.
    expect(owingLines({ ...input, personId: "tom", me: "sam" }).map((l) => [l.title, l.meta[0].text])).toEqual([
      ["Tom owes you £4.01 for September", HOUSE_PAGE_COPY.paidHowYouLike],
    ]);
    expect(owingLines({ ...input, personId: "priya", me: "sam" })).toEqual([]);
    expect(owingLines({ ...input, personId: "tom", me: "tom" }).map((l) => [l.title, l.meta[0].text])).toEqual([
      ["You owe Priya £5.34 for September", "Waiting for Priya to confirm"],
      ["You owe Sam £4.01 for September", "Waiting for Sam to confirm"],
    ]);
    expect(owingLines({ ...input, personId: "megan", me: "sam" })).toEqual([]);
    // With someone who has left, nobody can mark it: said as House's settle-up says it, whichever way it's owed.
    const left = owingLines({ ...input, transfers: [{ from: "sam", to: "ben", amount: 100 }], personId: "sam", me: "sam" });
    expect(left.map((l) => [l.title, l.meta[0].text])).toEqual([["You owe a former housemate £1", HOUSE_PAGE_COPY.gone]]);
    const theirs = owingLines({ ...input, transfers: [{ from: "ben", to: "sam", amount: 100 }], personId: "sam", me: "sam" });
    expect(theirs.map((l) => [l.title, l.meta[0].text])).toEqual([["A former housemate owes you £1", HOUSE_PAGE_COPY.gone]]);
    const house = settleRows({ ...input, transfers: [{ from: "sam", to: "ben", amount: 100 }, { from: "ben", to: "sam", amount: 100 }], me: "sam" });
    expect(house.map((r) => r.meta)).toEqual([...theirs, ...left].map((l) => l.meta[0].text));
  });

  it("lists their time away from today on, or says there's none", () => {
    const periods: AwayPeriod[] = [
      { id: "later", userId: "megan", startsOn: "2026-12-20", endsOn: "2026-12-27", note: null },
      { id: "now", userId: "megan", startsOn: "2026-10-25", endsOn: "2026-10-28", note: "Cork" },
      { id: "past", userId: "megan", startsOn: "2026-10-01", endsOn: "2026-10-03", note: null },
      { id: "theirs", userId: "tom", startsOn: "2026-11-01", endsOn: "2026-11-01", note: null },
    ];
    expect(awayLines(periods, "megan", "2026-10-26").map((l) => [l.title, l.meta[0].text])).toEqual([
      ["25–28 Oct", "Away now, Cork"],
      ["20–27 Dec", PERSON_COPY.booked],
    ]);
    // The last day away still counts as away.
    expect(awayLines(periods, "megan", "2026-10-28")[0].meta[0].text).toBe("Away now, Cork");
    // None: the page says so in a sentence of its own.
    expect(awayLines(periods, "sam", "2026-10-26")).toEqual([]);
  });
});

describe("stakeHistory", () => {
  const h = (row: LedgerRow, john: HistoryRow["john"] = null): HistoryRow => ({ ...row, john });
  const ledger: HistoryRow[] = [
    h(entry("tom", "forfeit", -100, "2026-10", { created_at: "2026-10-20T21:30:00Z" }), { name: "Descale the kettle", outcome: "late" }),
    h(entry("tom", "forfeit", -300, "2026-10", { created_at: "2026-10-18T09:00:00Z" }), { name: "Bins out", outcome: "missed" }),
    h(entry("tom", "payment", 266, "2026-10", { counterparty: "megan", created_at: "2026-10-12T10:00:00Z" })),
    h(entry("megan", "payment", -266, "2026-10", { counterparty: "tom", created_at: "2026-10-12T10:00:00Z" })),
    h(entry("sam", "share", 401, "2026-09", { created_at: "2026-10-01T00:05:00Z" })),
    h(entry("tom", "cap_refund", 300, "2026-09", { created_at: "2026-10-01T00:05:00Z" })),
    h(entry("sam", "forfeit", -100, "2026-09", { created_at: "2026-09-08T08:00:00Z" })),
  ];
  const input = { ledger, members: MEMBERS, currency: "GBP" as const, zone: "Europe/London" };

  it("groups the whole house's ledger by month, newest first, each forfeit naming its John", () => {
    const months = stakeHistory({ ...input, me: "sam", whole: true });
    expect(months.map((m) => m.label)).toEqual(["October 2026", "September 2026"]);
    // A payment between two others shows once, without its amount: that's only theirs to see.
    expect(months[0].lines.map((l) => [l.kind, l.title, l.meta, l.amount, l.losing])).toEqual([
      ["late", "Descale the kettle", "Tom, late, Tue 20 Oct", "−£1", true],
      ["missed", "Bins out", "Tom, missed, Sun 18 Oct", "−£3", true],
      ["payment", "Tom paid Megan", STAKE_HISTORY_COPY.received("Mon 12 Oct"), null, false],
    ]);
    expect(months[1].lines.map((l) => [l.title, l.meta, l.amount])).toEqual([
      [STAKE_HISTORY_COPY.capRefund, "Tom, Thu 1 Oct", "+£3"],
      [STAKE_HISTORY_COPY.share, "You, Thu 1 Oct", "+£4.01"],
      [STAKE_HISTORY_COPY.aJohn, "You, forfeit, Tue 8 Sep", "−£1"],
    ]);
  });

  it("shows only yours on Mine, a payment's amount unsigned", () => {
    // The ledger books being paid as coming off your side, which a sign would read as a loss...
    expect(stakeHistory({ ...input, me: "megan", whole: false }).map((m) => m.lines.map((l) => [l.title, l.meta, l.amount, l.losing]))).toEqual([
      [["Tom paid you", STAKE_HISTORY_COPY.received("Mon 12 Oct"), "£2.66", false]],
    ]);
    // ...and paying as going back on yours, which would read as a gain.
    expect(stakeHistory({ ...input, me: "tom", whole: false })[0].lines.map((l) => [l.title, l.meta, l.amount])).toEqual([
      ["Descale the kettle", "Late, Tue 20 Oct", "−£1"],
      ["Bins out", "Missed, Sun 18 Oct", "−£3"],
      ["You paid Megan", STAKE_HISTORY_COPY.received("Mon 12 Oct"), "£2.66"],
    ]);
  });

  it("shows a payment you're in once on Whole house, from your side", () => {
    const payments = (me: string) =>
      stakeHistory({ ...input, me, whole: true })[0]
        .lines.filter((l) => l.kind === "payment")
        .map((l) => [l.title, l.amount]);
    expect(payments("tom")).toEqual([["You paid Megan", "£2.66"]]);
    expect(payments("megan")).toEqual([["Tom paid you", "£2.66"]]);
  });

  it("dates entries in the house's zone", () => {
    const late = [h(entry("sam", "share", 100, "2026-09", { created_at: "2026-09-30T23:30:00Z" }))];
    expect(stakeHistory({ ...input, ledger: late, me: "sam", whole: false })[0].lines[0].meta).toBe("Thu 1 Oct");
    expect(stakeHistory({ ...input, ledger: late, zone: "America/Toronto", me: "sam", whole: false })[0].lines[0].meta).toBe("Wed 30 Sep");
  });

  it("is empty for an empty ledger, and names a former housemate", () => {
    expect(stakeHistory({ ...input, ledger: [], me: "sam", whole: true })).toEqual([]);
    const gone = [
      h(entry("ben", "payment", 100, "2026-10", { counterparty: "sam" })),
      h(entry("sam", "payment", -100, "2026-10", { counterparty: "ben" })),
    ];
    expect(stakeHistory({ ...input, ledger: gone, me: "sam", whole: true })[0].lines.map((l) => [l.title, l.amount])).toEqual([
      [`${FOCUS_SHELL_COPY.formerHousemate} paid you`, "£1"],
    ]);
    const paidGone = [
      h(entry("tom", "payment", 100, "2026-10", { counterparty: "ben" })),
      h(entry("ben", "payment", -100, "2026-10", { counterparty: "tom" })),
    ];
    expect(stakeHistory({ ...input, ledger: paidGone, me: "sam", whole: true })[0].lines.map((l) => [l.title, l.amount])).toEqual([
      ["Tom paid a former housemate", null],
    ]);
  });

  it("dates a forfeit by its John's due day, and orders by the day shown", () => {
    const settled = [
      h(entry("tom", "forfeit", -100, "2026-09", { id: 1, created_at: "2026-10-03T00:05:00Z" }), {
        name: "Water the plants",
        outcome: "late",
        due_at: "2026-09-30T20:00:00Z",
      }),
      h(entry("sam", "share", 100, "2026-09", { id: 2, created_at: "2026-10-01T00:05:00Z" })),
      h(entry("tom", "forfeit", -300, "2026-09", { id: 3, created_at: "2026-10-03T00:05:00Z" }), {
        name: "Bins out",
        outcome: "missed",
        due_at: "2026-09-29T09:00:00.5+00:00",
      }),
    ];
    expect(stakeHistory({ ...input, ledger: settled, me: "sam", whole: true })[0].lines.map((l) => [l.id, l.meta])).toEqual([
      [2, "You, Thu 1 Oct"],
      [1, "Tom, late, Wed 30 Sep"],
      [3, "Tom, missed, Tue 29 Sep"],
    ]);
  });

  it("orders entries made at the same moment by when they were written", () => {
    const tie = [
      h(entry("sam", "share", 100, "2026-09", { id: 5, created_at: "2026-10-01T00:05:00Z" })),
      h(entry("tom", "share", 200, "2026-09", { id: 9, created_at: "2026-10-01T00:05:00Z" })),
    ];
    expect(stakeHistory({ ...input, ledger: tie, me: "sam", whole: true })[0].lines.map((l) => l.id)).toEqual([9, 5]);
  });
});
