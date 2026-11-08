import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import {
  actorFor,
  addJohns,
  deal,
  makeHouse,
  reread,
  someoneElse,
  thisWeek,
  weeksAgo,
} from "@/tests/support/factories";

/**
 * The housemate functions, attacked. Each one checks who is calling and what
 * state the John is in; these tests try the obvious ways round both.
 */

async function dealtHouse(johns = [{ name: "Bins", points: 2 }, { name: "Bathroom", points: 4 }]) {
  const house = await makeHouse();
  await addJohns(house.id, johns, thisWeek());
  const { weekId, assignments } = await deal(house.id, thisWeek(), new Date());
  return { house, weekId, assignments };
}

describe("mark_done", () => {
  it("is for the person holding the John", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    expectDenied(await someoneElse(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).done_at).toBeNull();

    expectOk(await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();
    expectRule(await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }), "already_done");
  });

  it("puts a tick on the Wall", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id });
    const { data } = await house.admin.db.from("events").select("kind, user_id").eq("assignment_id", a.id);
    expect(data).toEqual([{ kind: "done", user_id: a.user_id }]);
  });

  it("refuses a week that has closed", async () => {
    const house = await makeHouse();
    await addJohns(house.id, [{ name: "Bins" }], weeksAgo(2));
    const { assignments } = await deal(house.id, weeksAgo(2), weeksAgo(2).startsAt);
    const a = assignments[0];
    expectRule(await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id }), "week_closed");
  });

  it("needs a photo on a photo John, from that John's own folder", async () => {
    const { house, assignments } = await dealtHouse([{ name: "Oven", points: 5, needsPhoto: true } as never]);
    const a = assignments[0];
    const me = actorFor(house, a.user_id);
    expectRule(await me.db.rpc("mark_done", { p_assignment: a.id }), "photo_required");
    expectRule(
      await me.db.rpc("mark_done", { p_assignment: a.id, p_photo_path: `${house.id}/someone-else/x.jpg` }),
      "photo_path",
    );
    expectOk(await me.db.rpc("mark_done", { p_assignment: a.id, p_photo_path: `${house.id}/${a.id}/x.jpg` }));
  });

  it("can be undone while it is still being checked", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    const me = actorFor(house, a.user_id);
    await me.db.rpc("mark_done", { p_assignment: a.id });
    expectOk(await me.db.rpc("undo_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).done_at).toBeNull();
    const { data } = await house.admin.db.from("events").select("kind").eq("assignment_id", a.id);
    expect(data).toEqual([]);
  });
});

describe("disputes", () => {
  async function ticked() {
    const d = await dealtHouse();
    const a = d.assignments[0];
    await actorFor(d.house, a.user_id).db.rpc("mark_done", { p_assignment: a.id });
    return { ...d, a, owner: actorFor(d.house, a.user_id), other: someoneElse(d.house, a.user_id) };
  }

  it("cannot be raised on your own tick, or on a John nobody ticked", async () => {
    const { house, assignments, a, owner } = await ticked();
    expectDenied(await owner.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Me?" }));
    const untouched = assignments.find((x) => x.id !== a.id)!;
    expectRule(
      await someoneElse(house, untouched.user_id).db.rpc("raise_dispute", {
        p_assignment: untouched.id,
        p_reason: "Not done",
      }),
      "not_disputable",
    );
  });

  it("counts the raiser's vote, allows one open dispute, and locks undo", async () => {
    const { house, a, owner, other } = await ticked();
    const { data: disputeId, error } = await other.db.rpc("raise_dispute", {
      p_assignment: a.id,
      p_reason: "The bath still has a ring",
    });
    expect(error).toBeNull();
    const { data: votes } = await house.admin.db.from("dispute_votes").select("user_id, uphold").eq("dispute_id", disputeId!);
    expect(votes).toEqual([{ user_id: other.userId, uphold: true }]);

    const third = house.everyone.find((x) => x.userId !== owner.userId && x.userId !== other.userId)!;
    expectRule(await third.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Me too" }), "already_disputed");
    expectRule(await owner.db.rpc("undo_done", { p_assignment: a.id }), "under_dispute");
  });

  it("lets everyone but the owner vote", async () => {
    const { a, owner, other } = await ticked();
    const { data: disputeId } = await other.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Hmm" });
    expectDenied(await owner.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: false }));
    expectOk(await other.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: false }));
  });

  it("is not visible to, or votable by, anyone outside the house", async () => {
    const { a, other } = await ticked();
    const { data: disputeId } = await other.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Hmm" });
    const outsider = await signedInUser("Nosy");
    expectDenied(await outsider.db.rpc("cast_vote", { p_dispute: disputeId!, p_uphold: true }));
    expectDenied(await outsider.db.rpc("raise_dispute", { p_assignment: a.id, p_reason: "Hmm" }));
  });
});

describe("perks", () => {
  it("spends an immunity token to excuse an open John", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    const me = actorFor(house, a.user_id);
    expectRule(await me.db.rpc("use_immunity", { p_assignment: a.id }), "no_immunity");

    await adminClient().from("members").update({ immunity_tokens: 1 }).eq("user_id", me.userId);
    expectOk(await me.db.rpc("use_immunity", { p_assignment: a.id }));
    const row = await reread("assignments", a.id);
    expect([row.excused, row.outcome]).toEqual([true, "excused"]);
    const { data: m } = await adminClient().from("members").select("immunity_tokens").eq("user_id", me.userId).single();
    expect(m!.immunity_tokens).toBe(0);
    expectRule(await me.db.rpc("use_immunity", { p_assignment: a.id }), "already_settled");
  });

  it("cannot spend someone else's John", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    const other = someoneElse(house, a.user_id);
    await adminClient().from("members").update({ immunity_tokens: 1 }).eq("user_id", other.userId);
    expectDenied(await other.db.rpc("use_immunity", { p_assignment: a.id }));
  });

  it("swaps two open Johns with a swap token", async () => {
    const { house, assignments } = await dealtHouse();
    const [mine, theirs] = assignments;
    // Three people, two Johns: fair shares always spreads them.
    expect(mine.user_id).not.toBe(theirs.user_id);
    const me = actorFor(house, mine.user_id);
    expectRule(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }), "no_swap");
    await adminClient().from("members").update({ swap_tokens: 1 }).eq("user_id", me.userId);
    expectOk(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }));
    expect((await reread("assignments", mine.id)).user_id).toBe(theirs.user_id);
    expect((await reread("assignments", theirs.id)).user_id).toBe(me.userId);
  });

  it("will not swap for a John that is already done", async () => {
    const { house, assignments } = await dealtHouse();
    const [mine, theirs] = assignments;
    expect(mine.user_id).not.toBe(theirs.user_id);
    await actorFor(house, theirs.user_id).db.rpc("mark_done", { p_assignment: theirs.id });
    const me = actorFor(house, mine.user_id);
    await adminClient().from("members").update({ swap_tokens: 1 }).eq("user_id", me.userId);
    expectRule(await me.db.rpc("use_swap", { p_mine: mine.id, p_theirs: theirs.id }), "not_swappable");
  });
});

describe("confirm_payment", () => {
  it("lets only the person owed say they were paid, and never more than owed", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    await adminClient().from("month_closes").insert({ house_id: house.id, month: "2026-09" });
    await adminClient().from("ledger_entries").insert([
      { house_id: house.id, user_id: ben.userId, kind: "share", amount_minor: -300, month: "2026-09" },
      { house_id: house.id, user_id: ava.userId, kind: "share", amount_minor: 300, month: "2026-09" },
    ]);
    expectRule(await ben.db.rpc("confirm_payment", { p_house: house.id, p_from: ava.userId, p_amount: 300 }), "more_than_owed");
    expectRule(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 301 }), "more_than_owed");
    expectOk(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 300 }));
    const { data } = await adminClient().from("ledger_entries").select("user_id, amount_minor").eq("house_id", house.id);
    const sum = (id: string) => data!.filter((r) => r.user_id === id).reduce((s, r) => s + r.amount_minor, 0);
    expect([sum(ava.userId), sum(ben.userId)]).toEqual([0, 0]);
  });

  it("counts what the app offers: closed months and payments, not this month's forfeits, which aren't shared out yet", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    await adminClient().from("month_closes").insert({ house_id: house.id, month: "2026-09" });
    await adminClient().from("ledger_entries").insert([
      { house_id: house.id, user_id: ben.userId, kind: "share", amount_minor: -401, month: "2026-09" },
      { house_id: house.id, user_id: ava.userId, kind: "share", amount_minor: 401, month: "2026-09" },
      // Ava was late this month, still open: her whole ledger says 301.
      { house_id: house.id, user_id: ava.userId, kind: "forfeit", amount_minor: -100, month: "2099-01" },
    ]);
    expectOk(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 401 }));
    // And an open month's entries never make a debt of their own.
    await adminClient().from("ledger_entries").insert({ house_id: house.id, user_id: ben.userId, kind: "forfeit", amount_minor: -300, month: "2099-01" });
    expectRule(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 1 }), "more_than_owed");
  });

  it("marks a debt moved into Splitwise as a payment, says so on the Wall, and takes nothing else as where it went", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    // Where the house settles up is an admin's setting, like the rest of the rules.
    // (RLS makes a housemate's update touch nothing rather than fail.)
    await ben.db.from("houses").update({ settle_in: "splitwise" }).eq("id", house.id);
    expect((await adminClient().from("houses").select("settle_in").eq("id", house.id).single()).data!.settle_in).toBe("jonz");
    expectOk(await ava.db.from("houses").update({ settle_in: "splitwise" }).eq("id", house.id));
    expect((await adminClient().from("houses").select("settle_in").eq("id", house.id).single()).data!.settle_in).toBe("splitwise");
    expect((await adminClient().from("houses").update({ settle_in: "venmo" }).eq("id", house.id)).error).not.toBeNull();
    await adminClient().from("month_closes").insert({ house_id: house.id, month: "2026-09" });
    await adminClient().from("ledger_entries").insert([
      { house_id: house.id, user_id: ben.userId, kind: "share", amount_minor: -250, month: "2026-09" },
      { house_id: house.id, user_id: ava.userId, kind: "share", amount_minor: 250, month: "2026-09" },
    ]);
    expectRule(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 250, p_via: "cash" }), "bad_payment");
    // Only the person owed, as with money received.
    expectRule(await ben.db.rpc("confirm_payment", { p_house: house.id, p_from: ava.userId, p_amount: 250, p_via: "splitwise" }), "more_than_owed");
    expectOk(await ava.db.rpc("confirm_payment", { p_house: house.id, p_from: ben.userId, p_amount: 250, p_via: "splitwise" }));
    const { data: ledger } = await adminClient().from("ledger_entries").select("user_id, kind, amount_minor").eq("house_id", house.id).eq("kind", "payment");
    expect(ledger!.map((r) => r.amount_minor).sort((a, b) => a - b)).toEqual([-250, 250]);
    const { data: events } = await adminClient().from("events").select("data").eq("house_id", house.id).eq("kind", "paid");
    expect(events!.map((e) => e.data)).toEqual([{ to: ava.userId, amount: 250, via: "splitwise" }]);
  });
});

describe("reactions", () => {
  it("are yours to add and take back, and only in your house", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    await actorFor(house, a.user_id).db.rpc("mark_done", { p_assignment: a.id });
    const { data: event } = await adminClient().from("events").select("id").eq("assignment_id", a.id).single();
    const fan = someoneElse(house, a.user_id);

    expectOk(await fan.db.from("reactions").insert({ event_id: event!.id, kind: "fire" }));
    expectDenied(
      await fan.db.from("reactions").insert({ event_id: event!.id, kind: "nice", user_id: a.user_id }),
    );
    const outsider = await signedInUser("Nosy");
    expectDenied(await outsider.db.from("reactions").insert({ event_id: event!.id, kind: "eyes" }));

    expectOk(await fan.db.from("reactions").delete().eq("event_id", event!.id).eq("kind", "fire"));
    const { data } = await adminClient().from("reactions").select("*").eq("event_id", event!.id);
    expect(data).toEqual([]);
  });
});

describe("photo receipts", () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

  it("upload only into your own open John's folder, and are seen only by the house", async () => {
    const { house, assignments } = await dealtHouse();
    const a = assignments[0];
    const me = actorFor(house, a.user_id);
    const other = someoneElse(house, a.user_id);
    const path = `${house.id}/${a.id}/proof.png`;

    const denied = await other.db.storage.from("proofs").upload(`${house.id}/${a.id}/fake.png`, png);
    expect(denied.error).not.toBeNull();

    const ok = await me.db.storage.from("proofs").upload(path, png);
    expect(ok.error).toBeNull();

    const seen = await other.db.storage.from("proofs").download(path);
    expect(seen.error).toBeNull();

    const outsider = await signedInUser("Nosy");
    const hidden = await outsider.db.storage.from("proofs").download(path);
    expect(hidden.error).not.toBeNull();

    await adminClient().storage.from("proofs").remove([path]);
  });
});
