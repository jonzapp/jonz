import { beforeEach, describe, expect, it } from "vitest";

import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, thisWeek, weeksAgo, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";
import { rightNow } from "@/tests/support/clock";

/**
 * Resetting a house (docs/specs/house-reset.md): an admin
 * (house_reset:write), or the app's owner (houses:write) for any house,
 * takes it back to before its first deal. Reset history: what the deals
 * made goes; the house, its people, its list, its rules and its time away
 * stay. Reset everything: the list, groups, time away and rules go too.
 */

const db = adminClient();

/** A house two weeks into its life: dealt, ticked, with money, a perk, a post about a person and History. */
async function lived(): Promise<{ house: House; johnId: string }> {
  const house = await makeHouse(["Glyn", "Sam"]);
  const [john] = await addJohns(house.id, [{ name: "Bins", points: 2 }, { name: "Dishes", points: 3 }], weeksAgo(1));
  await deal(house.id, weeksAgo(1), new Date(weeksAgo(1).startsAt.getTime() + 3_600_000));
  const { assignments } = await deal(house.id, thisWeek(), rightNow());
  const mine = assignments.find((a) => a.user_id === house.admin.userId) ?? assignments[0];
  const who = house.everyone.find((p) => p.userId === mine.user_id)!;
  expectOk(await who.db.rpc("mark_done", { p_assignment: mine.id }));
  expectOk(await db.from("ledger_entries").insert({ house_id: house.id, user_id: house.admin.userId, kind: "forfeit", amount_minor: -100, month: "2026-01" }));
  expectOk(await db.from("month_closes").insert({ house_id: house.id, month: "2026-01" }));
  expectOk(await db.from("members").update({ streak: 3, immunity_tokens: 1, swap_tokens: 1 }).eq("house_id", house.id));
  expectOk(await db.from("away_periods").insert({ house_id: house.id, user_id: house.members[0].userId, starts_on: "2030-01-01", ends_on: "2030-01-07" }));
  expectOk(await db.from("groups").insert({ house_id: house.id, name: "Kitchen" }));
  expectOk(await db.from("houses").update({ stake_minor: 5000, late_forfeit_minor: 250 }).eq("id", house.id));
  return { house, johnId: (john as { id: string }).id };
}

async function count(table: "weeks" | "assignments" | "ledger_entries" | "month_closes" | "house_actions" | "johns" | "members" | "away_periods" | "groups", houseId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: n } = await db.from(table as any).select("*", { count: "exact", head: true }).eq("house_id", houseId);
  return n ?? 0;
}

async function wall(houseId: string) {
  const { data } = await db.from("events").select("kind, user_id").eq("house_id", houseId).order("created_at");
  return data ?? [];
}

describe("reset_house_data", () => {
  it("resets history: back to before its first deal, keeping its people, list, groups, rules and time away", async () => {
    const { house } = await lived();
    expect(await count("weeks", house.id)).toBe(2);
    expect(await count("house_actions", house.id)).toBeGreaterThan(0);
    const before = (await db.from("houses").select("name, stake_minor, late_forfeit_minor, pass_plan").eq("id", house.id).single()).data;
    const joined = (await wall(house.id)).filter((p) => p.kind === "joined").length;

    const res = await house.admin.db.rpc("reset_house_data", { p_house: house.id });
    expectOk(res);
    expect(res.data).toEqual({ weeks: 2, people: 2 });

    for (const table of ["weeks", "assignments", "ledger_entries", "month_closes", "house_actions"] as const) {
      expect(await count(table, house.id), table).toBe(0);
    }
    expect(await count("johns", house.id)).toBe(2);
    expect(await count("members", house.id)).toBe(2);
    expect(await count("away_periods", house.id)).toBe(1);
    expect(await count("groups", house.id)).toBe(1);
    const { data: people } = await db.from("members").select("role, streak, immunity_tokens, swap_tokens").eq("house_id", house.id).order("joined_at");
    expect(people).toEqual([
      { role: "admin", streak: 0, immunity_tokens: 0, swap_tokens: 0 },
      { role: "member", streak: 0, immunity_tokens: 0, swap_tokens: 0 },
    ]);
    const after = (await db.from("houses").select("name, stake_minor, late_forfeit_minor, pass_plan, first_dealt_at").eq("id", house.id).single()).data;
    expect(after).toEqual({ ...before, first_dealt_at: null });

    // The Wall keeps who moved in, loses the deals' posts, and says who reset it.
    const posts = await wall(house.id);
    expect(posts.map((p) => p.kind).filter((k) => k !== "joined")).toEqual(["started_over"]);
    expect(posts.filter((p) => p.kind === "joined")).toHaveLength(joined);
    expect(posts.at(-1)).toEqual({ kind: "started_over", user_id: house.admin.userId });
  });

  it("resets everything: the list, groups, time away and rules go too, the house and its people stay", async () => {
    const { house } = await lived();
    const res = await house.admin.db.rpc("reset_house_data", { p_house: house.id, p_everything: true });
    expectOk(res);
    expect(res.data).toEqual({ weeks: 2, people: 2 });
    for (const table of ["weeks", "assignments", "ledger_entries", "month_closes", "house_actions", "johns", "groups", "away_periods"] as const) {
      expect(await count(table, house.id), table).toBe(0);
    }
    expect(await count("members", house.id)).toBe(2);
    const after = (await db.from("houses").select("name, stake_minor, late_forfeit_minor, first_dealt_at").eq("id", house.id).single()).data;
    expect(after).toEqual({ name: expect.any(String), stake_minor: 2000, late_forfeit_minor: 100, first_dealt_at: null });
    const { data: post } = await db.from("events").select("kind, data").eq("house_id", house.id).eq("kind", "started_over").single();
    expect(post).toEqual({ kind: "started_over", data: { everything: true } });
  });

  it("can be dealt again from the start, like a new house", async () => {
    const { house } = await lived();
    expectOk(await house.admin.db.rpc("reset_house_data", { p_house: house.id, p_everything: false }));
    const { assignments } = await deal(house.id, thisWeek(), rightNow());
    expect(assignments).toHaveLength(2);
  });

  it("refuses a member who isn't an admin, someone from another house, and anyone signed out", async () => {
    const { house } = await lived();
    const stranger = (await makeHouse(["Zed"])).admin;
    for (const who of [house.members[0], stranger]) {
      expectDenied(await who.db.rpc("reset_house_data", { p_house: house.id }));
    }
    expect((await visitor().rpc("reset_house_data", { p_house: house.id })).error).not.toBeNull();
    expect(await count("weeks", house.id)).toBe(2);
  });
});

describe("owner_reset_house_data", () => {
  let owner: Actor;
  let ownerNoCode: Actor;

  beforeEach(async () => {
    owner = await signedInUser("Glyn Owner");
    ownerNoCode = await signedInUser("Owner without code");
    expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
    await passSecondFactor(owner);
  });

  it("resets any house, names nobody on its Wall, and writes the audit entry", async () => {
    const { house } = await lived();
    const res = await owner.db.rpc("owner_reset_house_data", { p_house: house.id, p_reason: "Dealt before they'd joined" });
    expectOk(res);
    expect(res.data).toEqual({ weeks: 2, people: 2 });
    expect(await count("weeks", house.id)).toBe(0);
    expect((await wall(house.id)).at(-1)).toEqual({ kind: "started_over", user_id: null });
    const { data: audit } = await db.from("admin_audit").select("actor, action, reason, before").eq("target_id", house.id);
    expect(audit).toEqual([
      expect.objectContaining({ actor: owner.userId, action: "house.reset_history", reason: "Dealt before they'd joined", before: expect.objectContaining({ weeks: 2 }) }),
    ]);
  });

  it("refuses the house's own admin, an owner without their code and a support helper", async () => {
    const { house } = await lived();
    const support = await signedInUser("Support helper");
    expectOk(await db.from("app_owners").insert({ user_id: support.userId, role: "support" }));
    await passSecondFactor(support);
    for (const who of [house.admin, ownerNoCode, support]) {
      expectDenied(await who.db.rpc("owner_reset_house_data", { p_house: house.id }));
    }
    expect(await count("weeks", house.id)).toBe(2);
    expect((await db.from("admin_audit").select("id").eq("target_id", house.id)).data).toEqual([]);
  });
});
