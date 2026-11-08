import { TELL_COPY } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse, type PushMessage } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek } from "@/tests/support/factories";

/**
 * Telling people (20261210090000_tell_people.sql, docs/specs/tell-people.md):
 * the join screen's stake, a rule change posted on the Wall, each post
 * pushed once to whoever it's about, the owner told once when covering
 * opens, and "I'm on it" holding covers off.
 *
 * Every time is relative to the moment the test runs.
 */

const HOUR = 3_600_000;
const db = adminClient();

type Sent = { to: string[]; message: PushMessage };

function recorder() {
  const sent: Sent[] = [];
  return { sent, notify: async (to: string[], message: PushMessage) => void sent.push({ to, message }) };
}

/** A John dealt this week, made `overdueHours` late. */
async function overdueJohn(overdueHours: number) {
  const house = await makeHouse();
  await addJohns(house.id, [{ name: "Bins" }], thisWeek());
  const { assignments } = await deal(house.id, thisWeek(), new Date());
  const a = assignments[0];
  expectOk(await db.from("assignments").update({ due_at: new Date(Date.now() - overdueHours * HOUR).toISOString() }).eq("id", a.id));
  return { house, a, owner: actorFor(house, a.user_id), coverer: someoneElse(house, a.user_id) };
}

describe("the join screen", () => {
  it("shows the stake and what late and missed Johns cost", async () => {
    const house = await makeHouse();
    expectOk(
      await db.from("houses").update({ stake_minor: 2500, late_forfeit_minor: 150, missed_forfeit_minor: 400 }).eq("id", house.id),
    );
    const { data: code } = await db.from("houses").select("join_code").eq("id", house.id).single();
    const { data } = await house.admin.db.rpc("house_by_code", { p_code: code!.join_code });
    expect(data?.[0]).toMatchObject({ stake_minor: 2500, late_forfeit_minor: 150, missed_forfeit_minor: 400 });
    expect(typeof data?.[0]?.currency).toBe("string");
  });
});

describe("a rule change", () => {
  it("is posted on the Wall by whoever made it, with what changed", async () => {
    const house = await makeHouse();
    expectOk(await house.admin.db.from("houses").update({ missed_forfeit_minor: 500, dispute_hours: 48 }).eq("id", house.id));
    const { data } = await db.from("events").select("kind, user_id, data").eq("house_id", house.id).eq("kind", "rules");
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(house.admin.userId);
    expect((data![0].data as { changes: Record<string, unknown> }).changes).toMatchObject({
      missed_forfeit_minor: [300, 500],
      dispute_hours: [24, 48],
    });
  });

  it("isn't posted when the clock or a server changes the house, or nothing the house plays by changed", async () => {
    const house = await makeHouse();
    expectOk(await db.from("houses").update({ stake_minor: 9900 }).eq("id", house.id));
    expectOk(await house.admin.db.from("houses").update({ name: "Flat 9" }).eq("id", house.id));
    const { data } = await db.from("events").select("id").eq("house_id", house.id).eq("kind", "rules");
    expect(data).toEqual([]);
  });
});

describe("the clock's pushes", () => {
  it("tells the owner of a covered John once, and everyone else of a rule change", async () => {
    const { house, a, owner, coverer } = await overdueJohn(4);
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
    expectOk(await house.admin.db.from("houses").update({ late_forfeit_minor: 200 }).eq("id", house.id));
    const first = recorder();
    await tickHouse(db, house.id, new Date(), first.notify);
    const covered = first.sent.find((s) => s.message.title === TELL_COPY.coveredTitle("Bins"));
    expect(covered?.to).toEqual([owner.userId]);
    const rules = first.sent.find((s) => s.message.title === TELL_COPY.rulesTitle);
    expect(rules?.to.sort()).toEqual(house.everyone.map((m) => m.userId).filter((id) => id !== house.admin.userId).sort());

    const again = recorder();
    await tickHouse(db, house.id, new Date(), again.notify);
    expect(again.sent.filter((s) => s.message.title === TELL_COPY.coveredTitle("Bins") || s.message.title === TELL_COPY.rulesTitle)).toEqual(
      [],
    );
  });

  it("tells the owner once when covering opens on their John, and not before", async () => {
    const early = await overdueJohn(1);
    const before = recorder();
    await tickHouse(db, early.house.id, new Date(), before.notify);
    expect(before.sent.filter((s) => s.message.title === TELL_COPY.coverOpenTitle("Bins"))).toEqual([]);

    const { house, a, owner } = await overdueJohn(4);
    const first = recorder();
    await tickHouse(db, house.id, new Date(), first.notify);
    expect(first.sent.filter((s) => s.message.title === TELL_COPY.coverOpenTitle("Bins")).map((s) => s.to)).toEqual([[owner.userId]]);
    expect((await reread("assignments", a.id)).cover_told_at).not.toBeNull();
    const again = recorder();
    await tickHouse(db, house.id, new Date(), again.notify);
    expect(again.sent.filter((s) => s.message.title === TELL_COPY.coverOpenTitle("Bins"))).toEqual([]);
  });
});

describe("I'm on it (hold_cover)", () => {
  it("holds covers off for 2 hours, once, and only for the owner", async () => {
    const { a, owner, coverer } = await overdueJohn(4);
    expectRule(await coverer.db.rpc("hold_cover", { p_assignment: a.id }), "not_yours");
    const { data: until } = await owner.db.rpc("hold_cover", { p_assignment: a.id });
    const held = Date.parse(until!);
    expect(Math.abs(held - (Date.now() + 2 * HOUR))).toBeLessThan(5 * 60_000);
    expectRule(await coverer.db.rpc("cover_john", { p_assignment: a.id }), "cover_held");
    expectRule(await owner.db.rpc("hold_cover", { p_assignment: a.id }), "cover_held_once");

    // Once the hold is up, it can be covered.
    expectOk(await db.from("assignments").update({ cover_held_until: new Date(Date.now() - 1000).toISOString() }).eq("id", a.id));
    expectOk(await coverer.db.rpc("cover_john", { p_assignment: a.id }));
  });

  it("is refused on a John already done", async () => {
    const { a, owner } = await overdueJohn(4);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    expectRule(await owner.db.rpc("hold_cover", { p_assignment: a.id }), "already_done");
  });
});
