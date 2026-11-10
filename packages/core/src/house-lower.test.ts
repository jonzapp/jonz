import { describe, expect, it } from "vitest";
import { wordsFor } from "./words-for";

import { HOUSE_LOWER_COPY, WALL_FEED_COPY } from "./copy";
import { STATUS_MARK } from "./format";
import {
  houseSetupValues,
  leaveBar,
  leaveCost,
  paymentShown,
  struckAt,
  topReaction,
  wallAge,
  wallDays,
  wallFeedRow,
  type WallFeedRow,
  type WallScene,
} from "./house-lower";
import { wallEvents, type WallEvent, type WallRow } from "./wall";

const ZONE = "Europe/London";
// A Monday afternoon, the day after the clocks went back: London is on GMT again.
const NOW = new Date("2026-10-26T15:00:00Z");

const MEMBERS = [
  { userId: "sam", name: "Sam Carter" },
  { userId: "priya", name: "Priya Shah" },
  { userId: "megan", name: "Megan Doyle" },
  { userId: "tom", name: "Tom Reilly" },
];

const scene = (overrides: Partial<WallScene> = {}): WallScene => ({
  me: "sam",
  members: MEMBERS,
  currency: "GBP",
  zone: ZONE,
  now: NOW,
  ...overrides,
});

function event(overrides: Partial<WallRow> = {}): WallEvent {
  return wallEvents(
    [
      {
        id: "e1",
        kind: "done",
        user_id: "megan",
        assignment_id: "a1",
        data: { name: "Wipe down the kitchen" },
        created_at: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
        assignments: null,
        reactions: [],
        ...overrides,
      },
    ],
    "sam",
  )[0];
}

const row = (overrides: Partial<WallRow> = {}, at: Partial<WallScene> = {}) => wallFeedRow(event(overrides), scene(at));

describe("wallAge", () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  it("says just now under a minute, and for a clock a little ahead", () => {
    expect(wallAge(ago(59_000), NOW, ZONE)).toBe("just now");
    expect(wallAge(new Date(NOW.getTime() + 30_000), NOW, ZONE)).toBe("just now");
  });

  it("counts whole minutes, then whole hours, rounding down", () => {
    expect(wallAge(ago(60_000), NOW, ZONE)).toBe("1 min");
    expect(wallAge(ago(59 * 60_000 + 59_000), NOW, ZONE)).toBe("59 min");
    expect(wallAge(ago(60 * 60_000), NOW, ZONE)).toBe("1h");
    expect(wallAge(ago(3 * 3_600_000 + 59 * 60_000), NOW, ZONE)).toBe("3h");
    expect(wallAge(ago(23 * 3_600_000 + 59 * 60_000), NOW, ZONE)).toBe("23h");
  });

  it("then days, then the date in the house's zone", () => {
    expect(wallAge(ago(24 * 3_600_000), NOW, ZONE)).toBe("1 day");
    expect(wallAge(ago(6 * 24 * 3_600_000), NOW, ZONE)).toBe("6 days");
    expect(wallAge(new Date("2026-10-12T23:30:00Z"), NOW, ZONE)).toBe("13 Oct");
    expect(wallAge(new Date("2026-10-12T23:30:00Z"), NOW, "UTC")).toBe("12 Oct");
  });
});

describe("wallFeedRow", () => {
  it("leads a tick with the ticker, first names only, and how long ago", () => {
    const r = row();
    expect(r.title).toBe("Megan ticked Wipe down the kitchen");
    expect(r.actor).toEqual({ userId: "megan", name: "Megan Doyle", me: false });
    expect(r.when).toBe("3h");
    expect(r.icon).toBe("check");
    expect(r.john).toBe("Wipe down the kitchen");
  });

  it("says You for the viewer", () => {
    const r = row({ user_id: "sam" });
    expect(r.title).toBe("You ticked Wipe down the kitchen");
    expect(r.actor?.me).toBe(true);
    expect(r.who).toBe("You");
  });

  it("says each step of switching the house to a family, and back", () => {
    const r = (data: Record<string, unknown>, user_id: string | null = "megan") => row({ kind: "kind_changed", user_id, data });
    expect(r({ kind: "family", on: "2026-12-01" }).title).toBe("Megan made the house a family from Tue 1 Dec");
    expect(r({ kind: "family", on: "2026-12-01" }).detail).toBe("Once this month is settled up");
    expect(r({ kind: "family", on: "2026-12-01" }).icon).toBe("home");
    expect(r({ kind: "housemates", kept: true }).title).toBe("Megan kept the house as housemates");
    expect(r({ kind: "housemates" }).title).toBe("Megan made the house housemates again");
    expect(r({ kind: "family" }).title).toBe("Megan made the house a family");
    const clock = r({ kind: "family" }, null);
    expect(clock.title).toBe("The house is a family now");
    expect(clock.actor).toBeNull();
  });

  it("tells where a tick has got to from this week's board", () => {
    const status = (s: string) => () => s as never;
    expect(row({}, { statusOf: status("checking") }).detail).toBe(WALL_FEED_COPY.checking);
    expect(row({}, { statusOf: status("disputed") }).detail).toBe(WALL_FEED_COPY.disputedTick);
    expect(row({}, { statusOf: status("done") }).detail).toBe(WALL_FEED_COPY.onTime);
    for (const open of ["upcoming", "due-soon", "overdue", "missed"]) {
      expect(row({}, { statusOf: status(open) }).detail).toBe(WALL_FEED_COPY.struck);
    }
    // Off this week's board, it went as the event says.
    expect(row().detail).toBe(WALL_FEED_COPY.onTime);
    expect(row({ kind: "late" }).detail).toBe(WALL_FEED_COPY.late);
    expect(row({ kind: "late" }, { statusOf: status("checking") }).detail).toBe(WALL_FEED_COPY.late);
  });

  it("tells an older tick the house struck out, but not one ticked again after", () => {
    const tick = event({ created_at: "2026-10-15T08:00:00Z" });
    const verdict = event({ id: "e2", kind: "upheld", user_id: null, created_at: "2026-10-15T10:00:00Z" });
    const earlier = event({ id: "e3", kind: "upheld", user_id: null, created_at: "2026-10-14T10:00:00Z" });
    const struck = struckAt([verdict, earlier, event({ id: "e4", kind: "upheld", assignment_id: null })]);
    expect(struck).toEqual(new Map([["a1", new Date("2026-10-15T10:00:00Z")]]));
    expect(wallFeedRow(tick, scene({ struck })).detail).toBe(WALL_FEED_COPY.struck);
    const again = event({ created_at: "2026-10-15T12:00:00Z" });
    expect(wallFeedRow(again, scene({ struck })).detail).toBe(WALL_FEED_COPY.onTime);
    // This week's board knows better.
    expect(wallFeedRow(tick, scene({ struck, statusOf: () => "checking" })).detail).toBe(WALL_FEED_COPY.checking);
    expect(struckAt([])).toEqual(new Map());
  });

  it("marks what went wrong from the one status map, and says a miss in words", () => {
    const status = (s: string) => () => s as never;
    expect(row({}, { statusOf: status("disputed") }).mark).toBe(STATUS_MARK.disputed.icon);
    expect(row({}, { statusOf: status("overdue") }).mark).toBe(STATUS_MARK.missed.icon);
    expect(row({ kind: "late" }).mark).toBe(STATUS_MARK.late.icon);
    expect(row().mark).toBeNull();
    expect(row({}, { statusOf: status("checking") }).mark).toBeNull();
    const missed = row({ kind: "missed", data: { name: "Bins out" } });
    expect(missed.detail).toBe(WALL_FEED_COPY.missedWord);
    expect(missed.mark).toBe(STATUS_MARK.missed.icon);
    expect(missed.label).toBe("Megan missed Bins out, Missed, 3h");
    expect(row({ kind: "joined" }).mark).toBeNull();
  });

  it("gives a housemate's tick the Nice one toggle, and your own only what the house gave it", () => {
    expect(row().nice).toBe(true);
    expect(row({ kind: "late" }).nice).toBe(true);
    expect(row({ user_id: "sam" }).nice).toBe(false);
    expect(row({ kind: "missed" }).nice).toBe(false);
    expect(row({ kind: "joined" }).reactable).toBe(false);
    expect(row({ kind: "missed" }).reactable).toBe(true);
  });

  it("quotes a dispute's reason and names whose John it was", () => {
    const r = row({
      kind: "disputed",
      user_id: "megan",
      data: { name: "Clean the bathroom", against: "priya", reason: "Shower drain's still full of hair" },
    });
    expect(r.title).toBe("Megan disputed Priya’s tick on Clean the bathroom");
    expect(r.detail).toBe("“Shower drain's still full of hair”");
    expect(row({ kind: "disputed", data: { name: "Bins", against: "sam" } }).title).toBe("Megan disputed your tick on Bins");
    expect(row({ kind: "disputed", data: { name: "Bins", against: "sam" } }).detail).toBeNull();
  });

  it("gives the house's own verdicts no plate", () => {
    const upheld = row({ kind: "upheld", user_id: null, data: { name: "Bins out", against: "tom" } });
    expect(upheld.title).toBe("Tom’s Bins out was struck out");
    expect(upheld.actor).toBeNull();
    expect(upheld.icon).toBe("gavel");
    expect(row({ kind: "rejected", user_id: null, data: { name: "Bins out", against: "sam" } }).title).toBe(
      "Your Bins out stands",
    );
    const closed = row({ kind: "month_closed", user_id: null, data: { month: "2026-09" } });
    expect(closed.title).toBe("September is closed");
    expect(closed.detail).toBe(WALL_FEED_COPY.sharedOut);
    expect(closed.actor).toBeNull();
  });

  it("says who is away, and what that moved", () => {
    const away = { kind: "away", data: { starts_on: "2026-10-29", ends_on: "2026-11-01", moved: 0 } };
    expect(row(away).title).toBe("Megan is away 29 Oct–1 Nov");
    expect(row(away).detail).toBe(WALL_FEED_COPY.timeAway);
    expect(row({ ...away, user_id: "sam", data: { ...away.data, moved: 1 } }).title).toBe("You’re away 29 Oct–1 Nov");
    expect(row({ ...away, user_id: "sam", data: { ...away.data, moved: 1 } }).detail).toBe(
      "Time away. 1 John due before you go",
    );
    expect(row({ ...away, data: { ...away.data, moved: 2 } }).detail).toBe("Time away. 2 Johns due before they go");
  });

  it("tells perks, immunity, swaps and new housemates", () => {
    expect(row({ kind: "immunity_earned", data: { streak: 4 } }).title).toBe("Megan earned a skip");
    expect(row({ kind: "immunity_earned", data: { streak: 4 } }).detail).toBe("4 clean weeks in a row");
    expect(row({ kind: "swap_earned", data: {} }).title).toBe("Megan topped the week");
    expect(row({ kind: "immunity_used", data: { name: "Bins" } }).title).toBe("Megan skipped Bins");
    expect(row({ kind: "swap_used", data: { gave: "Bins", took: "Hoover", with: "sam" } }).title).toBe(
      "Megan swapped Bins for your Hoover",
    );
    expect(row({ kind: "joined", data: {} }).title).toBe("Megan moved in");
    // A family's Wall: someone joins the family.
    expect(row({ kind: "joined", data: {} }, { words: wordsFor("en", "family") }).title).toBe("Megan joined the family");
    expect(row({ kind: "joined", data: {} }, { words: wordsFor("en", "family") }).detail).toBe("New in the family");
    expect(row({ kind: "moving_out", data: { on: "2026-11-11" } }).title).toBe("Megan moves out on Wed 11 Nov");
    expect(row({ kind: "moving_out", data: { on: "2026-11-11" } }).detail).toBe("Moving out");
    expect(row({ kind: "moving_out", data: { on: null } }).title).toBe("Megan is staying after all");
    // Gone from the house, so named from the post itself.
    expect(row({ kind: "moved_out", user_id: "gone", data: { who: "Sam Hill" } }).title).toBe("Sam moved out");
    expect(row({ kind: "moved_out", user_id: "gone", data: {} }).title).toMatch(/moved out$/);
    expect(row({ kind: "something_new", data: {} }).title).toBe("something_new");
  });

  it("names someone who has left as someone who left, with no plate", () => {
    const r = row({ user_id: "gone" });
    expect(r.title).toBe("Someone who left ticked Wipe down the kitchen");
    expect(r.actor).toBeNull();
    expect(row({ kind: "disputed", data: { name: "Bins", against: "gone", reason: "No" } }).title).toBe(
      "Megan disputed someone who left’s tick on Bins",
    );
  });

  describe("a payment", () => {
    const paid = { kind: "paid", user_id: "tom", data: { to: "sam", amount: 134 } };

    it("shows its amount to whoever was paid, and to whoever paid", () => {
      expect(row(paid).title).toBe("Tom paid you £1.34");
      expect(row(paid, { me: "tom" }).title).toBe("You paid Sam £1.34");
      expect(row(paid).detail).toBe(WALL_FEED_COPY.settled);
    });

    it("tells everyone else only that it was paid", () => {
      const r = row(paid, { me: "priya" });
      expect(r.title).toBe("Tom paid Sam");
      expect(r.title).not.toMatch(/£/);
    });

    it("decides who may see it from who paid and who was paid", () => {
      const e = event(paid);
      expect(paymentShown(e, "tom")).toBe(true);
      expect(paymentShown(e, "sam")).toBe(true);
      expect(paymentShown(e, "megan")).toBe(false);
    });
  });

  it("opens this week's John from its row, at the vote while its dispute waits on you", () => {
    const status = (s: string) => (id: string) => (id === "a1" ? (s as never) : undefined);
    expect(row({}, { statusOf: status("checking") }).board).toEqual({ assignmentId: "a1", vote: false });
    // Off the board (an older week, or a re-deal), the row has no John to open.
    expect(row().board).toBeNull();
    expect(row({ assignment_id: "a9" }, { statusOf: status("checking") }).board).toBeNull();
    expect(row({ kind: "joined", assignment_id: null }, { statusOf: status("checking") }).board).toBeNull();
    // A dispute: everyone but the John's owner votes, the one who raised it included.
    const dispute = { kind: "disputed", data: { name: "Clean the bathroom", against: "priya", reason: "Hair" } };
    expect(row(dispute, { statusOf: status("disputed") }).board).toEqual({ assignmentId: "a1", vote: true });
    expect(row(dispute, { statusOf: status("disputed"), me: "megan" }).board?.vote).toBe(true);
    expect(row(dispute, { statusOf: status("disputed"), me: "priya" }).board?.vote).toBe(false);
    // The tick itself, while it's disputed: yours, you can't vote on.
    expect(row({}, { statusOf: status("disputed") }).board?.vote).toBe(true);
    expect(row({}, { statusOf: status("disputed"), me: "megan" }).board?.vote).toBe(false);
    // Settled, there's nothing to vote on.
    expect(row(dispute, { statusOf: status("done") }).board?.vote).toBe(false);
  });

  it("says the meta line in full for its sheet, with the day and the time", () => {
    const dispute = row({
      kind: "disputed",
      created_at: "2026-10-26T09:39:00Z",
      data: { name: "Clean the bathroom", against: "priya", reason: "Shower drain's still full of hair and the plughole" },
    });
    expect(dispute.full).toBe("“Shower drain's still full of hair and the plughole”\nToday, 09:39");
    expect(row({ kind: "joined", created_at: "2026-10-25T23:30:00Z" }).full).toBe("New housemate\nYesterday, 23:30");
    // Before the clocks went back, London was an hour ahead.
    expect(row({ kind: "joined", created_at: "2026-10-24T22:40:00Z" }).full).toBe("New housemate\nSat 24 Oct, 23:40");
    expect(row({ kind: "something_new", created_at: "2026-10-26T09:39:00Z" }).full).toBe("Today, 09:39");
  });

  it("tells a screen reader the sentence, then the meta line", () => {
    expect(row().label).toBe("Megan ticked Wipe down the kitchen, On time, 3h");
    expect(row({ kind: "something_new" }).label).toBe("something_new, 3h");
  });

  it("names a John or a month the event leaves out, rather than failing", () => {
    expect(row({ data: {} }).title).toBe(`Megan ticked ${WALL_FEED_COPY.aJohn}`);
    expect(row({ data: {} }).john).toBeNull();
    for (const data of [{}, { month: "" }, { month: "2026-13" }, { month: "soon" }]) {
      expect(row({ kind: "month_closed", user_id: null, data }).title).toBe("The month is closed");
    }
  });

  it("sets the time as a clock in the house's zone for the Wall's days", () => {
    expect(row({ created_at: "2026-10-26T13:10:00Z" }, { clock: true }).when).toBe("13:10");
    expect(row({ created_at: "2026-10-20T13:10:00Z" }, { clock: true }).when).toBe("14:10");
  });
});

describe("topReaction", () => {
  const reactions = (counts: Partial<Record<"nice" | "fire" | "sparkle" | "eyes", number>>) =>
    event({
      reactions: Object.entries(counts).flatMap(([kind, n]) =>
        Array.from({ length: n ?? 0 }, (_, i) => ({ user_id: `u${i}`, kind })),
      ),
    }).reactions;

  it("is nothing before anyone reacts", () => {
    expect(topReaction(reactions({}))).toBeNull();
  });

  it("is the one given most, the first of them on a tie", () => {
    expect(topReaction(reactions({ fire: 1 }))).toEqual({ kind: "fire", count: 1 });
    expect(topReaction(reactions({ nice: 1, eyes: 3 }))).toEqual({ kind: "eyes", count: 3 });
    expect(topReaction(reactions({ sparkle: 2, fire: 2 }))).toEqual({ kind: "fire", count: 2 });
  });
});

describe("wallFeedRow on flags, undos and resets", () => {
  const dueAt = new Date(NOW.getTime() + (11 * 60 + 40) * 60_000).toISOString();
  const flag = (data: Record<string, unknown>, status?: string) =>
    row(
      { kind: "flagged", user_id: "tom", data: { name: "Bins", due_at: dueAt, ...data } },
      status ? { statusOf: () => status as never } : {},
    );

  it("names the John, who flagged it and who's on call, with how long is left while it's open", () => {
    const r = flag({ by: "megan" }, "due-soon");
    expect(r.title).toBe("Megan flagged Bins for Tom");
    expect(r.parts).toEqual([
      { text: "Megan", bold: true },
      { text: " flagged " },
      { text: "Bins", bold: true },
      { text: " for " },
      { text: "Tom", bold: true },
    ]);
    // 15:00 GMT plus 11h40 is 02:40 the next day.
    expect(r.detail).toBe("Tom’s on call, due by Tue 02:40");
    expect(r.open).toEqual({ left: "11h left", late: false });
    expect(r.family).toBe("flag");
    expect(r.icon).toBe("flag");
    // The flagger leads the row.
    expect(r.actor?.userId).toBe("megan");
    expect(r.label).toBe("Megan flagged Bins for Tom, Tom’s on call, due by Tue 02:40, 11h left, 3h");
  });

  it("speaks to you when it's yours, and says when it's late", () => {
    const late = new Date(NOW.getTime() - 40 * 60_000).toISOString();
    const r = row(
      { kind: "flagged", user_id: "sam", data: { name: "Bins", by: "megan", due_at: late } },
      { statusOf: () => "overdue" },
    );
    expect(r.title).toBe("Megan flagged Bins for you");
    expect(r.detail).toBe("You’re on call, due by 14:20");
    expect(r.open).toEqual({ left: "40 min late", late: true });
  });

  it("says a flag someone raised on their own John, and one the clock raised again", () => {
    expect(flag({ by: "tom" }, "upcoming").title).toBe("Tom flagged Bins");
    const again = flag({ by: null }, "upcoming");
    expect(again.title).toBe("Bins was flagged again after a miss");
    expect(again.actor).toBeNull();
  });

  it("goes quiet once it's settled, saying how it went", () => {
    for (const [status, detail] of [
      ["done", "Tom did it"],
      ["checking", "Tom ticked it"],
      ["missed", "Tom missed it"],
      [undefined, "Tom was on call"],
    ] as const) {
      const r = flag({ by: "megan" }, status);
      expect(r.detail).toBe(detail);
      expect(r.open).toBeNull();
      expect(r.family).toBe("notice");
    }
  });

  it("says an admin's undo and reset, never the event's kind", () => {
    const undone = row({ kind: "undone", user_id: "tom", data: { by: "priya", what: "tick", name: "Bins" } });
    expect(undone.title).toBe("Priya undid Tom’s tick on Bins");
    expect(undone.actor?.userId).toBe("priya");
    expect(undone.icon).toBe("undo");
    const reset = row({ kind: "reset", user_id: "priya", data: { what: "person_week", subject: "tom" } });
    expect(reset.title).toBe("Priya reset Tom’s week");
    expect(reset.detail).toBe("An admin’s fix");
  });

  it("sorts each kind into its family", () => {
    const family = (kind: string) => row({ kind }).family;
    expect(["done", "late", "covered", "rejected"].map(family)).toEqual(["done", "done", "done", "done"]);
    expect(["missed", "disputed", "upheld"].map(family)).toEqual(["trouble", "trouble", "trouble"]);
    expect(["immunity_earned", "swap_used"].map(family)).toEqual(["perk", "perk"]);
    expect(["joined", "paid", "month_closed"].map(family)).toEqual(["notice", "notice", "notice"]);
    expect(row({ kind: "away", data: { starts_on: "2026-10-28", ends_on: "2026-10-30" } }).family).toBe("notice");
    expect(row({ kind: "disputed", data: { name: "Bins", against: "tom" } }).icon).toBe("gavel");
  });
});

describe("wallDays", () => {
  const at = (iso: string, overrides: Partial<WallRow> = {}): WallFeedRow =>
    wallFeedRow(event({ id: iso, created_at: iso, ...overrides }), scene({ clock: true }));

  it("is nothing for an empty Wall", () => {
    expect(wallDays([], ZONE, NOW)).toEqual([]);
  });

  it("groups by the house's day, latest first, naming today and yesterday", () => {
    const days = wallDays(
      [
        at("2026-10-26T12:00:00Z", { kind: "joined" }),
        at("2026-10-25T23:30:00Z", { kind: "joined" }),
        at("2026-10-24T22:30:00Z", { kind: "joined" }),
        at("2026-10-20T09:00:00Z", { kind: "joined" }),
      ],
      ZONE,
      NOW,
    );
    expect(days.map((d) => [d.date, d.label, d.sub, d.items.length])).toEqual([
      ["2026-10-26", "Today", "Mon 26 Oct", 1],
      ["2026-10-25", "Yesterday", "Sun 25 Oct", 1],
      // 22:30 UTC on the 24th is 23:30 in London, still summer time.
      ["2026-10-24", "Sat 24 Oct", null, 1],
      ["2026-10-20", "Tue 20 Oct", null, 1],
    ]);
  });

  it("folds two or more ticks by one person in a row, and never across people or days", () => {
    const days = wallDays(
      [
        at("2026-10-26T14:00:00Z"),
        at("2026-10-26T13:00:00Z", { kind: "late" }),
        at("2026-10-26T12:00:00Z"),
        at("2026-10-26T11:00:00Z", { user_id: "tom" }),
        at("2026-10-26T10:00:00Z", { kind: "joined" }),
        at("2026-10-26T09:00:00Z", { user_id: "sam" }),
        at("2026-10-26T08:00:00Z", { user_id: "sam", kind: "missed" }),
        at("2026-10-25T23:00:00Z", { user_id: "sam", kind: "missed" }),
      ],
      ZONE,
      NOW,
    );
    const [today, yesterday] = days;
    expect(today.items.map((item) => ("fold" in item ? item.fold.label : item.row.title))).toEqual([
      "Megan ticked 3 Johns",
      "Tom ticked Wipe down the kitchen",
      "Megan moved in",
      "You ticked Wipe down the kitchen",
      "You missed Wipe down the kitchen",
    ]);
    const fold = today.items[0];
    expect("fold" in fold && fold.fold.rows.map((r) => r.id)).toEqual([
      "2026-10-26T14:00:00Z",
      "2026-10-26T13:00:00Z",
      "2026-10-26T12:00:00Z",
    ]);
    expect(yesterday.items).toHaveLength(1);
  });

  it("folds misses by one person too, and leaves news that never repeats alone", () => {
    const [day] = wallDays(
      [
        at("2026-10-26T14:00:00Z", { user_id: "tom", kind: "missed" }),
        at("2026-10-26T13:00:00Z", { user_id: "tom", kind: "missed" }),
        at("2026-10-26T12:00:00Z", { kind: "joined" }),
        at("2026-10-26T11:00:00Z", { kind: "joined" }),
      ],
      ZONE,
      NOW,
    );
    expect(day.items.map((item) => ("fold" in item ? item.fold.label : item.row.title))).toEqual([
      "Tom missed 2 Johns",
      "Megan moved in",
      "Megan moved in",
    ]);
  });
});

describe("houseSetupValues", () => {
  const RULES = { currency: "GBP" as const, stakeMinor: 2000, lateForfeitMinor: 100, missedForfeitMinor: 300 };
  const base = { rules: RULES, today: "2026-10-26", members: MEMBERS, me: "sam", admin: false };
  const period = (userId: string, startsOn: string, endsOn: string) => ({ id: `${userId}${startsOn}`, userId, startsOn, endsOn, note: null });

  it("waits for each read", () => {
    expect(houseSetupValues(base)).toEqual({
      johns: null,
      rules: "£20 stake, £1 late, £3 missed",
      away: null,
      groups: null,
      showGroups: false,
    });
  });

  it("counts the Johns and their effort in an average week", () => {
    const weekly = Array.from({ length: 13 }, () => ({ points: 2, everyWeeks: 1 }));
    expect(houseSetupValues({ ...base, johns: weekly }).johns).toBe("13 Johns, about 26 pts a week");
    expect(houseSetupValues({ ...base, johns: [{ points: 3, everyWeeks: 2 }] }).johns).toBe("1 John, about 2 pts a week");
    expect(houseSetupValues({ ...base, johns: [{ points: 1, everyWeeks: 1 }] }).johns).toBe("1 John, about 1 pt a week");
    expect(houseSetupValues({ ...base, johns: [{ points: 1, everyWeeks: 4 }] }).johns).toBe("1 John, less than 1 pt a week");
    expect(houseSetupValues({ ...base, johns: [] }).johns).toBe(HOUSE_LOWER_COPY.noJohns);
  });

  it("states the money rules, pence included, and a house with no stake", () => {
    expect(houseSetupValues({ ...base, rules: { ...RULES, lateForfeitMinor: 50, missedForfeitMinor: 0 } }).rules).toBe(
      "£20 stake, £0.50 late, £0 missed",
    );
    expect(houseSetupValues({ ...base, rules: { ...RULES, stakeMinor: 0, currency: "EUR" } }).rules).toBe(
      "No stake, €1 late, €3 missed",
    );
  });

  it("names who is away next, today's included, and nobody when nobody is", () => {
    const away = [period("megan", "2026-10-29", "2026-11-01"), period("tom", "2026-11-05", "2026-11-06")];
    expect(houseSetupValues({ ...base, away }).away).toBe("Megan, 29 Oct–1 Nov");
    const now = [...away, period("tom", "2026-10-20", "2026-10-26")];
    expect(houseSetupValues({ ...base, away: now }).away).toBe("Tom, 20–26 Oct");
    expect(houseSetupValues({ ...base, away: [period("sam", "2026-10-28", "2026-10-28")] }).away).toBe("You, Wed 28 Oct");
    expect(houseSetupValues({ ...base, away: [period("tom", "2026-10-20", "2026-10-25")] }).away).toBe(
      HOUSE_LOWER_COPY.nobodyAway,
    );
    expect(houseSetupValues({ ...base, away: [] }).away).toBe(HOUSE_LOWER_COPY.nobodyAway);
  });

  it("breaks a tie by who comes back first, then by name, and skips anyone who has left", () => {
    const tie = [
      period("tom", "2026-10-29", "2026-10-31"),
      period("priya", "2026-10-29", "2026-10-31"),
      period("megan", "2026-10-29", "2026-11-03"),
      period("gone", "2026-10-27", "2026-10-28"),
    ];
    expect(houseSetupValues({ ...base, away: tie }).away).toBe("Priya, 29–31 Oct");
  });

  it("shows Groups to admins, and to everyone once a group exists", () => {
    expect(houseSetupValues({ ...base, groups: 0 })).toMatchObject({ groups: "None", showGroups: false });
    expect(houseSetupValues({ ...base, admin: true, groups: 0 })).toMatchObject({ groups: "None", showGroups: true });
    expect(houseSetupValues({ ...base, groups: 2 })).toMatchObject({ groups: "2 groups", showGroups: true });
    expect(houseSetupValues({ ...base, groups: 1 }).groups).toBe("1 group");
    expect(houseSetupValues({ ...base, admin: true })).toMatchObject({ groups: null, showGroups: true });
  });
});

describe("leaveBar", () => {
  const admin = { userId: "sam", role: "admin" as const };
  const member = (userId: string) => ({ userId, role: "member" as const });

  it("stops the only admin of a house with others in it, as the database would", () => {
    expect(leaveBar("sam", [admin, member("tom")])).toBe("last-admin");
    expect(leaveBar("sam", [admin, { userId: "tom", role: "admin" }])).toBeNull();
    expect(leaveBar("tom", [admin, member("tom")])).toBeNull();
  });

  it("says when the last one out would leave the house empty", () => {
    expect(leaveBar("sam", [admin])).toBe("last-one");
    expect(leaveBar("tom", [member("tom")])).toBe("last-one");
  });
});

describe("leaveCost", () => {
  const base = { me: "sam", month: "2026-10", share: 333, transfers: [], members: MEMBERS, currency: "GBP" as const };

  it("costs your share so far of the month's forfeits", () => {
    expect(leaveCost(base)).toBe("You’ll lose the £3.33 coming to you from October’s forfeits.");
    expect(leaveCost({ ...base, share: 1000 })).toBe("You’ll lose the £10 coming to you from October’s forfeits.");
    expect(leaveCost({ ...base, month: "" })).toBe("You’ll lose the £3.33 coming to you from this month’s forfeits.");
  });

  it("names every settle-up still open with you, owed to you first", () => {
    expect(leaveCost({ ...base, transfers: [{ from: "tom", to: "sam", amount: 134 }] })).toBe(
      "You’ll lose the £3.33 coming to you from October’s forfeits, and Tom still owes you £1.34.",
    );
    expect(
      leaveCost({
        ...base,
        transfers: [
          { from: "sam", to: "priya", amount: 200 },
          { from: "tom", to: "sam", amount: 134 },
          { from: "tom", to: "megan", amount: 500 },
        ],
      }),
    ).toBe("You’ll lose the £3.33 coming to you from October’s forfeits, Tom still owes you £1.34, and you still owe Priya £2.");
  });

  it("leaves the share out when there's nothing to lose: no forfeits, no stake, or only your own", () => {
    // Tom forfeited this month's only money, so his share of it is nothing.
    expect(
      leaveCost({
        ...base,
        me: "tom",
        share: 0,
        transfers: [
          { from: "tom", to: "priya", amount: 534 },
          { from: "tom", to: "sam", amount: 401 },
        ],
      }),
    ).toBe("You still owe Priya £5.34, and you still owe Sam £4.01.");
    expect(leaveCost({ ...base, share: 0, transfers: [{ from: "sam", to: "priya", amount: 200 }] })).toBe(
      "You still owe Priya £2.",
    );
  });

  it("costs nothing when square with nothing to share", () => {
    expect(leaveCost({ ...base, share: 0 })).toBe(HOUSE_LOWER_COPY.costsNothing);
    // Settling up between two others is theirs.
    expect(leaveCost({ ...base, share: 0, transfers: [{ from: "tom", to: "priya", amount: 100 }] })).toBe(
      HOUSE_LOWER_COPY.costsNothing,
    );
  });

  it("rounds nothing: pence stay pence", () => {
    expect(leaveCost({ ...base, share: 1, transfers: [] })).toBe("You’ll lose the £0.01 coming to you from October’s forfeits.");
  });

  it("names someone who has left as someone who left", () => {
    expect(leaveCost({ ...base, share: 0, transfers: [{ from: "gone", to: "sam", amount: 100 }] })).toBe(
      "Someone who left still owes you £1.",
    );
  });
});

describe("wallFeedRow for a cover", () => {
  it("says who covered whose John", () => {
    const covered = { kind: "covered", user_id: "megan", data: { name: "Bins", for: "tom" } };
    expect(row(covered).title).toBe("Megan covered Tom’s Bins");
    expect(row({ ...covered, user_id: "sam" }).title).toBe("You covered Tom’s Bins");
    expect(row({ ...covered, data: { name: "Bins", for: "sam" } }).title).toBe("Megan covered your Bins");
  });
});
