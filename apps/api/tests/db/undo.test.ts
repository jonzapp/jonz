import { monthOf } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, type Actor } from "@/tests/support/clients";
import { expectOk, expectRule } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, someoneElse, thisWeek, ZONE } from "@/tests/support/factories";

/**
 * Undo and History (20261101090000_undo_history.sql): each move is recorded
 * by a trigger, house_history says who may undo it now, and undo_action /
 * undo_latest put it back. Yours while it's open; anyone's, to an admin,
 * until its month is shared out.
 */

const db = adminClient();

async function dealtHouse() {
  const house = await makeHouse();
  await addJohns(house.id, [{ name: "Bins" }, { name: "Hoover", points: 3 }], thisWeek());
  const { weekId, assignments } = await deal(house.id, thisWeek(), new Date());
  // A John that isn't the admin's, so the admin acting on it is acting on someone else's.
  const a = assignments.find((x) => x.user_id !== house.admin.userId) ?? assignments[0];
  const owner = actorFor(house, a.user_id);
  return { house, weekId, assignments, a, owner };
}

async function history(actor: Actor, houseId: string) {
  const { data, error } = await actor.db.rpc("house_history", { p_house: houseId });
  expect(error).toBeNull();
  return data!;
}

describe("recording", () => {
  it("records a tick with who did it, and History says it's theirs to undo", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const [row] = await history(owner, house.id);
    expect(row).toMatchObject({ kind: "tick", done_by: owner.userId, subject_user_id: owner.userId, assignment_id: a.id, reach: "own" });
    expect((row.data as { name: string }).name).toBe(a.name);
  });

  it("records nothing the engine does, and nothing an undo puts back", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await owner.db.rpc("undo_latest", { p_kind: "tick", p_about: a.id }));
    const { data } = await db.from("house_actions").select("kind, undone_at").eq("house_id", house.id);
    expect(data).toHaveLength(1);
    expect(data![0].undone_at).not.toBeNull();
  });

  it("is read only by the house", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const other = await makeHouse(["Zed"]);
    expect(await history(other.admin, house.id)).toEqual([]);
    const { data } = await other.admin.db.from("house_actions").select("id").eq("house_id", house.id);
    expect(data).toEqual([]);
  });
});

describe("undoing your own", () => {
  it("opens the John again and takes its Wall post away", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    expectOk(await owner.db.rpc("undo_latest", { p_kind: "tick", p_about: a.id }));
    expect((await reread("assignments", a.id)).done_at).toBeNull();
    const { data: posts } = await db.from("events").select("kind").eq("assignment_id", a.id);
    expect(posts).toEqual([]);
    const [row] = await history(owner, house.id);
    expect(row.reach).toBeNull();
    expect(row.undone_by).toBe(owner.userId);
  });

  it("is refused once undone, and to a housemate who isn't an admin", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const [row] = await history(owner, house.id);
    const third = house.everyone.find((m) => m.userId !== owner.userId && m.userId !== house.admin.userId)!;
    expect((await history(third, house.id))[0].reach).toBeNull();
    expectRule(await third.db.rpc("undo_action", { p_action: row.id }), "cannot_undo");
    expectOk(await owner.db.rpc("undo_action", { p_action: row.id }));
    expectRule(await owner.db.rpc("undo_action", { p_action: row.id }), "already_undone");
  });

  it("gives an immunity token back and opens the John", async () => {
    const { house, a, owner } = await dealtHouse();
    await db.from("members").update({ immunity_tokens: 1 }).eq("house_id", house.id).eq("user_id", owner.userId);
    expectOk(await owner.db.rpc("use_immunity", { p_assignment: a.id }));
    expectOk(await owner.db.rpc("undo_latest", { p_kind: "immunity", p_about: a.id }));
    const row = await reread("assignments", a.id);
    expect(row).toMatchObject({ outcome: null, excused: false });
    const { data: m } = await db.from("members").select("immunity_tokens").eq("house_id", house.id).eq("user_id", owner.userId).single();
    expect(m!.immunity_tokens).toBe(1);
  });

  it("withdraws a dispute nobody else has voted on, and takes back a vote", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const raiser = someoneElse(house, owner.userId);
    const voter = house.everyone.find((m) => m.userId !== owner.userId && m.userId !== raiser.userId)!;
    const { data: disputeId } = await raiser.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Still full" });
    expectOk(await voter.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: true }));
    // Someone else has voted: the raiser can't withdraw it now.
    const raisers = await history(raiser, house.id);
    expect(raisers.find((r) => r.kind === "dispute")!.reach).toBe(raiser.userId === house.admin.userId ? "admin" : null);
    expectOk(await voter.db.rpc("undo_latest", { p_kind: "vote", p_about: disputeId! }));
    expect((await history(raiser, house.id)).find((r) => r.kind === "dispute")!.reach).toBe("own");
    expectOk(await raiser.db.rpc("undo_latest", { p_kind: "dispute", p_about: a.id }));
    const { data } = await db.from("disputes").select("id").eq("assignment_id", a.id);
    expect(data).toEqual([]);
  });
});

describe("an admin undoing someone else's", () => {
  it("opens it and tells them on the Wall", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const [row] = await history(house.admin, house.id);
    expect(row.reach).toBe("admin");
    expectOk(await house.admin.db.rpc("undo_action", { p_action: row.id }));
    const { data: post } = await db.from("events").select("user_id, data").eq("house_id", house.id).eq("kind", "undone").single();
    expect(post).toMatchObject({ user_id: owner.userId, data: { by: house.admin.userId, what: "tick", name: a.name } });
  });

  it("reaches a settled tick and its forfeit, until the month is shared out", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const month = monthOf(new Date(a.due_at), ZONE);
    await db.from("assignments").update({ outcome: "late", settled_at: new Date().toISOString() }).eq("id", a.id);
    await db.from("ledger_entries").insert({ house_id: house.id, user_id: owner.userId, kind: "forfeit", amount_minor: -100, month, assignment_id: a.id });
    expect((await history(owner, house.id))[0].reach).toBeNull();
    expect((await history(house.admin, house.id))[0].reach).toBe("admin");

    await db.from("month_closes").insert({ house_id: house.id, month });
    expect((await history(house.admin, house.id))[0].reach).toBeNull();
    await db.from("month_closes").delete().eq("house_id", house.id).eq("month", month);

    // The toast's undo_latest is only ever for your own moves.
    expectRule(await house.admin.db.rpc("undo_latest", { p_kind: "tick", p_about: a.id }), "cannot_undo");
    const [row] = await history(house.admin, house.id);
    expectOk(await house.admin.db.rpc("undo_action", { p_action: row.id }));
    expect(await reread("assignments", a.id)).toMatchObject({ outcome: null, settled_at: null, done_at: null });
    const { data: forfeits } = await db.from("ledger_entries").select("id").eq("assignment_id", a.id);
    expect(forfeits).toEqual([]);
  });

  it("puts a role and a removed housemate back", async () => {
    const house = await makeHouse();
    const [ben] = house.members;
    expectOk(await house.admin.db.rpc("set_member_role", { p_house: house.id, p_user: ben.userId, p_role: "admin" }));
    expectOk(await house.admin.db.rpc("undo_latest", { p_kind: "role", p_about: ben.userId }));
    const { data: role } = await db.from("members").select("role").eq("house_id", house.id).eq("user_id", ben.userId).single();
    expect(role!.role).toBe("member");

    await db.from("members").update({ streak: 3, swap_tokens: 1 }).eq("house_id", house.id).eq("user_id", ben.userId);
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expectOk(await house.admin.db.rpc("undo_latest", { p_kind: "remove", p_about: ben.userId }));
    const { data: back } = await db.from("members").select("role, streak, swap_tokens").eq("house_id", house.id).eq("user_id", ben.userId).single();
    expect(back).toEqual({ role: "member", streak: 3, swap_tokens: 1 });
  });
});

describe("undoing a flag", () => {
  it("takes the flag and its share back off", async () => {
    const house = await makeHouse();
    const [bins] = await addJohns(house.id, [{ name: "Bins", points: 3, onCall: {} }, { name: "Hoover" }], thisWeek());
    const { weekId } = await deal(house.id, thisWeek(), new Date());
    const shares = async () => {
      const { data } = await db.from("week_shares").select("user_id, share").eq("week_id", weekId);
      return new Map(data!.map((r) => [r.user_id, Number(r.share)]));
    };
    const before = await shares();
    const flagger = house.members[0];
    const { data: flagId } = await flagger.db.rpc("raise_flag", { p_john: bins.id });
    expectOk(await flagger.db.rpc("undo_latest", { p_kind: "flag", p_about: flagId! }));
    const { data: flags } = await db.from("assignments").select("id").eq("id", flagId!);
    expect(flags).toEqual([]);
    const after = await shares();
    for (const m of house.everyone) expect(after.get(m.userId)).toBeCloseTo(before.get(m.userId)!, 1);
  });
});
