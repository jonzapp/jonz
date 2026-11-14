import { beforeEach, describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";
import { fromNow } from "@/tests/support/clock";

/**
 * Resetting Ask Jonz use (docs/specs/ask-usage-reset.md): the owner
 * (ask_usage:write) makes a house's, some people's or everyone's turns so
 * far stop counting toward every limit. Nothing is deleted: each turn is
 * still its cost.
 */

const db = adminClient();
const DAY = 24 * 60 * 60 * 1000;
const since = () => fromNow(-7 * DAY).toISOString();

/** A turn of Ask Jonz an hour ago, of so many tokens. */
async function turn(houseId: string, userId: string, tokens: number) {
  expectOk(await db.from("house_drafts").insert({ house_id: houseId, user_id: userId, outcome: "ai", input_tokens: tokens, created_at: fromNow(-3_600_000).toISOString() }));
}

async function houseUsed(houseId: string) {
  const { data } = await db.rpc("ask_usage", { p_house: houseId, p_user: houseId, p_since: since() });
  return Number(data?.[0]?.house_used ?? 0);
}

async function accountUsed(userId: string) {
  const { data } = await db.rpc("ask_account_used", { p_user: userId, p_since: since() });
  return Number(data?.[0]?.used ?? 0);
}

/** Whether the person may start a turn under a one-turn-a-day limit. */
async function canClaim(house: House, userId: string) {
  const { error } = await db.rpc("claim_ask_turn", {
    p_house: house.id, p_user: userId, p_since: since(), p_pool: 1_000_000, p_share: 1_000_000,
    p_user_day: 1, p_reserve: 0, p_account: 1_000_000, p_account_since: since(),
  });
  return error === null;
}

describe("owner_reset_ask_usage", () => {
  let owner: Actor;
  let support: Actor;
  let ownerNoCode: Actor;

  beforeEach(async () => {
    owner = await signedInUser("Glyn Owner");
    support = await signedInUser("Support helper");
    ownerNoCode = await signedInUser("Owner without code");
    expectOk(await db.from("app_owners").insert([{ user_id: owner.userId, role: "owner" }, { user_id: ownerNoCode.userId, role: "owner" }, { user_id: support.userId, role: "support" }]));
    await passSecondFactor(owner);
    await passSecondFactor(support);
  });

  it("resets one house: its pool, and its people's turns there, start again; the turns stay", async () => {
    const house = await makeHouse(["Glyn", "Sam"]);
    const other = await makeHouse(["Priya"]);
    await turn(house.id, house.admin.userId, 300);
    await turn(house.id, house.members[0].userId, 200);
    await turn(other.id, other.admin.userId, 100);
    expect(await houseUsed(house.id)).toBe(500);
    expect(await canClaim(house, house.admin.userId)).toBe(false);

    const res = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "house", p_house: house.id, p_reason: "Ran out testing" });
    expectOk(res);
    expect(res.data).toEqual({ turns: 2, people: 2 });
    expect(await houseUsed(house.id)).toBe(0);
    expect(await accountUsed(house.admin.userId)).toBe(0);
    expect(await houseUsed(other.id)).toBe(100);
    expect(await canClaim(house, house.admin.userId)).toBe(true);

    const { count } = await db.from("house_drafts").select("*", { count: "exact", head: true }).eq("house_id", house.id).not("reset_at", "is", null);
    expect(count).toBe(2);
    const { data: audit } = await db.from("admin_audit").select("actor, action, target_kind, target_id, reason").eq("target_id", house.id);
    expect(audit).toEqual([{ actor: owner.userId, action: "ask.reset_usage", target_kind: "house", target_id: house.id, reason: "Ran out testing" }]);
  });

  it("resets the people named, in every house, and nobody else", async () => {
    const house = await makeHouse(["Glyn", "Sam", "Jo"]);
    const [sam, jo] = house.members;
    await turn(house.id, house.admin.userId, 300);
    await turn(house.id, sam.userId, 200);
    await turn(house.id, jo.userId, 50);

    const res = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "people", p_people: [sam.userId, jo.userId, sam.userId] });
    expectOk(res);
    expect(res.data).toEqual({ turns: 2, people: 2 });
    expect(await accountUsed(sam.userId)).toBe(0);
    expect(await accountUsed(jo.userId)).toBe(0);
    expect(await accountUsed(house.admin.userId)).toBe(300);
    expect(await houseUsed(house.id)).toBe(300);
  });

  it("resets everyone", async () => {
    const a = await makeHouse(["Ana"]);
    const b = await makeHouse(["Ben"]);
    await turn(a.id, a.admin.userId, 10);
    await turn(b.id, b.admin.userId, 20);
    const res = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "everyone" });
    expectOk(res);
    expect((res.data as { turns: number }).turns).toBeGreaterThanOrEqual(2);
    expect(await houseUsed(a.id)).toBe(0);
    expect(await houseUsed(b.id)).toBe(0);
  });

  it("asks who: a house that's there, at least one person, a known audience", async () => {
    const missing = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "house", p_house: "00000000-0000-4000-8000-000000000000" });
    expect(missing.error?.message).toBe("not_found");
    const nobody = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "people", p_people: [] });
    expect(nobody.error?.message).toBe("ask_reset_who");
    const odd = await owner.db.rpc("owner_reset_ask_usage", { p_audience: "someone" });
    expect(odd.error?.message).toBe("ask_reset_audience");
  });

  it("refuses a support helper, an owner without their code and a house admin", async () => {
    const house = await makeHouse(["Glyn"]);
    await turn(house.id, house.admin.userId, 400);
    for (const who of [support, ownerNoCode, house.admin]) {
      expectDenied(await who.db.rpc("owner_reset_ask_usage", { p_audience: "house", p_house: house.id }));
      expectDenied(await who.db.rpc("owner_reset_ask_usage", { p_audience: "everyone" }));
    }
    expect(await houseUsed(house.id)).toBe(400);
  });
});
