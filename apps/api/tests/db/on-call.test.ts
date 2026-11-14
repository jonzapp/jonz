import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, someoneElse, thisWeek } from "@/tests/support/factories";
import { problemOf, v1 } from "@/tests/support/v1";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * On-call Johns: the deal puts someone on call, any housemate flags it, and
 * each flag is an ordinary assignment for whoever is on call, due a set time
 * later. A missed flag stays its holder's miss and opens again.
 */

const HOUR = 3_600_000;
const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = "http://localhost:8205";
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

/** A house with Bins on call and Bathroom due on a day, this week dealt. */
async function onCallHouse(names = ["Ava", "Ben", "Cal"], respondHours = 12) {
  const house = await makeHouse(names);
  const [bins] = await addJohns(
    house.id,
    [{ name: "Bins", points: 1, onCall: { respondHours, perWeek: 3 } }, { name: "Bathroom", points: 4 }],
    thisWeek(),
  );
  const dealt = await deal(house.id, thisWeek(), rightNow());
  const { data: onCall } = await db.from("on_call_picks").select("user_id").eq("week_id", dealt.weekId).eq("john_id", bins.id);
  const holder = actorFor(house, onCall![0].user_id);
  return { house, bins, holder, ...dealt };
}

async function sharesOf(weekId: string) {
  const { data } = await db.from("week_shares").select("user_id, share").eq("week_id", weekId);
  return new Map(data!.map((r) => [r.user_id, Number(r.share)]));
}

describe("the deal", () => {
  it("puts one housemate on call, deals no assignment for it, and stores no share for it yet", async () => {
    const { bins, weekId, assignments } = await onCallHouse();
    expect(assignments.map((a) => a.name)).toEqual(["Bathroom"]);
    const { data: onCall } = await db.from("on_call_picks").select("john_id").eq("week_id", weekId);
    expect(onCall!.map((r) => r.john_id)).toEqual([bins.id]);
    const shares = await sharesOf(weekId);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(4, 1);
  });
});

describe("raise_flag", () => {
  it("gives the flag to whoever is on call, due after the John's window, and adds its share", async () => {
    const { house, bins, holder, weekId } = await onCallHouse();
    const flagger = someoneElse(house, holder.userId);
    const before = await sharesOf(weekId);

    const { data: flagId, error } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk({ error });
    const { data: flag } = await db.from("assignments").select("*").eq("id", flagId!).single();
    expect(flag).toMatchObject({ user_id: holder.userId, flagged_by: flagger.userId, name: "Bins", points: 1, reminded: 1 });
    expect(Date.parse(flag!.due_at) - Date.parse(flag!.flagged_at!)).toBe(12 * HOUR);

    const after = await sharesOf(weekId);
    for (const m of house.everyone) expect(after.get(m.userId)! - before.get(m.userId)!).toBeCloseTo(1 / 3, 1);

    const { data: event } = await db.from("events").select("kind, user_id").eq("assignment_id", flagId!).single();
    expect(event).toEqual({ kind: "flagged", user_id: holder.userId });
  });

  it("hands back the open flag when it's flagged again, and opens a new one once it's ticked", async () => {
    const { house, bins, holder } = await onCallHouse();
    const flagger = someoneElse(house, holder.userId);
    const { data: first } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    const { data: again } = await holder.db.rpc("raise_flag", { p_john: bins.id });
    expect(again).toBe(first);

    expectOk(await holder.db.rpc("mark_done", { p_assignment: first! }));
    // Once its window has gone by since that flag (fair checks), a new one opens.
    await db.from("assignments").update({ flagged_at: fromNow(-13 * HOUR).toISOString() }).eq("id", first!);
    const { data: next, error } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk({ error });
    expect(next).not.toBe(first);
  });

  it("refuses a John due on a day, and anyone outside the house", async () => {
    const { house, holder } = await onCallHouse();
    const { data: bathroom } = await db.from("johns").select("id").eq("house_id", house.id).eq("name", "Bathroom").single();
    expectRule(await holder.db.rpc("raise_flag", { p_john: bathroom!.id }), "not_on_call");

    const { data: bins } = await db.from("johns").select("id").eq("house_id", house.id).eq("name", "Bins").single();
    const outsider = await signedInUser("Zed");
    expectDenied(await outsider.db.rpc("raise_flag", { p_john: bins!.id }));
  });

  it("goes to someone home when whoever is on call is away today", async () => {
    const { house, bins, holder } = await onCallHouse(["Ava", "Ben"]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(rightNow());
    expectOk(await db.from("away_periods").insert({ house_id: house.id, user_id: holder.userId, starts_on: today, ends_on: today }));
    const { data: flagId } = await holder.db.rpc("raise_flag", { p_john: bins.id });
    const { data: flag } = await db.from("assignments").select("user_id").eq("id", flagId!).single();
    expect(flag!.user_id).toBe(someoneElse(house, holder.userId).userId);
  });

  it("is never swapped: a flag stays with whoever was on call", async () => {
    const { house, bins, holder, assignments } = await onCallHouse(["Ava", "Ben"]);
    const { data: flagId } = await someoneElse(house, holder.userId).db.rpc("raise_flag", { p_john: bins.id });
    await db.from("members").update({ swap_tokens: 1 }).eq("house_id", house.id).eq("user_id", holder.userId);
    const theirs = assignments.find((a) => a.user_id !== holder.userId);
    if (theirs) {
      expectRule(await holder.db.rpc("use_swap", { p_mine: flagId!, p_theirs: theirs.id }), "not_swappable");
    }
  });

  it("keeps on_call out of housemates' hands", async () => {
    const { house, bins, weekId, holder } = await onCallHouse();
    const other = someoneElse(house, holder.userId);
    const { data: seen } = await other.db.from("on_call_picks").select("user_id").eq("week_id", weekId);
    expect(seen).toHaveLength(1);
    expectDenied(
      await other.db.from("on_call_picks").insert({ week_id: weekId, house_id: house.id, john_id: bins.id, user_id: other.userId }),
    );
    expectDenied(await other.db.rpc("open_flag", { p_john: bins.id, p_at: rightNow().toISOString() }));
  });
});

/** Bins with Ben on call and Cal to flag it; Ava is the admin. */
async function benOnCall() {
  const made = await onCallHouse();
  const [ava, ben, cal] = made.house.everyone;
  await db.from("on_call_picks").update({ user_id: ben.userId }).eq("week_id", made.weekId).eq("john_id", made.bins.id);
  return { ...made, ava, ben, cal };
}

describe("Done it taps", () => {
  /** Done it, as Today says it: raise the flag you'd hold, and tick it. */
  async function doneIt(actor: Actor, johnId: string) {
    const raised = await actor.db.rpc("raise_flag", { p_john: johnId });
    if (raised.error) return raised;
    expectOk(await actor.db.rpc("mark_done", { p_assignment: raised.data! }));
    return raised;
  }

  async function flagsOf(johnId: string) {
    const { data } = await db.from("assignments").select("id, done_at").eq("john_id", johnId);
    return data!;
  }

  it("counts a Done it once: another within ten minutes is refused, and a housemate waits out the window", async () => {
    const { bins, ben, cal } = await benOnCall();
    const { data: first } = await doneIt(ben, bins.id);
    expectRule(await doneIt(ben, bins.id), "just_done");
    expect(await flagsOf(bins.id)).toHaveLength(1);
    // Just done: a housemate can flag it again once its window has gone by since (fair checks).
    expectRule(await cal.db.rpc("raise_flag", { p_john: bins.id }), "flagged_recently");
    const earlier = fromNow(-13 * HOUR).toISOString();
    await db.from("assignments").update({ flagged_at: earlier, done_at: earlier }).eq("id", first!);
    expectOk(await cal.db.rpc("raise_flag", { p_john: bins.id }));
    expect(await flagsOf(bins.id)).toHaveLength(2);
  });

  it("counts a Done it again once ten minutes have passed", async () => {
    const { bins, ben } = await benOnCall();
    const { data: first } = await doneIt(ben, bins.id);
    const earlier = fromNow(-11 * 60_000).toISOString();
    await db.from("assignments").update({ flagged_at: earlier, done_at: earlier }).eq("id", first!);
    expectOk(await doneIt(ben, bins.id));
    expect(await flagsOf(bins.id)).toHaveLength(2);
  });

  it("takes the flag back with the tick, from the John's sheet or the toast, and its share with it", async () => {
    const { bins, ben, weekId } = await benOnCall();
    const before = await sharesOf(weekId);

    const { data: one } = await doneIt(ben, bins.id);
    expectOk(await ben.db.rpc("undo_done", { p_assignment: one! }));
    expect(await flagsOf(bins.id)).toEqual([]);

    const { data: two } = await doneIt(ben, bins.id);
    expectOk(await ben.db.rpc("undo_latest", { p_kind: "tick", p_about: two! }));
    expect(await flagsOf(bins.id)).toEqual([]);

    const after = await sharesOf(weekId);
    for (const [user, share] of before) expect(after.get(user)).toBeCloseTo(share, 2);
  });

  it("leaves a housemate's flag open when its tick is taken back", async () => {
    const { bins, ben, cal } = await benOnCall();
    const { data: flag } = await cal.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await ben.db.rpc("mark_done", { p_assignment: flag! }));
    expectOk(await ben.db.rpc("undo_done", { p_assignment: flag! }));
    expect(await flagsOf(bins.id)).toEqual([{ id: flag, done_at: null }]);
  });
});

describe("remove_flag", () => {
  it("lets whoever raised it take it down, with its share and its Wall post", async () => {
    const { bins, cal, weekId } = await benOnCall();
    const before = await sharesOf(weekId);
    const { data: flag } = await cal.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await cal.db.rpc("remove_flag", { p_assignment: flag! }));
    const { data: gone } = await db.from("assignments").select("id").eq("id", flag!);
    expect(gone).toEqual([]);
    const { data: posts } = await db.from("events").select("id").eq("assignment_id", flag!);
    expect(posts).toEqual([]);
    const after = await sharesOf(weekId);
    for (const [user, share] of before) expect(after.get(user)).toBeCloseTo(share, 2);
  });

  it("won't let whoever is on call take down a housemate's flag, but an admin can, and says so", async () => {
    const { bins, ava, ben, cal } = await benOnCall();
    const { data: flag } = await cal.db.rpc("raise_flag", { p_john: bins.id });
    expectRule(await ben.db.rpc("remove_flag", { p_assignment: flag! }), "not_your_flag");
    expectOk(await ava.db.rpc("remove_flag", { p_assignment: flag! }));
    const { data: told } = await db.from("events").select("user_id, data").eq("kind", "undone").eq("user_id", cal.userId);
    expect(told).toEqual([{ user_id: cal.userId, data: expect.objectContaining({ by: ava.userId, what: "flag" }) }]);
  });

  it("lets whoever is on call take down a flag they raised themselves", async () => {
    const { bins, ben } = await benOnCall();
    await db.from("johns").update({ needs_photo: true }).eq("id", bins.id);
    const { data: flag } = await ben.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await ben.db.rpc("remove_flag", { p_assignment: flag! }));
    expect(await db.from("assignments").select("id").eq("john_id", bins.id).then((r) => r.data)).toEqual([]);
  });

  it("refuses a flag that's been ticked, and someone outside the house", async () => {
    const { bins, ben, cal } = await benOnCall();
    const { data: flag } = await cal.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await ben.db.rpc("mark_done", { p_assignment: flag! }));
    expectRule(await cal.db.rpc("remove_flag", { p_assignment: flag! }), "flag_settled");
    const outsider = await signedInUser("Zed");
    expectDenied(await outsider.db.rpc("remove_flag", { p_assignment: flag! }));
  });
});

describe("the clock and flags", () => {
  it("misses a flag at twice its window, on whoever had it, and opens it again", async () => {
    const { house, bins, holder, weekId } = await onCallHouse(["Ava", "Ben"], 1);
    const { data: flagId } = await someoneElse(house, holder.userId).db.rpc("raise_flag", { p_john: bins.id });
    const { data: flag } = await db.from("assignments").select("flagged_at").eq("id", flagId!).single();
    const later = new Date(Date.parse(flag!.flagged_at!) + 2 * HOUR + 60_000);

    await tickHouse(db, house.id, later);
    const { data: settled } = await db.from("assignments").select("outcome, user_id").eq("id", flagId!).single();
    expect(settled).toEqual({ outcome: "missed", user_id: holder.userId });
    const { data: forfeit } = await db.from("ledger_entries").select("user_id, kind").eq("assignment_id", flagId!);
    expect(forfeit).toEqual([{ user_id: holder.userId, kind: "forfeit" }]);

    // Opened again only while this week still runs at `later` (not late on a Sunday).
    const { data: week } = await db.from("weeks").select("ends_at").eq("id", weekId).single();
    const { data: open } = await db
      .from("assignments")
      .select("id, flagged_by")
      .eq("john_id", bins.id)
      .is("outcome", null)
      .is("done_at", null);
    if (later < new Date(week!.ends_at)) expect(open).toEqual([{ id: expect.any(String), flagged_by: null }]);
  });
});

describe("POST /v1/johns/{johnId}/flags", () => {
  const post = ({ johnId }: { johnId: string }, actor?: Actor) => v1(actor, `POST /v1/johns/${johnId}/flags`, {});

  it("refuses a caller with no token", async () => {
    expect((await post({ johnId: crypto.randomUUID() })).status).toBe(401);
  });

  it("asks which John in words", async () => {
    const { holder } = await onCallHouse(["Ava", "Ben"]);
    const res = await post({ johnId: "bins" }, holder);
    expect(res.status).toBe(400);
    expect((await problemOf(res)).code).toBe("invalid_input");
  });

  it("flags it and answers the flag's id", async () => {
    const { house, bins, holder } = await onCallHouse(["Ava", "Ben"]);
    const res = await post({ johnId: bins.id }, someoneElse(house, holder.userId));
    expect(res.status).toBe(201);
    const body = await res.json();
    const { data: flag } = await db.from("assignments").select("user_id").eq("id", body.assignmentId).single();
    expect(flag!.user_id).toBe(holder.userId);
  });

  it("says no in words for a John that isn't on call", async () => {
    const { house, holder } = await onCallHouse(["Ava", "Ben"]);
    const { data: bathroom } = await db.from("johns").select("id").eq("house_id", house.id).eq("name", "Bathroom").single();
    const res = await post({ johnId: bathroom!.id }, holder);
    expect(res.status).toBe(400);
    expect(await problemOf(res)).toEqual({ code: "rejected", detail: "not_on_call" });
  });
});
