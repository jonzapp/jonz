import { randomUUID } from "node:crypto";

import type { Overview } from "@app/core";
import { beforeEach, describe, expect, it } from "vitest";

import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, weeksAgo, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * The owner's Overview and Houses (docs/specs/owner-admin.md): only the
 * owner, with their code, reads them; Houses finds a house by its name,
 * join code or someone in it, filters by Pass, how lately it was used and
 * when it started, pages most recently active first, and shows one house's
 * people and Pass. Times are set relative to the moment the test runs, so
 * the results are the same whatever the clock says.
 *
 * Other suites share this stack, so each test finds its own houses by name.
 */

const db = adminClient();
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let house: House;
let owner: Actor;
let ownerNoCode: Actor;
let name: string;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  name = `Elm Street ${randomUUID().slice(0, 8)}`;
  expectOk(await db.from("houses").update({ name }).eq("id", house.id));
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
});

/** The data of a call that must succeed. */
async function ok<T>(call: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const res = await call;
  expectOk(res);
  return res.data;
}

/** Deal a past week and settle its Johns as given: each is done, late or missed, so many days ago. */
async function settle(houseId: string, outcomes: { outcome: "done" | "late" | "missed" | "covered"; daysAgo: number }[]) {
  await addJohns(houseId, [{ name: "Bins" }], weeksAgo(2));
  const { assignments } = await deal(houseId, weeksAgo(2), new Date(Date.now() - 14 * DAY));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...template } = assignments[0];
  const rows = outcomes.map((o) => {
    const at = ago(o.daysAgo);
    return { ...template, due_at: at, outcome: o.outcome, settled_at: at, done_at: o.outcome === "missed" ? null : at };
  });
  expectOk(await db.from("assignments").delete().eq("house_id", houseId));
  expectOk(await db.from("assignments").insert(rows));
}

const page = (actor: Actor, args: Record<string, unknown> = {}) => actor.db.rpc("owner_houses_page", { p_q: name, ...args });

describe("who may read them", () => {
  it("is the owner with their code: not before the code, not a housemate, not a visitor", async () => {
    for (const client of [ownerNoCode.db, house.admin.db, visitor()]) {
      expectDenied(await client.rpc("owner_overview", { p_span: "week", p_zone: "UTC" }));
      expectDenied(await client.rpc("owner_houses_page", { p_q: name }));
      expectDenied(await client.rpc("owner_houses_count", { p_q: name }));
      expectDenied(await client.rpc("owner_house", { p_house: house.id }));
    }
    expectOk(await owner.db.rpc("owner_overview", { p_span: "week", p_zone: "UTC" }));
  });

  it("can't be read past by calling the matching rows directly", async () => {
    const { error } = await owner.db.rpc("owner_houses_match" as never, { p_q: name } as never);
    expect(error).not.toBeNull();
  });
});

describe("Houses", () => {
  it("finds a house by its name, join code, id, or someone in it by name or email", async () => {
    const { data: me } = await db.auth.admin.getUserById(house.members[0].userId);
    const email = me.user!.email!;
    const tries = [name.slice(-8), house.code.toLowerCase(), house.id.slice(0, 8), email];
    for (const q of tries) {
      const data = await ok(owner.db.rpc("owner_houses_page", { p_q: q }));
      expect(data!.map((h) => h.id), q).toContain(house.id);
    }
    const none = await ok(owner.db.rpc("owner_houses_page", { p_q: `nothing ${randomUUID()}` }));
    expect(none).toEqual([]);
  });

  it("gives each house its people, Pass, last tick and on-time share over four weeks", async () => {
    await settle(house.id, [
      { outcome: "done", daysAgo: 2 },
      { outcome: "covered", daysAgo: 3 },
      { outcome: "late", daysAgo: 4 },
      { outcome: "missed", daysAgo: 5 },
      // Older than four weeks: not in the share.
      { outcome: "missed", daysAgo: 40 },
    ]);
    const data = await ok(page(owner));
    expect(data).toHaveLength(1);
    const [row] = data!;
    expect(row).toMatchObject({ id: house.id, name, people: 2, pass_plan: "trial", on_time: 2, settled: 4 });
    expect(Math.abs(new Date(row.last_active!).getTime() - (Date.now() - 2 * DAY))).toBeLessThan(60_000);
  });

  it("filters by Pass, by how lately it was used, and by when it started", async () => {
    const quiet = await makeHouse(["Cal"]);
    expectOk(await db.from("houses").update({ name: `${name} Annexe`, pass_plan: "yearly", pass_ends_at: ago(-200) }).eq("id", quiet.id));
    await settle(house.id, [{ outcome: "done", daysAgo: 1 }]);
    const ids = async (args: Record<string, unknown>) => ((await ok(page(owner, args))) ?? []).map((h) => h.id);

    expect(await ids({})).toEqual([house.id, quiet.id]);
    expect(await ids({ p_pass: "paid" })).toEqual([quiet.id]);
    expect(await ids({ p_pass: "trial" })).toEqual([house.id]);
    expect(await ids({ p_pass: "none" })).toEqual([]);
    expect(await ids({ p_active: "week" })).toEqual([house.id]);
    expect(await ids({ p_active: "quiet" })).toEqual([quiet.id]);
    expect(await ids({ p_after: ago(1) })).toEqual([house.id, quiet.id]);
    expect(await ids({ p_before: ago(1) })).toEqual([]);

    // A trial that ran out is no Pass.
    expectOk(await db.from("houses").update({ pass_ends_at: ago(1) }).eq("id", house.id));
    expect(await ids({ p_pass: "none" })).toEqual([house.id]);
    const count = await ok(owner.db.rpc("owner_houses_count", { p_q: name }));
    expect(count).toBe(2);
  });

  it("pages most recently active first, never-used houses last, each once", async () => {
    const made = [house];
    for (const n of ["Dee", "Eve", "Fay"]) made.push(await makeHouse([n]));
    for (const [i, h] of made.entries()) {
      expectOk(await db.from("houses").update({ name: `${name} ${i}` }).eq("id", h.id));
    }
    // Houses 1 and 2 were used, 1 more lately; 0 and 3 never.
    await settle(made[1].id, [{ outcome: "done", daysAgo: 1 }]);
    await settle(made[2].id, [{ outcome: "done", daysAgo: 3 }]);

    const seen: string[] = [];
    let cursor = null as { at: string; id: string } | null;
    for (let i = 0; i < 4; i++) {
      const data: { id: string; sort_at: string }[] | null = await ok(page(owner, { p_limit: 1, p_cursor_at: cursor?.at, p_cursor_id: cursor?.id }));
      if (!data || data.length === 0) break;
      seen.push(data[0].id);
      cursor = { at: data[0].sort_at, id: data[0].id };
    }
    expect(seen.slice(0, 2)).toEqual([made[1].id, made[2].id]);
    expect(new Set(seen)).toEqual(new Set(made.map((h) => h.id)));
    const rest = await ok(page(owner, { p_cursor_at: cursor!.at, p_cursor_id: cursor!.id }));
    expect(rest).toEqual([]);
  });

  it("shows one house, read only: its people with roles, on time and time away, and its Pass", async () => {
    await settle(house.id, [{ outcome: "done", daysAgo: 2 }]);
    const today = new Date().toISOString().slice(0, 10);
    const later = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    const [ava, ben] = house.everyone;
    expectOk(await db.from("away_periods").insert({ house_id: house.id, user_id: ben.userId, starts_on: ago(2).slice(0, 10), ends_on: later }));
    const data = await ok(owner.db.rpc("owner_house", { p_house: house.id }));
    const one = data as {
      name: string;
      joinCode: string;
      passPlan: string;
      people: { id: string; role: string; awayUntil: string | null; settled: number }[];
    };
    expect(one).toMatchObject({ name, joinCode: house.code, passPlan: "trial" });
    expect(one.people.map((p) => [p.id, p.role])).toEqual([
      [ava.userId, "admin"],
      [ben.userId, "member"],
    ]);
    expect(one.people[1].awayUntil).toBe(later);
    expect(one.people[0].awayUntil ?? today).toBe(today);

    const missing = await ok(owner.db.rpc("owner_house", { p_house: randomUUID() }));
    expect(missing).toBeNull();
  });
});

describe("Overview", () => {
  it("counts the window's houses, people, active houses, Passes, on time and Ask Jonz", async () => {
    const before = (await ok(owner.db.rpc("owner_overview", { p_span: "week", p_zone: "UTC" }))) as unknown as Overview;
    // Inside this week however far into it the test runs: a quarter, half and three quarters of the way from Monday to now.
    const into = (Date.now() - new Date(before.from).getTime()) / DAY;
    expect(into).toBeGreaterThanOrEqual(0);
    expect(into).toBeLessThan(7);
    await settle(house.id, [
      { outcome: "done", daysAgo: into * 0.25 },
      { outcome: "late", daysAgo: into * 0.5 },
      { outcome: "missed", daysAgo: into * 0.75 },
    ]);
    expectOk(await db.from("house_drafts").insert([
      { house_id: house.id, outcome: "ai" },
      { house_id: house.id, outcome: "failed" },
    ]));
    const after = (await ok(owner.db.rpc("owner_overview", { p_span: "week", p_zone: "UTC" }))) as unknown as Overview;
    // Other suites run alongside, so only what this test added is checked, as at least.
    expect(after.span).toBe("week");
    expect(after.houses).toBeGreaterThanOrEqual(before.houses);
    expect(after.housesNew).toBeGreaterThanOrEqual(1);
    expect(after.people).toBeGreaterThanOrEqual(2);
    expect(after.active).toBeGreaterThanOrEqual(1);
    expect(after.onTime.onTime - before.onTime.onTime).toBeGreaterThanOrEqual(1);
    expect(after.onTime.late - before.onTime.late).toBeGreaterThanOrEqual(1);
    expect(after.onTime.missed - before.onTime.missed).toBeGreaterThanOrEqual(1);
    expect(after.ask.turns - before.ask.turns).toBeGreaterThanOrEqual(2);
    expect(after.ask.failed - before.ask.failed).toBeGreaterThanOrEqual(1);
    expect(after.passes.trial).toBeGreaterThanOrEqual(1);
    expect(after.weeks).toHaveLength(10);
    expect(after.weeks[9].active).toBeGreaterThanOrEqual(1);
    expect(new Date(after.weeks[0].ends).getTime()).toBeLessThan(new Date(after.weeks[9].ends).getTime());

    const month = (await ok(owner.db.rpc("owner_overview", { p_span: "month", p_zone: "UTC" }))) as unknown as Overview;
    expect(month.span).toBe("month");
    // Anything else is a week.
    const odd = (await ok(owner.db.rpc("owner_overview", { p_span: "year", p_zone: "Nowhere/Else" }))) as unknown as Overview;
    expect(odd.span).toBe("week");
  });

  it("lists what needs the owner: new reports and deletions due within a day", async () => {
    const [ava, ben] = house.everyone;
    const words = `The bins page is stuck ${randomUUID().slice(0, 8)}`;
    expectOk(await db.from("reports").insert({ user_id: ava.userId, kind: "problem", words }));
    expectOk(
      await db.from("account_deletions").insert({
        user_id: ben.userId,
        requested_by: "owner",
        deletes_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    const data = (await ok(owner.db.rpc("owner_overview", { p_span: "week", p_zone: "UTC" }))) as {
      reports: number;
      needs: { kind: string; id: string; name: string; house: string | null }[];
    };
    expect(data.reports).toBeGreaterThanOrEqual(1);
    // Up to three of each, oldest first, so this test's own may be past the first three when others run.
    for (const n of data.needs) expect(["report", "deletion"]).toContain(n.kind);
    expect(data.needs.filter((n) => n.kind === "report").length).toBeLessThanOrEqual(3);
    expect(data.needs.filter((n) => n.kind === "deletion").length).toBeLessThanOrEqual(3);
  });
});
