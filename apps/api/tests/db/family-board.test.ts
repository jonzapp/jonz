import { nextWeek } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";

/**
 * The board (docs/specs/family-houses.md, "The board"): the family's shared
 * screen on a tablet signed in as a parent. A kid taps to tick their own
 * John there, and that tick waits for a parent's OK like any kid's.
 *
 * Johns are dealt next week, which is open to ticks whenever the suite runs.
 */

const db = adminClient();
const WEEK = nextWeek(thisWeek(), ZONE, 1);

async function family() {
  const house = await makeHouse(["Sam", "Leo", "Ava"], "family");
  const [sam, leo, ava] = house.everyone;
  await addJohns(house.id, [{ name: "Feed the fish", pay: 20 }, { name: "Lay the table" }, { name: "Bins out" }], WEEK);
  const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
  const [fish, table, bins] = assignments;
  expectOk(await db.from("assignments").update({ user_id: leo.userId }).eq("id", fish.id).select("id"));
  expectOk(await db.from("assignments").update({ user_id: ava.userId }).eq("id", table.id).select("id"));
  expectOk(await db.from("assignments").update({ user_id: sam.userId }).eq("id", bins.id).select("id"));
  return { house, sam, leo, ava, fish, table, bins };
}

describe("board_tick", () => {
  it("ticks a kid's John from a parent's tablet, waiting for an OK, and says so on the Wall", async () => {
    const { sam, leo, fish, house } = await family();
    expectOk(await sam.db.rpc("board_tick", { p_assignment: fish.id }));
    const after = await reread("assignments", fish.id);
    expect(after.done_at).not.toBeNull();
    expect(after.awaits_ok).toBe(true);
    const { data: posts } = await db.from("events").select("kind, user_id, data").eq("house_id", house.id).eq("assignment_id", fish.id);
    expect(posts).toHaveLength(1);
    expect(posts![0]).toMatchObject({ kind: "done", user_id: leo.userId, data: { name: "Feed the fish", photo: false, board: true } });
    // A parent's OK lets it stand, as for any kid's tick.
    expectOk(await sam.db.rpc("answer_tick", { p_assignment: fish.id, p_ok: true }));
    expect((await reread("assignments", fish.id)).awaits_ok).toBe(false);
    // Once ticked, not again.
    expectRule(await sam.db.rpc("board_tick", { p_assignment: fish.id }), "already_done");
  });

  it("is a parent's, for a kid's John only", async () => {
    const { leo, sam, fish, table, bins } = await family();
    // A kid can't tick for another kid from the board.
    expectDenied(await leo.db.rpc("board_tick", { p_assignment: table.id }));
    // A parent's own John isn't a kid's.
    expectRule(await sam.db.rpc("board_tick", { p_assignment: bins.id }), "not_a_kid");
    // Nor can anyone outside the family.
    const other = await makeHouse(["Zed"], "family");
    expectDenied(await other.admin.db.rpc("board_tick", { p_assignment: fish.id }));
    expect((await reread("assignments", fish.id)).done_at).toBeNull();
  });

  it("leaves a John that needs a photo to the John sheet", async () => {
    const { sam, fish } = await family();
    expectOk(await db.from("assignments").update({ needs_photo: true }).eq("id", fish.id).select("id"));
    expectRule(await sam.db.rpc("board_tick", { p_assignment: fish.id }), "photo_required");
  });

  it("is only for a family", async () => {
    const house = await makeHouse(["Pat", "Jo"]);
    await addJohns(house.id, [{ name: "Bins out" }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    expectOk(await db.from("assignments").update({ user_id: house.members[0].userId }).eq("id", assignments[0].id).select("id"));
    expectRule(await house.admin.db.rpc("board_tick", { p_assignment: assignments[0].id }), "not_a_family");
  });
});
