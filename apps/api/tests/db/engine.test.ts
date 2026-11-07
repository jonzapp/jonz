import { dateInWeek, monthOf, nextWeek, weekdayOfMonth } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, someoneElse, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";

/**
 * The clock, driven by hand. The engine takes `now` as an argument, so a
 * test can jump to the end of the week, or the end of the month, and check
 * exactly what the tick wrote. Everything is read back through the service
 * role.
 */

const DAY = 86_400_000;
const db = adminClient();

async function ledgerOf(houseId: string) {
  const { data } = await db.from("ledger").select("user_id, kind, amount_minor, month").eq("house_id", houseId);
  return data!;
}

describe("dealing", () => {
  it("deals nothing until the first deal, then deals the current week once", async () => {
    const house = await makeHouse();
    await addJohns(house.id, [{ name: "Bins" }, { name: "Bathroom", points: 4 }], thisWeek());
    const now = new Date();

    expect((await tickHouse(db, house.id, now)).dealt).toBeNull();

    await db.from("houses").update({ first_dealt_at: now.toISOString() }).eq("id", house.id);
    const first = await tickHouse(db, house.id, now);
    expect(first.dealt).toBeTruthy();
    const again = await tickHouse(db, house.id, now);
    expect(again.dealt).toBeNull();

    const { data } = await db.from("assignments").select("id").eq("week_id", first.dealt!);
    expect(data).toHaveLength(2);
  });

  it("never deals a John that is already overdue", async () => {
    const house = await makeHouse();
    const week = thisWeek();
    await addJohns(house.id, [{ name: "Monday bins", dueDow: 1, dueTime: "07:00" }], week);
    const now = new Date();
    const { assignments } = await deal(house.id, week, now);
    expect(new Date(assignments[0].due_at).getTime()).toBeGreaterThan(now.getTime());
  });

  it("only deals a fortnightly John in its weeks", async () => {
    const house = await makeHouse();
    const week = weeksAgo(3);
    await addJohns(house.id, [{ name: "Fridge", everyWeeks: 2 }, { name: "Bins" }], week);
    const first = await deal(house.id, week, week.startsAt);
    expect(first.assignments.map((a) => a.name).sort()).toEqual(["Bins", "Fridge"]);
    const following = nextWeek(week, ZONE, 1);
    const second = await deal(house.id, following, following.startsAt);
    expect(second.assignments.map((a) => a.name)).toEqual(["Bins"]);
  });
});

describe("any-length repeats", () => {
  it("deals a quarterly John in the week of its date, brings it back after a miss, and not after it's done", async () => {
    const house = await makeHouse();
    const week = weeksAgo(6);
    // Whichever Wednesday this week holds, as the Nth Wednesday of its month: the John lands here.
    const nth = weekdayOfMonth(dateInWeek(week.startsOn, 1, 3)).nth;
    await addJohns(house.id, [{ name: "Fridge deep clean", points: 8, dueDow: 3, monthly: { everyMonths: 3, weekOfMonth: nth } }, { name: "Bins" }], week);
    const first = await deal(house.id, week, week.startsAt);
    expect(first.assignments.map((a) => a.name).sort()).toEqual(["Bins", "Fridge deep clean"]);
    expect(first.assignments.find((a) => a.name === "Fridge deep clean")!.points).toBe(8);

    // Nobody does it: missed the day after, it goes into the next week's deal.
    await tickHouse(db, house.id, new Date(week.endsAt.getTime() - DAY));
    const fridge = first.assignments.find((a) => a.name === "Fridge deep clean")!;
    const { data: missed } = await db.from("assignments").select("outcome").eq("id", fridge.id).single();
    expect(missed!.outcome).toBe("missed");
    const following = nextWeek(week, ZONE, 1);
    const second = await deal(house.id, following, following.startsAt);
    expect(second.assignments.map((a) => a.name).sort()).toEqual(["Bins", "Fridge deep clean"]);

    // Done this time: the week after has only the bins.
    const back = second.assignments.find((a) => a.name === "Fridge deep clean")!;
    await db.from("assignments").update({ done_at: new Date(new Date(back.due_at).getTime() - 3_600_000).toISOString() }).eq("id", back.id);
    await tickHouse(db, house.id, new Date(following.endsAt.getTime() - DAY));
    const third = nextWeek(following, ZONE, 1);
    const dealt = await deal(house.id, third, third.startsAt);
    expect(dealt.assignments.map((a) => a.name)).toEqual(["Bins"]);
  });

  it("brings back a John missed at the weekend in the deal after it's called missed, not while it can still be done late", async () => {
    const house = await makeHouse();
    const week = weeksAgo(6);
    const nth = weekdayOfMonth(dateInWeek(week.startsOn, 1, 7)).nth;
    await addJohns(house.id, [{ name: "Oven", points: 6, monthly: { everyMonths: 2, weekOfMonth: nth } }, { name: "Bins" }], week);
    await deal(house.id, week, week.startsAt);
    // Sunday's Oven can still be done late on Monday, so the next week is dealt without it.
    const following = nextWeek(week, ZONE, 1);
    expect((await deal(house.id, following, following.startsAt)).assignments.map((a) => a.name)).toEqual(["Bins"]);
    await tickHouse(db, house.id, new Date(following.endsAt.getTime() - DAY));
    const third = nextWeek(following, ZONE, 1);
    expect((await deal(house.id, third, third.startsAt)).assignments.map((a) => a.name).sort()).toEqual(["Bins", "Oven"]);
  });
});

describe("settling a week", () => {
  async function pastWeek() {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = weeksAgo(2);
    await addJohns(house.id, [{ name: "Bins", points: 2 }, { name: "Bathroom", points: 4 }], week);
    const { weekId, assignments } = await deal(house.id, week, week.startsAt);
    return { house, week, weekId, assignments };
  }

  it("calls an untouched John missed and fines it, once", async () => {
    const { house, week, assignments } = await pastWeek();
    const after = new Date(week.endsAt.getTime() + DAY);
    await tickHouse(db, house.id, after);
    await tickHouse(db, house.id, after);

    const { data } = await db.from("assignments").select("outcome").in("id", assignments.map((a) => a.id));
    expect(data!.map((a) => a.outcome)).toEqual(["missed", "missed"]);
    const forfeits = (await ledgerOf(house.id)).filter((r) => r.kind === "forfeit");
    expect(forfeits).toHaveLength(2);
    expect(forfeits.every((r) => r.amount_minor === -300)).toBe(true);
  });

  it("marks on-time, late and missed, and pays half points for late", async () => {
    const { house, week, assignments } = await pastWeek();
    const [first, second] = assignments;
    // One on time, one a day late; both after the dispute window by `after`.
    await db.from("assignments").update({ done_at: new Date(new Date(first.due_at).getTime() - 3_600_000).toISOString() }).eq("id", first.id);
    await db.from("assignments").update({ done_at: new Date(new Date(second.due_at).getTime() + 3_600_000).toISOString() }).eq("id", second.id);
    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 2 * DAY));
    const { data } = await db.from("assignments").select("id, outcome").in("id", [first.id, second.id]);
    const by = Object.fromEntries(data!.map((a) => [a.id, a.outcome]));
    expect([by[first.id], by[second.id]]).toEqual(["done", "late"]);
    const forfeits = (await ledgerOf(house.id)).filter((r) => r.kind === "forfeit");
    expect(forfeits.map((f) => f.amount_minor)).toEqual([-100]);
  });

  it("waits for the dispute window before a tick stands", async () => {
    const { house, assignments } = await pastWeek();
    const a = assignments[0];
    const doneAt = new Date(a.due_at);
    await db.from("assignments").update({ done_at: doneAt.toISOString() }).eq("id", a.id);
    await tickHouse(db, house.id, new Date(doneAt.getTime() + 2 * 3_600_000));
    const { data: early } = await db.from("assignments").select("outcome").eq("id", a.id).single();
    expect(early!.outcome).toBeNull();
  });

  it("closes the week: streaks, and a swap token for the top of the table", async () => {
    const { house, week, weekId, assignments } = await pastWeek();
    const bathroom = assignments.find((a) => a.name === "Bathroom")!;
    await db.from("assignments").update({ done_at: week.startsAt.toISOString() }).eq("id", bathroom.id);
    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 2 * DAY));

    // Ticking at a later `now` also deals that later week; check the one we closed.
    const { data: w } = await db.from("weeks").select("closed_at").eq("id", weekId).single();
    expect(w!.closed_at).not.toBeNull();
    const { data: members } = await db.from("members").select("user_id, streak, swap_tokens").eq("house_id", house.id);
    const winner = members!.find((m) => m.user_id === bathroom.user_id)!;
    const loser = members!.find((m) => m.user_id !== bathroom.user_id)!;
    expect([winner.streak, winner.swap_tokens]).toEqual([1, 1]);
    expect([loser.streak, loser.swap_tokens]).toEqual([0, 0]);
    const { data: events } = await db.from("events").select("kind, user_id").eq("house_id", house.id).eq("kind", "swap_earned");
    expect(events).toEqual([{ kind: "swap_earned", user_id: bathroom.user_id }]);
  });
});

describe("disputes, decided by the tick", () => {
  it("strikes an upheld tick, so the John is open again", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await addJohns(house.id, [{ name: "Bathroom", points: 4 }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const a = assignments[0];
    const owner = actorFor(house, a.user_id);
    await owner.db.rpc("mark_done", { p_assignment: a.id });
    const voters = house.everyone.filter((x) => x.userId !== owner.userId);
    const { data: disputeId } = await voters[0].db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Ring in the bath" });
    expectOk(await voters[1].db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: true }));

    const summary = await tickHouse(db, house.id, new Date());
    expect(summary.disputes).toBe(1);
    const { data: row } = await db.from("assignments").select("done_at, outcome").eq("id", a.id).single();
    expect(row).toEqual({ done_at: null, outcome: null });
    const { data: d } = await db.from("disputes").select("resolution").eq("id", disputeId!).single();
    expect(d!.resolution).toBe("upheld");
  });

  it("in a house of two, waits for the vote to close, then strikes it with time to redo it", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Bathroom", points: 4 }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const a = assignments[0];
    await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id });
    const { error } = await someoneElse(house, a.user_id).db.rpc("raise_dispute", {
      p_assignment: a.id,
      p_reason: "Still full",
    });
    expect(error).toBeNull();
    // The one who asked is the only voter: nothing is decided before the vote closes.
    expect((await tickHouse(db, house.id, new Date())).disputes).toBe(0);
    await db.from("disputes").update({ closes_at: new Date(Date.now() - 1000).toISOString() }).eq("assignment_id", a.id);
    const summary = await tickHouse(db, house.id, new Date());
    expect(summary.disputes).toBe(1);
    const { data: row } = await db.from("assignments").select("done_at, closes_at").eq("id", a.id).single();
    expect(row!.done_at).toBeNull();
    expect(Date.parse(row!.closes_at!)).toBeGreaterThan(Date.now() + 11 * 3_600_000);
  });

  it("lets a tick stand when the house sides with it", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const a = assignments[0];
    await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id });
    const accuser = someoneElse(house, a.user_id);
    const { data: disputeId } = await accuser.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Hmm" });
    const third = house.everyone.find((x) => x.userId !== a.user_id && x.userId !== accuser.userId)!;
    await accuser.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: false });
    await third.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: false });
    await tickHouse(db, house.id, new Date());
    const { data: row } = await db.from("assignments").select("done_at").eq("id", a.id).single();
    expect(row!.done_at).not.toBeNull();
  });
});

describe("closing the month", () => {
  it("shares the forfeits, sums to zero, and only happens once", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const week = weeksAgo(6);
    await addJohns(house.id, [{ name: "Bins", points: 2 }], week);
    const { assignments } = await deal(house.id, week, week.startsAt);
    const a = assignments[0];
    const month = monthOf(new Date(a.due_at), ZONE);

    // Settle the week (missed), then close the month, twice over.
    const later = new Date(week.endsAt.getTime() + 40 * DAY);
    await tickHouse(db, house.id, later);
    await tickHouse(db, house.id, later);

    const rows = (await ledgerOf(house.id)).filter((r) => r.month === month);
    expect(rows.reduce((s, r) => s + r.amount_minor, 0)).toBe(0);
    expect(rows.filter((r) => r.kind === "share")).toHaveLength(2);
    expect(rows.filter((r) => r.user_id === a.user_id).reduce((s, r) => s + r.amount_minor, 0)).toBe(-300);
    const { data: closes } = await db.from("month_closes").select("month").eq("house_id", house.id);
    expect(closes!.map((c) => c.month)).toContain(month);
  });

  it("shares forfeits only with people still in the house", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ava, ben, cal] = house.everyone;
    const week = weeksAgo(6);
    await addJohns(house.id, [{ name: "Bins", points: 2 }, { name: "Hob", points: 2 }], week);
    const { assignments } = await deal(house.id, week, week.startsAt);
    // Ava and Cal each miss one; Cal moves out before the month closes.
    await db.from("assignments").update({ user_id: ava.userId }).eq("id", assignments[0].id);
    await db.from("assignments").update({ user_id: cal.userId }).eq("id", assignments[1].id);
    const month = monthOf(new Date(assignments[0].due_at), ZONE);
    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + DAY));
    await db.from("members").delete().eq("house_id", house.id).eq("user_id", cal.userId);
    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 40 * DAY));

    const rows = (await ledgerOf(house.id)).filter((r) => r.month === month);
    const shareOf = (id: string) => rows.filter((r) => r.kind === "share" && r.user_id === id).reduce((t, r) => t + r.amount_minor, 0);
    // Cal still pays, but gets none of Ava's: it all goes to Ben.
    expect([shareOf(ava.userId), shareOf(ben.userId), shareOf(cal.userId)]).toEqual([150, 450, 0]);
    expect(rows.reduce((t, r) => t + r.amount_minor, 0)).toBe(0);
  });

  it("survives two ticks racing each other", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const week = weeksAgo(6);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Hob", points: 3 }], week);
    await deal(house.id, week, week.startsAt);
    const later = new Date(week.endsAt.getTime() + 40 * DAY);
    // The race is the point here, so these really do run at once.
    await Promise.allSettled([tickHouse(db, house.id, later), tickHouse(db, house.id, later)]);
    await tickHouse(db, house.id, later);
    const rows = await ledgerOf(house.id);
    expect(rows.filter((r) => r.kind === "forfeit")).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.amount_minor, 0)).toBe(0);
  });
});
