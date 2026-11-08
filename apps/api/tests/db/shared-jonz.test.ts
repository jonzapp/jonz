import { monthOf } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as rollCallRoute } from "@/app/api/roll-call/route";
import { tickHouse } from "@/lib/engine/tick";
import { adminClient, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";

/**
 * Shared Jonz (20261102090000_shared_jonz.sql): a John done together is
 * dealt as one place per person on one job, ticked by a roll call that
 * says who did it, and its points are shared by everyone on it, helpers
 * included. Whoever it leaves off has a miss, and their forfeit goes to
 * whoever did the job.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const db = adminClient();

/** Garden tidy for two, 4 pts each, dealt this week in a house of three: the two holders and the one who wasn't dealt it. */
async function gardenTidy(week = thisWeek(), now = new Date()) {
  const house = await makeHouse(["Ava", "Ben", "Cal"]);
  await addJohns(house.id, [{ name: "Garden tidy", points: 4, crew: 2 }], week);
  const { assignments } = await deal(house.id, week, now);
  const [first, second] = assignments;
  const ticker = actorFor(house, first.user_id);
  const other = actorFor(house, second.user_id);
  const spare = house.everyone.find((x) => x.userId !== ticker.userId && x.userId !== other.userId)!;
  return { house, assignments, first, second, ticker, other, spare };
}

async function crewOf(assignmentId: string) {
  const { data } = await db.from("crew_members").select("user_id, helper, points").eq("assignment_id", assignmentId).order("user_id");
  return (data ?? []).map((c) => ({ ...c, points: Number(c.points) }));
}

describe("dealing a John done together", () => {
  it("hands it out as one place per person, each worth its points, linked by one job", async () => {
    const { assignments } = await gardenTidy();
    expect(assignments).toHaveLength(2);
    const [a, b] = assignments;
    expect(a.job_id).toBeTruthy();
    expect(b.job_id).toBe(a.job_id);
    expect(a.user_id).not.toBe(b.user_id);
    expect([a.points, b.points]).toEqual([4, 4]);
  });

  it("gives everyone home a place when it's done by everyone", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    await addJohns(house.id, [{ name: "Big clean", points: 3, crew: 0 }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    expect(new Set(assignments.map((a) => a.user_id)).size).toBe(3);
    expect(new Set(assignments.map((a) => a.job_id)).size).toBe(1);
  });

  it("keeps on call one person", async () => {
    const house = await makeHouse();
    await expect(addJohns(house.id, [{ name: "Bins", onCall: {}, crew: 2 }], thisWeek())).rejects.toMatchObject({
      message: expect.stringContaining("johns_crew_on_call"),
    });
  });
});

describe("the roll call", () => {
  it("is the only way to tick a place in a job, and whoever ticks it is on it", async () => {
    const { first, ticker, spare } = await gardenTidy();
    expectRule(await ticker.db.rpc("mark_done", { p_assignment: first.id }), "roll_call_needed");
    expectRule(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [spare.userId] }), "not_in_crew");
    expectDenied(await spare.db.rpc("roll_call", { p_assignment: first.id, p_crew: [spare.userId] }));
  });

  it("settles every place at once: done for whoever did it, a miss for whoever it leaves off", async () => {
    const { house, first, second, ticker, other, spare } = await gardenTidy();
    const { data: people, error } = await ticker.db.rpc("roll_call", {
      p_assignment: first.id,
      p_crew: [ticker.userId, spare.userId],
    });
    expect(error).toBeNull();
    expect(people).toBe(2);

    const mine = await reread("assignments", first.id);
    const theirs = await reread("assignments", second.id);
    expect(mine.done_at).not.toBeNull();
    expect(theirs.done_at).toBeNull();
    expect(theirs.absent_at).toBe(mine.done_at);

    // Both places' points, 8, shared by the two who did it; Cal came to help.
    const expected = [
      { user_id: ticker.userId, helper: false, points: 4 },
      { user_id: spare.userId, helper: true, points: 4 },
    ].sort((a, b) => a.user_id.localeCompare(b.user_id));
    expect(await crewOf(first.id)).toEqual(expected);

    const { data: events } = await house.admin.db.from("events").select("kind, user_id, data").eq("assignment_id", first.id);
    expect(events).toEqual([
      {
        kind: "done",
        user_id: ticker.userId,
        data: { name: "Garden tidy", points: 4, photo: false, with: [spare.userId], absent: [other.userId], total: 8 },
      },
    ]);

    // Settled once: nobody ticks it again, and the place left off can't be ticked.
    expectRule(await other.db.rpc("roll_call", { p_assignment: second.id, p_crew: [other.userId] }), "left_off");
  });

  it("splits a John done by one with whoever helped: bins with a helper is 1 each", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins", points: 2 }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), new Date());
    const bins = assignments[0];
    const owner = actorFor(house, bins.user_id);
    const helper = house.everyone.find((x) => x.userId !== owner.userId)!;
    expectOk(await owner.db.rpc("roll_call", { p_assignment: bins.id, p_crew: [owner.userId, helper.userId] }));
    expect(await crewOf(bins.id)).toEqual(
      [
        { user_id: owner.userId, helper: false, points: 1 },
        { user_id: helper.userId, helper: true, points: 1 },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
  });

  it("names only people in the house", async () => {
    const { first, ticker } = await gardenTidy();
    const { house: elsewhere } = await gardenTidy();
    expectDenied(
      await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId, elsewhere.admin.userId] }),
    );
  });

  it("is taken back whole, and only by whoever ticked it", async () => {
    const { first, second, ticker, other, spare } = await gardenTidy();
    expectOk(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId, other.userId, spare.userId] }));
    expect((await reread("assignments", second.id)).done_at).not.toBeNull();
    expectRule(await other.db.rpc("undo_done", { p_assignment: second.id }), "not_your_tick");

    expectOk(await ticker.db.rpc("undo_done", { p_assignment: first.id }));
    for (const id of [first.id, second.id]) {
      const row = await reread("assignments", id);
      expect([row.done_at, row.absent_at]).toEqual([null, null]);
    }
    expect(await crewOf(first.id)).toEqual([]);
  });

  it("can be disputed by someone it left off, and upheld opens every place again", async () => {
    const { first, second, ticker, other } = await gardenTidy();
    expectOk(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId] }));
    const { data: dispute, error } = await other.db.rpc("raise_dispute", { p_assignment: second.id, p_reason: "I was there" });
    expect(error).toBeNull();
    // It's checked on the place it was ticked from.
    const { data: raised } = await db.from("disputes").select("assignment_id").eq("id", dispute!).single();
    expect(raised!.assignment_id).toBe(first.id);

    expectOk(await db.rpc("resolve_dispute", { p_dispute: dispute!, p_resolution: "upheld" }));
    for (const id of [first.id, second.id]) {
      const row = await reread("assignments", id);
      expect([row.done_at, row.absent_at]).toEqual([null, null]);
    }
    expect(await crewOf(first.id)).toEqual([]);
  });
});

describe("taking a roll call back some other way", () => {
  it("opens every place and drops the crew when its ticker undoes it from History", async () => {
    const { first, second, ticker, spare } = await gardenTidy();
    expectOk(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId, spare.userId] }));
    expectOk(await ticker.db.rpc("undo_latest", { p_kind: "tick", p_about: first.id }));
    for (const id of [first.id, second.id]) {
      const row = await reread("assignments", id);
      expect([row.done_at, row.absent_at]).toEqual([null, null]);
    }
    expect(await crewOf(first.id)).toEqual([]);
  });

  it("takes a place an admin changes out of the share, and its holder off the miss", async () => {
    const { house, first, second, ticker, spare } = await gardenTidy();
    expectOk(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId, spare.userId] }));
    expectOk(
      await db.rpc("admin_reset", {
        p_actor: house.admin.userId,
        p_house: house.id,
        p_kind: "result",
        p_target: { assignment: second.id, outcome: "done" },
        p_forfeits: {},
        p_apply: true,
      }),
    );
    const theirs = await reread("assignments", second.id);
    expect([theirs.outcome, theirs.absent_at]).toEqual(["done", null]);
    // Their own 4 is theirs now; the two on the roll call share the other 4.
    expect((await crewOf(first.id)).map((c) => c.points)).toEqual([2, 2]);
  });
});

describe("covering a John done together", () => {
  it("covers every open place, and is for someone with no place in it", async () => {
    const { house, assignments, first, ticker, spare } = await gardenTidy();
    await db.from("houses").update({ cover_grace_hours: 0 }).eq("id", house.id);
    await db
      .from("assignments")
      .update({ due_at: new Date(Date.now() - 4 * HOUR).toISOString() })
      .in("id", assignments.map((a) => a.id));
    expectRule(await ticker.db.rpc("cover_john", { p_assignment: first.id }), "tick_it_yourself");
    expectOk(await spare.db.rpc("cover_john", { p_assignment: first.id }));
    for (const a of assignments) expect((await reread("assignments", a.id)).covered_by).toBe(spare.userId);

    expectOk(await spare.db.rpc("undo_cover", { p_assignment: first.id }));
    for (const a of assignments) expect((await reread("assignments", a.id)).covered_by).toBeNull();
  });
});

describe("what the clock does with a roll call", () => {
  it("credits each share, settles the place left off as missed, and pays its forfeit to whoever did it", async () => {
    const week = weeksAgo(6);
    const { house, first, second, ticker, other, spare } = await gardenTidy(week, week.startsAt);
    const month = monthOf(new Date(first.due_at), ZONE);
    // Only this one John in the month: later weeks the clock deals have nothing in them.
    await db.from("johns").update({ archived_at: new Date().toISOString() }).eq("house_id", house.id);

    // Tick it now, as if still inside its late window; then put the tick (and who did it) back an hour
    // before it was due.
    await db
      .from("assignments")
      .update({ closes_at: new Date(Date.now() + DAY).toISOString() })
      .in("id", [first.id, second.id]);
    expectOk(await ticker.db.rpc("roll_call", { p_assignment: first.id, p_crew: [ticker.userId, spare.userId] }));
    const back = new Date(new Date(first.due_at).getTime() - HOUR).toISOString();
    await db.from("assignments").update({ done_at: back }).eq("id", first.id);
    await db.from("assignments").update({ absent_at: back }).eq("id", second.id);
    await db.from("crew_members").update({ created_at: back }).eq("assignment_id", first.id);

    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 2 * DAY));
    expect((await reread("assignments", first.id)).outcome).toBe("done");
    expect((await reread("assignments", second.id)).outcome).toBe("missed");
    const { data: forfeits } = await db.from("ledger_entries").select("user_id, amount_minor, doers").eq("assignment_id", second.id);
    expect(forfeits).toEqual([
      { user_id: other.userId, amount_minor: -300, doers: [ticker.userId, spare.userId].sort() },
    ]);

    // The work done: 4 each for the two who did it, none for whoever wasn't there.
    const { data: balances } = await house.admin.db.rpc("house_balances", { p_house: house.id, p_before: thisWeek().startsOn });
    const credited = (who: Actor) => Number(balances!.find((b) => b.user_id === who.userId)?.credited ?? 0);
    expect([credited(ticker), credited(spare), credited(other)]).toEqual([4, 4, 0]);

    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 40 * DAY));
    const { data: rows } = await db.from("ledger_entries").select("user_id, amount_minor").eq("house_id", house.id).eq("month", month);
    const net = (who: Actor) => rows!.filter((r) => r.user_id === who.userId).reduce((s, r) => s + r.amount_minor, 0);
    expect([net(other), net(ticker), net(spare)]).toEqual([-300, 150, 150]);
  });
});

describe("POST /api/roll-call", () => {
  const BASE = "http://localhost:3205/api/roll-call";
  const savedOrigins = process.env.ALLOWED_ORIGINS;
  beforeAll(() => {
    process.env.ALLOWED_ORIGINS = "http://localhost:8205";
  });
  afterAll(() => {
    process.env.ALLOWED_ORIGINS = savedOrigins;
  });

  async function post(body: unknown, actor?: Actor) {
    const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:8205" };
    if (actor) {
      const { data } = await actor.db.auth.getSession();
      headers.authorization = `Bearer ${data.session!.access_token}`;
    }
    return rollCallRoute(new Request(BASE, { method: "POST", headers, body: JSON.stringify(body) }));
  }

  it("refuses a caller with no token, and asks for who did it", async () => {
    expect((await post({ assignmentId: crypto.randomUUID(), crew: [crypto.randomUUID()] })).status).toBe(401);
    const { first, ticker } = await gardenTidy();
    expect((await post({ assignmentId: first.id, crew: [] }, ticker)).status).toBe(400);
  });

  it("ticks it with who did it, and says how many", async () => {
    const { first, ticker, other } = await gardenTidy();
    const res = await post({ assignmentId: first.id, crew: [ticker.userId, other.userId] }, ticker);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, people: 2 });
    expect((await crewOf(first.id)).map((c) => c.points)).toEqual([4, 4]);
  });

  it("says the database's refusal in words", async () => {
    const { first, ticker, spare } = await gardenTidy();
    const res = await post({ assignmentId: first.id, crew: [spare.userId] }, ticker);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toBeTruthy();
  });
});
