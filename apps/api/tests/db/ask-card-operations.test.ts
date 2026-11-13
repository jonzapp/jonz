import { askRef, ChatMove, OPERATION_IO, type ChatMove as Move } from "@app/core";
import { describe, expect, it } from "vitest";

import type { DraftAnswer, DraftContext, JonzTools } from "@/lib/ai/house-draft";
import { chatTurn } from "@/lib/moves/draft";
import { adminClient } from "@/tests/support/clients";
import { addJohns, makeHouse, thisWeek } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";

/**
 * Ask Jonz's generic card (core ask-operations.ts), with Claude stood in
 * for: each house write's tool takes refs from the reads, the card holds the
 * one id each stands for in this house, checked against the operation's own
 * input, and nothing is written until the person taps.
 */

const db = adminClient();
const said = (text: string) => [{ role: "user" as const, text }];
const done: DraftAnswer = { raw: { reply: "On the card.", ask: { kind: "none" } }, inputTokens: 1, outputTokens: 1 };

async function turn(actor: { db: never; userId: string } | { db: unknown; userId: string }, houseId: string, play: (tools: JonzTools, ctx: DraftContext) => Promise<void>) {
  const result = await chatTurn(actor as never, { houseId, messages: said("Do it"), current: null, now: rightNow() }, async (ctx, tools) => {
    await play(tools, ctx);
    return done;
  });
  if ("refusal" in result) throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  return result.moves ?? [];
}

describe("the card's house writes", () => {
  it("turns refs into this house's ids, fills in the rest, and writes nothing", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ben] = house.members;
    const [bins, bath] = await addJohns(house.id, [{ name: "Bins out" }, { name: "Bathroom" }], thisWeek());
    const { data: before } = await db.from("houses").select("name, stake_minor, dispute_hours").eq("id", house.id).single();
    await db.from("members").update({ suits_days: [2, 4], rather: { [bath.id]: 1 } }).eq("house_id", house.id).eq("user_id", house.admin.userId);

    const moves = await turn(house.admin, house.id, async (tools) => {
      expect(tools.operations).toContain("set_member_role");
      expect((await tools.offerOperation("set_member_role", { userId: askRef(ben.userId), role: "admin", say: "Make Ben an admin" })).ok).toBe(true);
      // Only what changes: the rest of the rules stay as the house has them.
      expect((await tools.offerOperation("save_house_rules", { stakeMinor: 700, name: null, say: "Stake £7" })).ok).toBe(true);
      // Preferences keyed by Johns' refs, added to the ones already kept.
      expect((await tools.offerOperation("save_prefs", { days: null, bestTime: "evening", rather: { [askRef(bins.id)]: -1 }, say: "Rather not do the bins" })).ok).toBe(true);
      expect(await tools.offerOperation("set_member_role", { userId: askRef(ben.userId), role: "admin", say: "Again" })).toEqual({ ok: true, said: "Already on the card." });
    });

    expect(moves.map((m) => ChatMove.parse(m))).toHaveLength(3);
    const [role, rules, prefs] = moves as Extract<Move, { kind: "operation" }>[];
    expect(role).toMatchObject({ kind: "operation", operation: "set_member_role", input: { houseId: house.id, userId: ben.userId, role: "admin" }, title: "Make Ben an admin" });
    expect(role.meta).toMatch(/^Make someone an admin|·/);
    expect(rules.input).toMatchObject({ houseId: house.id, name: before!.name, stakeMinor: 700, disputeHours: before!.dispute_hours });
    expect(OPERATION_IO.save_house_rules.input.safeParse(rules.input).success).toBe(true);
    expect(prefs.input).toEqual({ houseId: house.id, days: [2, 4], bestTime: "evening", rather: { [bath.id]: 1, [bins.id]: -1 } });

    // Nothing was done before a tap.
    const { data: after } = await db.from("houses").select("name, stake_minor, dispute_hours").eq("id", house.id).single();
    expect(after).toEqual(before);
    const { data: still } = await db.from("members").select("role").eq("house_id", house.id).eq("user_id", ben.userId).single();
    expect(still!.role).toBe("member");
  });

  it("refuses a ref that isn't one, isn't in this house, or isn't what the person may do", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const other = await makeHouse(["Zed"]);
    const [ben] = house.members;

    const moves = await turn(house.admin, house.id, async (tools) => {
      expect((await tools.offerOperation("set_member_role", { userId: "ben", role: "admin", say: "x" })).said).toMatch(/isn't a ref/);
      const elsewhere = await tools.offerOperation("set_member_role", { userId: askRef(other.admin.userId), role: "admin", say: "x" });
      expect(elsewhere).toMatchObject({ ok: false, said: expect.stringMatching(/^Nothing in the house has the ref/) });
      expect((await tools.offerOperation("set_member_role", { userId: askRef(ben.userId), role: "boss", say: "x" })).said).toMatch(/^That doesn't fit set_member_role: role/);
    });
    expect(moves).toEqual([]);

    const theirs = await turn(ben, house.id, async (tools) => {
      expect(tools.operations).not.toContain("set_member_role");
      // Called all the same, it's refused.
      expect((await tools.offerOperation("set_member_role", { userId: askRef(ben.userId), role: "admin", say: "x" })).ok).toBe(false);
      expect(tools.operations).toContain("raise_dispute");
    });
    expect(theirs).toEqual([]);
  });

  it("reads the Wall, questioned ticks and swap asks, with refs", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    let reads: string[] = [];
    await turn(house.admin, house.id, async (tools) => {
      reads = [await tools.reads.wall(), await tools.reads.disputes(), await tools.reads.swaps()];
    });
    for (const r of reads) expect(typeof r).toBe("string");
    expect(reads[0]).toMatch(/ref [0-9a-f]{8}|Nothing on the Wall/);
  });
});
