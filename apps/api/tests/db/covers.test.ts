import { monthOf } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";

/**
 * Covering a housemate's John: cover_john once it's past due plus the
 * house's grace, the checks that follow, and what the clock pays for it.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const db = adminClient();

/** A John dealt this week, made `overdueHours` late by moving its due time back. */
async function overdueJohn(overdueHours: number, john: { name: string; points?: number; needsPhoto?: boolean } = { name: "Bins" }) {
  const house = await makeHouse();
  await addJohns(house.id, [john], thisWeek());
  const { assignments } = await deal(house.id, thisWeek(), new Date());
  const a = assignments[0];
  await db.from("assignments").update({ due_at: new Date(Date.now() - overdueHours * HOUR).toISOString() }).eq("id", a.id);
  const owner = actorFor(house, a.user_id);
  const coverer = someoneElse(house, a.user_id);
  const third = house.everyone.find((x) => x.userId !== a.user_id && x.userId !== coverer.userId)!;
  return { house, a, owner, coverer, third };
}

describe("cover_john", () => {
  it("is for someone else in the house, never the assignee", async () => {
    const { a, owner } = await overdueJohn(4);
    expectRule(await owner.db.rpc("cover_john", { p_assignment: a.id }), "tick_it_yourself");
    const { house: other } = await overdueJohn(4);
    expectDenied(await other.admin.db.rpc("cover_john", { p_assignment: a.id }));
  });

  it("waits for the house's grace after the due time", async () => {
    const { house, a, coverer } = await overdueJohn(1);
    expectRule(await coverer.db.rpc("cover_john", { p_assignment: a.id }), "too_soon_to_cover");
    await db.from("houses").update({ cover_grace_hours: 0 }).eq("id", house.id);
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
  });

  it("ticks it in the coverer's name and says so on the Wall", async () => {
    const { house, a, coverer } = await overdueJohn(4);
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
    const row = await reread("assignments", a.id);
    expect(row.covered_by).toBe(coverer.userId);
    expect(row.done_at).not.toBeNull();
    const { data } = await house.admin.db.from("events").select("kind, user_id, data").eq("assignment_id", a.id);
    expect(data).toEqual([
      { kind: "covered", user_id: coverer.userId, data: { name: "Bins", points: 2, photo: false, for: a.user_id } },
    ]);
  });

  it("loses to a tick that came first, and the first cover wins", async () => {
    const { a, owner, coverer } = await overdueJohn(4);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    expectRule(await coverer.db.rpc("cover_john", { p_assignment: a.id }), "already_done");

    const next = await overdueJohn(4);
    expectOk(await next.coverer.db.rpc("cover_john", { p_assignment: next.a.id }));
    expectRule(await next.third.db.rpc("cover_john", { p_assignment: next.a.id }), "already_done");
  });

  it("needs a photo on a photo John, from that John's folder", async () => {
    const { house, a, coverer } = await overdueJohn(4, { name: "Oven", points: 5, needsPhoto: true });
    expectRule(await coverer.db.rpc("cover_john", { p_assignment: a.id }), "photo_required");
    expectRule(
      await coverer.db.rpc("cover_john", { p_assignment: a.id, p_photo_path: `${house.id}/elsewhere/x.jpg` }),
      "photo_path",
    );
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id, p_photo_path: `${house.id}/${a.id}/x.jpg` }));
  });
});

describe("taking a cover back", () => {
  it("is the coverer's to undo; the assignee disputes instead", async () => {
    const { house, a, owner, coverer, third } = await overdueJohn(4);
    await coverer.db.rpc("cover_john", { p_assignment: a.id });
    expectRule(await owner.db.rpc("undo_done", { p_assignment: a.id }), "john_covered");
    expectDenied(await third.db.rpc("undo_cover", { p_assignment: a.id }));

    expectOk(await coverer.db.rpc("undo_cover", { p_assignment: a.id }));
    const row = await reread("assignments", a.id);
    expect([row.done_at, row.covered_by]).toEqual([null, null]);
    const { data } = await house.admin.db.from("events").select("kind").eq("assignment_id", a.id);
    expect(data).toEqual([]);
  });
});

describe("disputing a cover", () => {
  it("is open to the rest of the house, not the coverer or the assignee, and upheld opens the John again", async () => {
    const { a, owner, coverer, third } = await overdueJohn(4);
    await coverer.db.rpc("cover_john", { p_assignment: a.id });
    expectDenied(await coverer.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "I did it" }));
    // The assignee can't strike a cover of their own John (fair checks): the rest of the house checks it.
    expectDenied(await owner.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "I did it at 9" }));
    const { data: dispute, error } = await third.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Still full" });
    expect(error).toBeNull();
    expectDenied(await coverer.db.rpc("cast_vote", { p_dispute: dispute!, p_uphold: false }));
    expectDenied(await owner.db.rpc("cast_vote", { p_dispute: dispute!, p_uphold: true }));
    expectRule(await coverer.db.rpc("undo_cover", { p_assignment: a.id }), "under_dispute");

    expectOk(await db.rpc("resolve_dispute", { p_dispute: dispute!, p_resolution: "upheld" }));
    const row = await reread("assignments", a.id);
    expect([row.done_at, row.covered_by]).toEqual([null, null]);
  });
});

describe("what the clock does with a cover", () => {
  it("settles it as covered, fines the assignee, and pays the coverer at month close", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const week = weeksAgo(6);
    await addJohns(house.id, [{ name: "Bins", points: 2 }], week);
    const { assignments } = await deal(house.id, week, week.startsAt);
    const a = assignments[0];
    const coverer = someoneElse(house, a.user_id);
    const third = house.everyone.find((x) => x.userId !== a.user_id && x.userId !== coverer.userId)!;
    const month = monthOf(new Date(a.due_at), ZONE);
    // Only this one John in the month: later weeks the clock deals have nothing in them.
    await db.from("johns").update({ archived_at: new Date().toISOString() }).eq("house_id", house.id);

    // Cover it now, as if it were still inside its late window; then put the tick back in that week.
    await db.from("assignments").update({ closes_at: new Date(Date.now() + DAY).toISOString() }).eq("id", a.id);
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
    await db.from("assignments").update({ done_at: new Date(new Date(a.due_at).getTime() + 5 * HOUR).toISOString() }).eq("id", a.id);

    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 2 * DAY));
    expect((await reread("assignments", a.id)).outcome).toBe("covered");
    const { data: forfeits } = await db.from("ledger_entries").select("user_id, amount_minor, counterparty_user_id").eq("assignment_id", a.id);
    expect(forfeits).toEqual([{ user_id: a.user_id, amount_minor: -300, counterparty_user_id: coverer.userId }]);

    await tickHouse(db, house.id, new Date(week.endsAt.getTime() + 40 * DAY));
    const { data: rows } = await db.from("ledger_entries").select("user_id, amount_minor").eq("house_id", house.id).eq("month", month);
    const net = (id: string) => rows!.filter((r) => r.user_id === id).reduce((s, r) => s + r.amount_minor, 0);
    expect([net(a.user_id), net(coverer.userId), net(third.userId)]).toEqual([-300, 300, 0]);
  });
});
