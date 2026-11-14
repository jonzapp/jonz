import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient, type Actor } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek } from "@/tests/support/factories";
import { problemOf, v1 } from "@/tests/support/v1";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * Fair checks (20270112090000_baseline.sql, docs/specs/fair-checks.md):
 * one voter can't strike alone, a photo answers a question, a strike leaves
 * time to redo the John, the owner of a cover stays out of its check, an
 * on-call John is flagged once per window, the check window is 12 hours or
 * more, and an admin can't change their own result.
 *
 * Every time here is relative to the moment the test runs (the database
 * checks its own now()), never a time of day, so the suite gives the same
 * answer whenever it runs.
 */

const HOUR = 3_600_000;
const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = "http://localhost:8212";
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

/** One John, dealt this week, due `dueInHours` from now (negative: overdue). */
async function oneJohn(names: string[], dueInHours = 2) {
  const house = await makeHouse(names);
  await addJohns(house.id, [{ name: "Bathroom", points: 3 }], thisWeek());
  const { assignments } = await deal(house.id, thisWeek(), rightNow());
  const a = assignments[0];
  expectOk(await db.from("assignments").update({ due_at: fromNow(dueInHours * HOUR).toISOString() }).eq("id", a.id));
  const owner = actorFor(house, a.user_id);
  return { house, a, owner, other: someoneElse(house, a.user_id) };
}

async function question(actor: Actor, assignmentId: string) {
  const { data, error } = await actor.db.rpc("raise_dispute", { p_assignment: assignmentId, p_reason: "Still dirty" });
  expectOk({ error });
  return data!;
}

/** Bring a dispute's vote to its close, then run the clock now. */
async function closeVote(houseId: string, disputeId: string) {
  expectOk(await db.from("disputes").update({ closes_at: fromNow(-1000).toISOString() }).eq("id", disputeId));
  await tickHouse(db, houseId, rightNow());
}

describe("one voter", () => {
  it("can't strike a tick alone at once: the vote waits for its close", async () => {
    const { house, a, owner, other } = await oneJohn(["Ava", "Ben"]);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const d = await question(other, a.id);
    await tickHouse(db, house.id, rightNow());
    expect((await reread("disputes", d)).resolution).toBeNull();
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();

    await closeVote(house.id, d);
    expect((await reread("disputes", d)).resolution).toBe("upheld");
    expect((await reread("assignments", a.id)).done_at).toBeNull();
  });

  it("is answered by a photo, and the tick stands", async () => {
    const { house, a, owner, other } = await oneJohn(["Ava", "Ben"]);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const d = await question(other, a.id);
    const photo = `${house.id}/${a.id}/proof.jpg`;
    expectRule(await other.db.rpc("answer_dispute", { p_dispute: d, p_photo_path: photo }), "not_yours");
    expectRule(await owner.db.rpc("answer_dispute", { p_dispute: d, p_photo_path: `${house.id}/x/proof.jpg` }), "photo_path");

    const { data: settled, error } = await owner.db.rpc("answer_dispute", { p_dispute: d, p_photo_path: photo });
    expectOk({ error });
    expect(settled).toBe(true);
    expect((await reread("disputes", d)).resolution).toBe("rejected");
    const after = await reread("assignments", a.id);
    expect(after.done_at).not.toBeNull();
    expect(after.photo_path).toBe(photo);
  });
});

describe("a photo with more voters", () => {
  it("goes on the John for the house to see, and the vote goes on", async () => {
    const { house, a, owner, other } = await oneJohn(["Ava", "Ben", "Cal"]);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const d = await question(other, a.id);
    const { data: settled } = await owner.db.rpc("answer_dispute", { p_dispute: d, p_photo_path: `${house.id}/${a.id}/p.jpg` });
    expect(settled).toBe(false);
    const row = await reread("disputes", d);
    expect(row.resolution).toBeNull();
    expect(row.photo_path).toBe(`${house.id}/${a.id}/p.jpg`);
  });
});

describe("a struck John", () => {
  it("gets 12 hours to be done again, however late the strike", async () => {
    // Due 20 hours ago, ticked late, its late window closing in a minute.
    const { house, a, owner, other } = await oneJohn(["Ava", "Ben"], -20);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await db.from("assignments").update({ closes_at: fromNow(60_000).toISOString() }).eq("id", a.id));
    const d = await question(other, a.id);
    await closeVote(house.id, d);

    const struck = await reread("assignments", a.id);
    expect(struck.done_at).toBeNull();
    expect(Date.parse(struck.closes_at as string)).toBeGreaterThan(fromNow(11.9 * HOUR).getTime());
    // Not missed, and the owner can do it again (late).
    await tickHouse(db, house.id, rightNow());
    expect((await reread("assignments", a.id)).outcome).toBeNull();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
  });
});

describe("a cover", () => {
  it("can't be questioned or voted on by whoever's John it was", async () => {
    const { house, a, owner } = await oneJohn(["Ava", "Ben", "Cal"], -5);
    const coverer = someoneElse(house, a.user_id);
    const third = house.everyone.find((x) => x.userId !== a.user_id && x.userId !== coverer.userId)!;
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
    expectRule(await owner.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Nope" }), "own_john");

    const d = await question(third, a.id);
    expectRule(await owner.db.rpc("cast_vote", { p_dispute: d, p_uphold: true }), "own_john");
    // The third housemate is the only voter: it waits for the close, and the coverer can answer with a photo.
    await tickHouse(db, house.id, rightNow());
    expect((await reread("disputes", d)).resolution).toBeNull();
  });
});

describe("flags", () => {
  async function onCall(respondHours = 4) {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [bins] = await addJohns(house.id, [{ name: "Bins", points: 1, onCall: { respondHours } }, { name: "Bathroom", points: 4 }], thisWeek());
    const { weekId } = await deal(house.id, thisWeek(), rightNow());
    const { data: oc } = await db.from("on_call_picks").select("user_id").eq("week_id", weekId).eq("john_id", bins.id).single();
    const holder = actorFor(house, oc!.user_id);
    return { house, bins, holder, flagger: someoneElse(house, holder.userId) };
  }

  it("can be raised by a housemate once per window from the last flag", async () => {
    const { bins, holder, flagger } = await onCall();
    const { data: first } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await holder.db.rpc("mark_done", { p_assignment: first! }));
    expectRule(await flagger.db.rpc("raise_flag", { p_john: bins.id }), "flagged_recently");

    // Once the window has gone by since that flag, it can be flagged again.
    expectOk(await db.from("assignments").update({ flagged_at: fromNow(-5 * HOUR).toISOString() }).eq("id", first!));
    const { data: next, error } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk({ error });
    expect(next).not.toBe(first);
  });

  it("can always be raised by whoever is on call", async () => {
    const { bins, holder, flagger } = await onCall();
    const { data: first } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await holder.db.rpc("mark_done", { p_assignment: first! }));
    expectOk(await db.from("assignments").update({ done_at: fromNow(-20 * 60_000).toISOString() }).eq("id", first!));
    const { error } = await holder.db.rpc("raise_flag", { p_john: bins.id });
    expectOk({ error });
  });
});

describe("the check window", () => {
  it("is 12 hours or more in a housemates' house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const { error } = await house.admin.db.from("houses").update({ dispute_hours: 0 }).eq("id", house.id);
    expect(error?.message).toMatch(/houses_dispute_hours_fair/);
    expectOk(await house.admin.db.from("houses").update({ dispute_hours: 12 }).eq("id", house.id));
  });
});

describe("an admin's own result", () => {
  const reset = (actor: Actor, { houseId, ...body }: { houseId: string; [key: string]: unknown }) => v1(actor, `POST /v1/houses/${houseId}/resets`, body);

  it("is another admin's to change, not theirs", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Mop" }], thisWeek());
    const { assignments } = await deal(house.id, thisWeek(), rightNow());
    const mine = assignments.find((x) => x.user_id === house.admin.userId)!;
    const theirs = assignments.find((x) => x.user_id !== house.admin.userId)!;

    const own = await reset(house.admin, { houseId: house.id, kind: "result", assignmentId: mine.id, outcome: "done", apply: true });
    expect(own.status).toBe(403);
    expect(await problemOf(own)).toEqual({ code: "forbidden", detail: "You can't do that in this house." });

    const other = await reset(house.admin, { houseId: house.id, kind: "result", assignmentId: theirs.id, outcome: "done" });
    expect(other.status).toBe(201);
  });
});
