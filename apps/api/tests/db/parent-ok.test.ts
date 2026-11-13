import { nextWeek, wordsFor } from "@app/core";
import { describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";
import { pushIn, type PushMessage, type SaidPush } from "@/lib/engine/shared";

const words = wordsFor("en", "housemates");

/**
 * A parent's OK, family step 2 (docs/specs/family-houses.md): in a family a
 * kid's tick waits for a parent to say OK or Not yet, with no closing time,
 * a parent's tick needs none, and nobody can dispute. Housemates don't change.
 *
 * Every John here is dealt next week, so a tick is never late or closed
 * whatever moment the suite runs; the clock is told a pretend time past
 * that week's end, so only the OK can hold a tick.
 */

const HOUR = 3_600_000;
const db = adminClient();
const WEEK = nextWeek(thisWeek(), ZONE, 1);
/** Well past the week: anything not held by an OK would have settled. */
const LATER = new Date(WEEK.endsAt.getTime() + 2 * 24 * HOUR);

/** A family (Sam the parent, Leo and Maya the kids) with one John dealt to `to`. */
async function family(to: "Sam" | "Leo" | "Maya" = "Leo", john = { name: "Feed the fish" }) {
  const house = await makeHouse(["Sam", "Leo", "Maya"], "family");
  const [sam, leo, maya] = house.everyone;
  await addJohns(house.id, [john], WEEK);
  const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
  const holder = { Sam: sam, Leo: leo, Maya: maya }[to];
  const a = assignments[0];
  expectOk(await db.from("assignments").update({ user_id: holder.userId }).eq("id", a.id).select("id"));
  return { house, sam, leo, maya, a };
}

function recorder() {
  const sent: { to: string[]; message: SaidPush }[] = [];
  return { sent, notify: async (to: string[], message: PushMessage) => void sent.push({ to, message: pushIn(message, "en") }) };
}

describe("a kid's tick in a family", () => {
  it("waits for a parent's OK, however long nobody answers", async () => {
    const { house, leo, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).awaits_ok).toBe(true);
    await tickHouse(db, house.id, LATER);
    const row = await reread("assignments", a.id);
    expect(row.outcome).toBeNull();
    expect(row.awaits_ok).toBe(true);
  });

  it("stands once a parent says OK", async () => {
    const { house, sam, leo, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expect((await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true })).data).toBe(leo.userId);
    const okd = await reread("assignments", a.id);
    expect(okd).toMatchObject({ awaits_ok: false, okayed_by: sam.userId });
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", a.id)).outcome).toBe("done");
    const { data } = await db.from("events").select("kind, user_id, data").eq("assignment_id", a.id).eq("kind", "okayed");
    expect(data).toEqual([{ kind: "okayed", user_id: sam.userId, data: { name: "Feed the fish", against: leo.userId } }]);
  });

  it("goes back to the kid, open again, on Not yet", async () => {
    const { sam, leo, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: false }));
    expect(await reread("assignments", a.id)).toMatchObject({ done_at: null, awaits_ok: false, outcome: null });
    const { data } = await db.from("events").select("kind").eq("assignment_id", a.id).eq("kind", "not_yet");
    expect(data).toHaveLength(1);
    // Leo has another go, and it waits again.
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).awaits_ok).toBe(true);
  });

  it("can still be taken back by the kid while it waits", async () => {
    const { leo, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await leo.db.rpc("undo_done", { p_assignment: a.id }));
    expect(await reread("assignments", a.id)).toMatchObject({ done_at: null, awaits_ok: false });
  });

  it("is answered only by a parent of that house", async () => {
    const { sam, leo, maya, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expectRule(await maya.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }), "parents_only");
    expectRule(await leo.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }), "parents_only");
    const other = await makeHouse(["Pat"], "family");
    expectDenied(await other.admin.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }));
    expectOk(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }));
    expectRule(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: false }), "nothing_to_ok");
  });

  it("tells the parents once, never the kid", async () => {
    const { house, sam, leo, a } = await family();
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    const r = recorder();
    await tickHouse(db, house.id, WEEK.startsAt, r.notify);
    await tickHouse(db, house.id, new Date(WEEK.startsAt.getTime() + HOUR), r.notify);
    const asks = r.sent.filter((s) => s.message.body === words('today.parentOk.askBody'));
    expect(asks).toHaveLength(1);
    expect(asks[0].to).toEqual([sam.userId]);
    expect(asks[0].message.title).toBe(words('today.parentOk.askTitle', { kid: "Leo", john: "Feed the fish" }));
  });
});

describe("a parent's tick in a family", () => {
  it("needs no OK and stands at once", async () => {
    const { house, sam, a } = await family("Sam");
    expectOk(await sam.db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).awaits_ok).toBe(false);
    expectRule(await sam.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }), "nothing_to_ok");
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", a.id)).outcome).toBe("done");
  });
});

describe("no vote in a family", () => {
  it("has no window to dispute in, and can't be given one", async () => {
    const { house, sam, leo, maya, a } = await family();
    const { data } = await db.from("houses").select("dispute_hours").eq("id", house.id).single();
    expect(data!.dispute_hours).toBe(0);
    expectOk(await leo.db.rpc("mark_done", { p_assignment: a.id }));
    expectRule(await maya.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Fish look hungry" }), "not_disputable");
    const res = await sam.db.from("houses").update({ dispute_hours: 24 }).eq("id", house.id).select("id");
    expect(res.error?.message ?? "").toContain("houses_family_no_window");
  });
});

describe("housemates", () => {
  it("tick as before: nothing waits for an OK", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    const a = assignments[0];
    const ben = house.members[0];
    expectOk(await db.from("assignments").update({ user_id: ben.userId }).eq("id", a.id).select("id"));
    expectOk(await ben.db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).awaits_ok).toBe(false);
    expectRule(await house.admin.db.rpc("answer_tick", { p_assignment: a.id, p_ok: true }), "nothing_to_ok");
  });
});
