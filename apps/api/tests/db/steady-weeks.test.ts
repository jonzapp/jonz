import { addDaysTo, localDate, nextWeek, readDealt, weekStateOf, weekWindow, type IsoDow } from "@app/core";
import { tz } from "@date-fns/tz";
import { getHours } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as swapsRoute } from "@/app/api/swaps/route";
import { dealWeek, loadBalances, loadHouse, tickHouse, type PushMessage } from "@/lib/engine/tick";
import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek, weeksAgo, ZONE, type House } from "@/tests/support/factories";

/**
 * Steady weeks (docs/specs/steady-weeks.md) through the engine and the
 * database: the house's rules, what each deal keeps for the next, fresh
 * starts, preferences and Plan it. Which John goes to whom is @app/core
 * steady.ts, tested there; this is everything around it.
 */

const db = adminClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function rules(house: House, change: { deal_mode?: string; deal_budget?: number }) {
  expectOk(await house.admin.db.from("houses").update(change).eq("id", house.id));
}

async function weekRow(weekId: string) {
  const { data } = await db.from("weeks").select("turns, waiting, ahead").eq("id", weekId).single();
  return data!;
}

describe("house rules", () => {
  it("start a new house on Smart with a Usual budget, and are an admin's to change", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    expect(await reread("houses", house.id)).toMatchObject({ deal_mode: "smart", deal_budget: 4 });
    await rules(house, { deal_mode: "classic", deal_budget: 6 });
    expect(await reread("houses", house.id)).toMatchObject({ deal_mode: "classic", deal_budget: 6 });

    // A housemate's change touches nothing.
    await house.members[0].db.from("houses").update({ deal_budget: 2 }).eq("id", house.id);
    expect((await reread("houses", house.id)).deal_budget).toBe(6);
  });

  it("are only the modes and budgets the app offers", async () => {
    const house = await makeHouse(["Ava"]);
    expect((await house.admin.db.from("houses").update({ deal_budget: 3 }).eq("id", house.id)).error).not.toBeNull();
    expect((await house.admin.db.from("houses").update({ deal_mode: "random" }).eq("id", house.id)).error).not.toBeNull();
  });

  it("keep an on-call John off Keep its day, which needs a day", async () => {
    const house = await makeHouse(["Ava"]);
    await expect(addJohns(house.id, [{ name: "Dishwasher", onCall: {}, keepDay: true }], thisWeek())).rejects.toBeTruthy();
  });
});

describe("the budget", () => {
  it("leaves Johns past it waiting, keeps how long, and deals them first next week", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await rules(house, { deal_budget: 2 });
    const week = weeksAgo(3);
    await addJohns(house.id, ["Bins", "Hob", "Hoover", "Mop", "Shop"].map((name) => ({ name })), week);

    const one = await deal(house.id, week, week.startsAt);
    expect(one.assignments).toHaveLength(2);
    expect(new Set(one.assignments.map((a) => a.user_id)).size).toBe(2);
    const waiting = (await weekRow(one.weekId)).waiting as Record<string, number>;
    expect(Object.values(waiting)).toEqual([1, 1, 1]);

    const after = nextWeek(week, ZONE, 1);
    const two = await deal(house.id, after, after.startsAt);
    for (const a of two.assignments) {
      expect(Object.keys(waiting)).toContain(a.john_id);
      expect(readDealt(a.dealt)!.waited).toBe(1);
    }
  });

  it("always deals a John that keeps its day, on its day, whatever the budget", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await rules(house, { deal_budget: 2 });
    const week = weeksAgo(2);
    await addJohns(house.id, ["Bins", "Recycling", "Garden", "Hob"].map((name) => ({ name, keepDay: true, dueDow: 4 as IsoDow })), week);
    const { weekId, assignments } = await deal(house.id, week, week.startsAt);
    expect(assignments).toHaveLength(4);
    expect(assignments.every((a) => localDate(new Date(a.due_at), ZONE) === addDaysTo(week.startsOn, 3))).toBe(true);
    expect((await weekRow(weekId)).waiting).toEqual({});
  });

  it("has no limit at 0, so everything due is dealt", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await rules(house, { deal_budget: 0 });
    const week = weeksAgo(2);
    await addJohns(house.id, ["Bins", "Hob", "Hoover", "Mop", "Shop"].map((name) => ({ name })), week);
    const { weekId, assignments } = await deal(house.id, week, week.startsAt);
    expect(assignments).toHaveLength(5);
    expect((await weekRow(weekId)).waiting).toEqual({});
  });
});

describe("Classic", () => {
  it("takes turns in order, and keeps the order on the week for the next deal", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await rules(house, { deal_mode: "classic", deal_budget: 0 });
    let week = weeksAgo(4);
    await addJohns(house.id, [{ name: "Bathroom", points: 4 }], week);
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { weekId, assignments } = await deal(house.id, week, week.startsAt);
      expect(assignments).toHaveLength(1);
      got.push(assignments[0].user_id);
      const turns = (await weekRow(weekId)).turns as Record<string, string[]>;
      expect(turns[assignments[0].john_id!].at(-1)).toBe(assignments[0].user_id);
      if (i > 0) expect(readDealt(assignments[0].dealt)!.by).toBe("turn");
      week = nextWeek(week, ZONE, 1);
    }
    expect(new Set(got)).toEqual(new Set(house.everyone.map((x) => x.userId)));
  });

  it("keeps the next two weeks on the week, and next week's deal bears them out", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await rules(house, { deal_mode: "classic", deal_budget: 0 });
    const week = weeksAgo(2);
    await addJohns(house.id, [{ name: "Bathroom", points: 4 }], week);
    const first = await deal(house.id, week, week.startsAt);
    const { ahead } = weekStateOf(await weekRow(first.weekId));
    const next = nextWeek(week, ZONE, 1);
    expect(ahead.map((w) => w.startsOn)).toEqual([next.startsOn, nextWeek(next, ZONE, 1).startsOn]);
    const johnId = first.assignments[0].john_id!;
    const said = ahead.map((w) => w.johns[johnId]);
    expect(said.flat()).not.toContain(first.assignments[0].user_id);

    const second = await deal(house.id, next, next.startsAt);
    expect([second.assignments[0].user_id]).toEqual(said[0]);
  });

  it("keeps no order on the week in Smart", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = weeksAgo(1);
    await addJohns(house.id, [{ name: "Bins" }], week);
    const { weekId } = await deal(house.id, week, week.startsAt);
    expect((await weekRow(weekId)).turns).toBeNull();
  });
});

describe("a missed John", () => {
  const after = (week: { endsAt: Date; startsOn: string; startsAt: Date }) => nextWeek(week, ZONE, 1);
  it("comes back to whoever missed it, in the next deal", async () => {
    for (let i = 0; i < 3; i++) {
      const house = await makeHouse(["Ava", "Ben"]);
      const week = weeksAgo(2);
      await addJohns(house.id, [{ name: "Bathroom", points: 4 }], week);
      const first = await deal(house.id, week, week.startsAt);
      const missed = first.assignments[0];
      expectOk(await db.from("assignments").update({ outcome: "missed", settled_at: after(week).startsAt.toISOString() }).eq("id", missed.id));

      const { assignments } = await deal(house.id, after(week), after(week).startsAt);
      expect(assignments[0].user_id).toBe(missed.user_id);
      expect(readDealt(assignments[0].dealt)!.by).toBe("back");
    }
  });
});

describe("fresh starts", () => {
  it("leaves someone who moved in after the week was dealt out of a re-deal, and starts them next Monday at 0", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = thisWeek();
    await addJohns(house.id, [{ name: "Bins" }, { name: "Hob" }, { name: "Hoover" }], week);
    await deal(house.id, week, week.startsAt);

    const dee = await signedInUser("Dee");
    expectOk(await dee.db.rpc("join_house", { p_code: house.code }));
    // An admin re-deals the week (POST /api/deal) on a lighter budget.
    await rules(house, { deal_budget: 2 });
    const { house: row, members } = await loadHouse(db, house.id);
    const { weekId } = await dealWeek(db, row, members, week, new Date(), true);
    const { data: dealt } = await db.from("assignments").select("user_id").eq("week_id", weekId!);
    expect(dealt!.some((a) => a.user_id === dee.userId)).toBe(false);
    expect(dealt).toHaveLength(2);
    const { data: shares } = await db.from("week_shares").select("user_id").eq("week_id", weekId!);
    expect(shares!.map((s) => s.user_id)).not.toContain(dee.userId);

    const after = nextWeek(week, ZONE, 1);
    const { balances } = await loadBalances(db, house.id, after.startsOn, [dee.userId]);
    expect(balances.get(dee.userId) ?? 0).toBe(0);
    const next = await deal(house.id, after, after.startsAt);
    expect(next.assignments.some((a) => a.user_id === dee.userId)).toBe(true);
  });

  it("deals a first week begun part-way through on the days still to come", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await rules(house, { deal_budget: 0 });
    const week = weeksAgo(2);
    await addJohns(house.id, [{ name: "Bins", dueDow: 1, keepDay: true }, { name: "Hoover", dueDow: 1 }, { name: "Hob", dueDow: 5 }], week);
    // Wednesday noon.
    const now = new Date(week.startsAt.getTime() + 2.5 * DAY);
    const { assignments } = await deal(house.id, week, now);
    // Monday's bins had gone: it sits this week out.
    expect(assignments.map((a) => a.name).sort()).toEqual(["Hob", "Hoover"]);
    for (const a of assignments) expect(Date.parse(a.due_at)).toBeGreaterThan(now.getTime());
    expect(readDealt(assignments.find((a) => a.name === "Hoover")!.dealt)!.moved).toBe("gone");
  });
});

describe("time zones", () => {
  it("deals a week that starts on Sunday in New York, through the clocks going back", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    expectOk(await db.from("houses").update({ timezone: "America/New_York", week_starts: 7 }).eq("id", house.id));
    const zone = "America/New_York";
    const week = weekWindow(new Date("2026-11-04T12:00:00Z"), zone, 7);
    await addJohns(
      house.id,
      [
        { name: "Bins", dueDow: 7, dueTime: "09:00", keepDay: true },
        { name: "Recycling", dueDow: 6, dueTime: "21:00", keepDay: true },
      ],
      week,
    );
    const { assignments } = await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));
    const at = (name: string) => new Date(assignments.find((a) => a.name === name)!.due_at);
    expect(localDate(at("Bins"), zone)).toBe("2026-11-01");
    expect(getHours(at("Bins"), { in: tz(zone) })).toBe(9);
    expect(localDate(at("Recycling"), zone)).toBe("2026-11-07");
    expect(getHours(at("Recycling"), { in: tz(zone) })).toBe(21);
  });
});

describe("two deals at once", () => {
  it("make one week", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = weeksAgo(1);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Hob" }], week);
    const { house: row, members } = await loadHouse(db, house.id);
    // The race is the point here, so these really do run at once.
    const both = await Promise.all([
      dealWeek(db, row, members, week, week.startsAt, false),
      dealWeek(db, row, members, week, week.startsAt, false),
    ]);
    expect(both.filter((r) => r.weekId).length).toBe(1);
    const { data } = await db.from("assignments").select("id").eq("house_id", house.id);
    expect(data).toHaveLength(2);
  });
});

describe("save_prefs", () => {
  async function prefsHouse() {
    const house = await makeHouse(["Ava", "Ben"]);
    const johns = await addJohns(house.id, [{ name: "Bins" }, { name: "Hob" }], thisWeek());
    return { house, bins: johns[0].id, hob: johns[1].id };
  }

  it("keeps your days, best time and rather do or not, for this house's Johns only", async () => {
    const { house, bins, hob } = await prefsHouse();
    const other = await makeHouse(["Zed"]);
    const [theirs] = await addJohns(other.id, [{ name: "Theirs" }], thisWeek());
    const ben = house.members[0];
    expectOk(
      await ben.db.rpc("save_prefs", {
        p_house: house.id,
        p_days: [7, 6, 6],
        p_best_time: "evening",
        p_rather: { [bins]: 1, [hob]: -1, [theirs.id]: 1, nonsense: 1 },
      }),
    );
    const { data } = await db.from("members").select("suits_days, best_time, rather").eq("user_id", ben.userId).single();
    expect(data).toEqual({ suits_days: [6, 7], best_time: "evening", rather: { [bins]: 1, [hob]: -1 } });

    // Housemates can see them (the swap suggestion needs to); nobody else can.
    const { data: seen } = await house.admin.db.from("members").select("rather").eq("user_id", ben.userId).single();
    expect(seen!.rather).toEqual({ [bins]: 1, [hob]: -1 });
    const { data: hidden } = await other.admin.db.from("members").select("rather").eq("user_id", ben.userId);
    expect(hidden).toEqual([]);
  });

  it("clears them all with none", async () => {
    const { house, bins } = await prefsHouse();
    const ava = house.admin;
    expectOk(await ava.db.rpc("save_prefs", { p_house: house.id, p_days: [1], p_best_time: "morning", p_rather: { [bins]: 1 } }));
    expectOk(await ava.db.rpc("save_prefs", { p_house: house.id, p_days: [], p_best_time: null as unknown as string, p_rather: {} }));
    const { data } = await db.from("members").select("suits_days, best_time, rather").eq("user_id", ava.userId).single();
    expect(data).toEqual({ suits_days: [], best_time: null, rather: {} });
  });

  it("refuses days, times and choices that aren't real", async () => {
    const { house, bins } = await prefsHouse();
    const save = (p: { p_days?: number[]; p_best_time?: string; p_rather?: unknown }) =>
      house.admin.db.rpc("save_prefs", {
        p_house: house.id,
        p_days: p.p_days ?? [],
        p_best_time: (p.p_best_time ?? null) as unknown as string,
        p_rather: (p.p_rather ?? {}) as Record<string, number>,
      });
    expectRule(await save({ p_days: [8] }), "bad_prefs");
    expectRule(await save({ p_best_time: "night" }), "bad_prefs");
    expectRule(await save({ p_rather: [bins] }), "bad_prefs");
  });

  it("is only for your own house, and only through save_prefs", async () => {
    const { house } = await prefsHouse();
    const stranger = await signedInUser("Stranger");
    expectDenied(await stranger.db.rpc("save_prefs", { p_house: house.id, p_days: [1], p_best_time: "morning", p_rather: {} }));
    expectDenied(await house.admin.db.from("members").update({ suits_days: [1] }).eq("user_id", house.admin.userId));
  });

  it("change the deal: a John goes to whoever would rather do it, on a day that suits them", async () => {
    for (let i = 0; i < 3; i++) {
      const house = await makeHouse(["Ava", "Ben"]);
      // Level, with no limit: "rather do" decides it.
      await rules(house, { deal_budget: 0 });
      const week = weeksAgo(1);
      const [hoover] = await addJohns(house.id, [{ name: "Hoover", dueDow: 2 }], week);
      const ben = house.members[0];
      expectOk(await ben.db.rpc("save_prefs", { p_house: house.id, p_days: [6], p_best_time: "morning", p_rather: { [hoover.id]: 1 } }));
      const { assignments } = await deal(house.id, week, week.startsAt);
      expect(assignments[0].user_id).toBe(ben.userId);
      expect(localDate(new Date(assignments[0].due_at), ZONE)).toBe(addDaysTo(week.startsOn, 5));
    }
  });
});

describe("plan_john", () => {
  async function planHouse() {
    // Next week, which is always ahead of the real clock, so "soon" (its second day) is a good time whenever this runs.
    const house = await makeHouse(["Ava", "Ben"]);
    const week = nextWeek(thisWeek(), ZONE, 1);
    await addJohns(house.id, [{ name: "Bins" }], week);
    const { weekId, assignments } = await deal(house.id, week, week.startsAt);
    const { data: w } = await db.from("weeks").select("ends_at").eq("id", weekId).single();
    const ends = Date.parse(w!.ends_at);
    const bins = assignments[0];
    return { house, bins, owner: actorFor(house, bins.user_id), ends, soon: new Date(week.startsAt.getTime() + 24 * HOUR) };
  }

  it("is the holder's, for a time from now to the week's end, and clears with null", async () => {
    const { house, bins, owner, ends, soon } = await planHouse();
    expectOk(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: soon.toISOString() }));
    expect(Date.parse((await reread("assignments", bins.id)).planned_at as string)).toBe(soon.getTime());

    expectDenied(await someoneElse(house, owner.userId).db.rpc("plan_john", { p_assignment: bins.id, p_at: soon.toISOString() }));
    const stranger = await signedInUser("Stranger");
    expectRule(await stranger.db.rpc("plan_john", { p_assignment: bins.id, p_at: soon.toISOString() }), "not_found");
    expectRule(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: new Date(Date.now() - HOUR).toISOString() }), "plan_time");
    expectRule(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: new Date(ends + HOUR).toISOString() }), "plan_time");

    expectOk(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: null as unknown as string }));
    expect((await reread("assignments", bins.id)).planned_at).toBeNull();
  });

  it("can't plan a John that's done", async () => {
    const { bins, owner, soon } = await planHouse();
    expectOk(await db.from("assignments").update({ done_at: new Date().toISOString() }).eq("id", bins.id));
    expectRule(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: soon.toISOString() }), "already_settled");
  });

  it("is left behind when the John changes hands", async () => {
    const { house, bins, owner, soon } = await planHouse();
    expectOk(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: soon.toISOString() }));
    expectOk(await db.from("assignments").update({ user_id: someoneElse(house, owner.userId).userId }).eq("id", bins.id));
    expect((await reread("assignments", bins.id)).planned_at).toBeNull();
  });
});

describe("asking to swap a John you'd rather not", () => {
  async function swapHouse(names = ["Ava", "Ben"]) {
    const house = await makeHouse(names);
    const week = thisWeek();
    const [bins, hob] = await addJohns(house.id, [{ name: "Bins" }, { name: "Hob" }], week);
    const { assignments } = await deal(house.id, week, new Date());
    const [ava, ben] = [house.admin, house.members[0]];
    const mine = assignments.find((a) => a.john_id === bins.id)!;
    const theirs = assignments.find((a) => a.john_id === hob.id)!;
    // Ava has Bins, Ben has Hob, and Ben would rather do Bins.
    expectOk(await db.from("assignments").update({ user_id: ava.userId }).eq("id", mine.id));
    expectOk(await db.from("assignments").update({ user_id: ben.userId }).eq("id", theirs.id));
    expectOk(await ben.db.rpc("save_prefs", { p_house: house.id, p_days: [], p_best_time: null as unknown as string, p_rather: { [bins.id]: 1 } }));
    return { house, ava, ben, mine, theirs, bins };
  }

  /** Ava asks to swap; the ask's id. */
  async function ask(ava: { db: typeof db }, mine: { id: string }, theirs: { id: string }): Promise<string> {
    const res = await ava.db.rpc("offer_swap", { p_mine: mine.id, p_theirs: theirs.id });
    expectOk(res);
    return res.data as string;
  }

  it("asks a housemate who'd rather do yours, until tonight, and their yes swaps them", async () => {
    const { house, ava, ben, mine, theirs } = await swapHouse();
    const offer = await ask(ava, mine, theirs);
    const { data: seen } = await ben.db.from("swap_offers").select("asked_by, asked_to, mine, theirs, expires_at, answer").eq("id", offer);
    expect(seen).toHaveLength(1);
    expect(seen![0]).toMatchObject({ asked_by: ava.userId, asked_to: ben.userId, mine: mine.id, theirs: theirs.id, answer: null });
    // Tonight: midnight in the house's zone.
    const expires = new Date(seen![0].expires_at);
    expect(expires.getTime()).toBeGreaterThan(Date.now());
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + DAY);
    expect(localDate(new Date(expires.getTime() - 1), ZONE)).toBe(localDate(new Date(), ZONE));

    expectOk(await ben.db.rpc("answer_swap", { p_offer: offer, p_accept: true }));
    expect((await reread("assignments", mine.id)).user_id).toBe(ben.userId);
    expect((await reread("assignments", theirs.id)).user_id).toBe(ava.userId);
    expect((await reread("swap_offers", offer)).answer).toBe("accepted");
    const { data: events } = await db.from("events").select("kind, user_id, data").eq("house_id", house.id).eq("kind", "swap_used");
    expect(events).toEqual([{ kind: "swap_used", user_id: ava.userId, data: { gave: "Bins", took: "Hob", with: ben.userId, asked: true } }]);
    // Answered, it can't be answered again.
    expectRule(await ben.db.rpc("answer_swap", { p_offer: offer, p_accept: true }), "swap_gone");
  });

  it("leaves them as they were after a no, or with no answer by tonight", async () => {
    const { ava, ben, mine, theirs } = await swapHouse();
    const first = await ask(ava, mine, theirs);
    expectRule(await ava.db.rpc("offer_swap", { p_mine: mine.id, p_theirs: theirs.id }), "already_asked");
    expectOk(await ben.db.rpc("answer_swap", { p_offer: first, p_accept: false }));
    expect((await reread("swap_offers", first)).answer).toBe("declined");
    expect((await reread("assignments", mine.id)).user_id).toBe(ava.userId);

    const second = await ask(ava, mine, theirs);
    expectOk(await db.from("swap_offers").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", second));
    expectRule(await ben.db.rpc("answer_swap", { p_offer: second, p_accept: true }), "swap_gone");
    expect((await reread("assignments", mine.id)).user_id).toBe(ava.userId);
    // An ask that ran out lets the John be asked about again.
    await ask(ava, mine, theirs);
  });

  it("is only for someone who'd rather do it, with open Johns, and changes nothing once either has moved on", async () => {
    const { ava, ben, mine, theirs } = await swapHouse();
    // Ben would rather do Bins, not the other way round.
    expectRule(await ben.db.rpc("offer_swap", { p_mine: theirs.id, p_theirs: mine.id }), "not_swappable");
    expectDenied(await ben.db.rpc("offer_swap", { p_mine: mine.id, p_theirs: theirs.id }));

    const offer = await ask(ava, mine, theirs);
    expectOk(await db.from("assignments").update({ done_at: new Date().toISOString() }).eq("id", theirs.id));
    expectRule(await ben.db.rpc("answer_swap", { p_offer: offer, p_accept: true }), "not_swappable");
    expect((await reread("assignments", mine.id)).user_id).toBe(ava.userId);
    expectRule(await ava.db.rpc("answer_swap", { p_offer: offer, p_accept: true }), "not_found");
  });

  it("is seen only by the two of them, and written only through its functions", async () => {
    const { house, ava, mine, theirs } = await swapHouse(["Ava", "Ben", "Cal"]);
    const offer = await ask(ava, mine, theirs);
    const cal = house.members[1];
    expect((await cal.db.from("swap_offers").select("id").eq("id", offer)).data).toEqual([]);
    const stranger = await signedInUser("Stranger");
    expect((await stranger.db.from("swap_offers").select("id").eq("id", offer)).data).toEqual([]);
    expectDenied(await ava.db.from("swap_offers").update({ answer: "accepted", answered_at: new Date().toISOString() }).eq("id", offer));
    expectDenied(
      await ava.db.from("swap_offers").insert({
        house_id: house.id,
        mine: mine.id,
        theirs: theirs.id,
        asked_by: ava.userId,
        asked_to: cal.userId,
        expires_at: new Date().toISOString(),
      }),
    );
  });
});

describe("POST /api/swaps", () => {
  const BASE = "http://localhost:3205/api/swaps";
  const savedOrigins = process.env.ALLOWED_ORIGINS;
  beforeAll(() => {
    process.env.ALLOWED_ORIGINS = "http://localhost:8205";
  });
  afterAll(() => {
    process.env.ALLOWED_ORIGINS = savedOrigins;
  });

  async function post(body: unknown, actor?: { db: typeof db }) {
    const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:8205" };
    if (actor) {
      const { data } = await actor.db.auth.getSession();
      headers.authorization = `Bearer ${data.session!.access_token}`;
    }
    return swapsRoute(new Request(BASE, { method: "POST", headers, body: JSON.stringify(body) }));
  }

  async function asking() {
    const house = await makeHouse(["Ava", "Ben"]);
    const [bins, hob] = await addJohns(house.id, [{ name: "Bins" }, { name: "Hob" }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const [ava, ben] = [house.admin, house.members[0]];
    const mine = assignments.find((a) => a.john_id === bins.id)!;
    const theirs = assignments.find((a) => a.john_id === hob.id)!;
    expectOk(await db.from("assignments").update({ user_id: ava.userId }).eq("id", mine.id));
    expectOk(await db.from("assignments").update({ user_id: ben.userId }).eq("id", theirs.id));
    expectOk(await ben.db.rpc("save_prefs", { p_house: house.id, p_days: [], p_best_time: null as unknown as string, p_rather: { [bins.id]: 1 } }));
    return { ava, ben, mine, theirs };
  }

  it("refuses a caller with no token, and asks for two Johns", async () => {
    expect((await post({ mine: crypto.randomUUID(), theirs: crypto.randomUUID() })).status).toBe(401);
    const { ava, mine } = await asking();
    expect((await post({ mine: mine.id }, ava)).status).toBe(400);
  });

  it("asks, and answers the ask's id, which the person asked can see", async () => {
    const { ava, ben, mine, theirs } = await asking();
    const res = await post({ mine: mine.id, theirs: theirs.id }, ava);
    expect(res.status).toBe(200);
    const { offerId } = await res.json();
    expect((await ben.db.from("swap_offers").select("id").eq("id", offerId)).data).toEqual([{ id: offerId }]);
  });

  it("says the database's refusal in words", async () => {
    const { ben, mine, theirs } = await asking();
    const res = await post({ mine: theirs.id, theirs: mine.id }, ben);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toBe("Only two open Johns from the same week can be swapped.");
  });
});

describe("Plan it reminders", () => {
  function recorder() {
    const sent: { to: string[]; message: PushMessage }[] = [];
    return { sent, notify: async (to: string[], message: PushMessage) => void sent.push({ to, message }) };
  }

  it("come at the planned time instead of the usual ones, once, and again for a new plan", async () => {
    // A pretend clock in next week, so the test doesn't care what day or hour it really is. Next week is
    // always ahead of the real clock, which plan_john checks plans against, and ticks take the pretend time.
    const house = await makeHouse(["Ava", "Ben"]);
    const week = nextWeek(thisWeek(), ZONE, 1);
    await addJohns(house.id, [{ name: "Bins" }], week);
    const { assignments } = await deal(house.id, week, week.startsAt);
    const bins = assignments[0];
    const owner = actorFor(house, bins.user_id);
    // Planned for the week's third morning; due 15 hours after the plan, the usual "due tomorrow".
    const plan = new Date(week.startsAt.getTime() + 2 * 24 * HOUR + 10 * HOUR);
    expectOk(await db.from("assignments").update({ due_at: new Date(plan.getTime() + 15 * HOUR).toISOString() }).eq("id", bins.id));
    expectOk(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: plan.toISOString() }));

    const r = recorder();
    await tickHouse(db, house.id, new Date(plan.getTime() - HOUR), r.notify);
    expect(r.sent).toEqual([]);

    await tickHouse(db, house.id, new Date(plan.getTime() + 60_000), r.notify);
    await tickHouse(db, house.id, new Date(plan.getTime() + 2 * 60_000), r.notify);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].to).toEqual([owner.userId]);
    expect(r.sent[0].message.title).toBe("Time for Bins");
    expect(r.sent[0].message.body).toMatch(/^You planned it for now\. Due /);
    expect((await reread("assignments", bins.id)).reminded).toBe(3);

    // A new plan gets its own reminder.
    expectOk(await owner.db.rpc("plan_john", { p_assignment: bins.id, p_at: plan.toISOString() }));
    expect((await reread("assignments", bins.id)).reminded).toBe(0);
  });
});
