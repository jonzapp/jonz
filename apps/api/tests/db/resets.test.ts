import { monthOf, ResetResponse } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/resets/route";
import type { DraftAnswer, DraftContext } from "@/lib/ai/house-draft";
import { chatTurn } from "@/lib/moves/draft";
import { adminClient, type Actor } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";

/**
 * Resets (20261101100000_admin_resets.sql, lib/moves/resets.ts), called as
 * the app calls POST /api/resets: what each would change, then the change,
 * then Undo from History putting it all back.
 */

const BASE = "http://localhost:3211/api/resets";
const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = "http://localhost:8211";
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

async function reset(actor: Actor, body: Record<string, unknown>) {
  const { data } = await actor.db.auth.getSession();
  const response = await POST(
    new Request(BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:8211",
        authorization: `Bearer ${data.session!.access_token}`,
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as ResetResponse & { error?: string } };
}

async function dealtHouse() {
  const house = await makeHouse();
  await addJohns(house.id, [{ name: "Bins" }, { name: "Hoover", points: 3 }, { name: "Mop", points: 2 }], thisWeek());
  const { weekId, assignments } = await deal(house.id, thisWeek(), new Date());
  const a = assignments.find((x) => x.user_id !== house.admin.userId) ?? assignments[0];
  return { house, weekId, assignments, a, owner: actorFor(house, a.user_id) };
}

async function undoLatestReset(admin: Actor, houseId: string) {
  const { data } = await admin.db.rpc("house_history", { p_house: houseId });
  const row = data!.find((r) => r.kind === "reset" && !r.undone_at)!;
  expect(row.reach).toBe("admin");
  expectOk(await admin.db.rpc("undo_action", { p_action: row.id }));
}

describe("who can reset", () => {
  it("is admins only", async () => {
    const { house, weekId, owner } = await dealtHouse();
    const { status } = await reset(owner, { houseId: house.id, kind: "week", week: weekId });
    expect(status).toBe(403);
  });
});

describe("resetting the week", () => {
  it("says what it would clear, clears it, and Undo puts it back", async () => {
    const { house, weekId, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));

    const preview = await reset(house.admin, { houseId: house.id, kind: "week", week: weekId });
    expect(preview.status).toBe(200);
    expect(preview.body.preview!.people[owner.userId].ticks).toBe(1);
    expect(preview.body.preview!.told).toEqual([owner.userId]);
    // Nothing changed yet.
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();

    const applied = await reset(house.admin, { houseId: house.id, kind: "week", week: weekId, apply: true });
    expect(applied.body.action).toBeTruthy();
    expect((await reread("assignments", a.id)).done_at).toBeNull();
    const { data: posts } = await db.from("events").select("kind").eq("assignment_id", a.id);
    expect(posts!.map((p) => p.kind)).not.toContain("done");

    await undoLatestReset(house.admin, house.id);
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();
    const { data: back } = await db.from("events").select("kind").eq("assignment_id", a.id);
    expect(back!.map((p) => p.kind)).toContain("done");
  });

  it("resets one person's week and leaves everyone else's", async () => {
    const { house, weekId, assignments, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const other = assignments.find((x) => x.user_id !== owner.userId)!;
    expectOk(await actorFor(house, other.user_id).db.rpc("mark_done", { p_assignment: other.id }));

    await reset(house.admin, { houseId: house.id, kind: "person_week", week: weekId, user: owner.userId, apply: true });
    expect((await reread("assignments", a.id)).done_at).toBeNull();
    expect((await reread("assignments", other.id)).done_at).not.toBeNull();
  });

  it("re-deals a week even after a tick, and Undo brings the old deal back", async () => {
    const { house, weekId, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    const applied = await reset(house.admin, { houseId: house.id, kind: "redeal", week: weekId, apply: true });
    expect(applied.status).toBe(200);
    const { data: now } = await db.from("assignments").select("id, done_at").eq("week_id", weekId);
    expect(now!.length).toBe(3);
    expect(now!.every((x) => x.done_at === null)).toBe(true);
    expect(now!.map((x) => x.id)).not.toContain(a.id);

    await undoLatestReset(house.admin, house.id);
    const { data: old } = await db.from("assignments").select("id").eq("week_id", weekId);
    expect(old!.map((x) => x.id)).toContain(a.id);
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();
  });
});

describe("changing one result", () => {
  it("marks a John missed with its forfeit, then done again, and leaves an amber mark", async () => {
    const { house, a } = await dealtHouse();
    await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "missed", apply: true });
    expect(await reread("assignments", a.id)).toMatchObject({ outcome: "missed", changed_by: house.admin.userId });
    const { data: forfeit } = await db.from("ledger_entries").select("amount_minor").eq("assignment_id", a.id).eq("kind", "forfeit");
    expect(forfeit).toHaveLength(1);

    await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "done", apply: true });
    expect((await reread("assignments", a.id)).outcome).toBe("done");
    const { data: none } = await db.from("ledger_entries").select("id").eq("assignment_id", a.id).eq("kind", "forfeit");
    expect(none).toEqual([]);
  });

  it("puts a change in a shared-out month in as a correction", async () => {
    const { house, a } = await dealtHouse();
    await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "missed", apply: true });
    const month = monthOf(new Date(a.due_at), ZONE);
    await db.from("month_closes").insert({ house_id: house.id, month });

    const preview = await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "done" });
    expect(preview.body.preview!.correction).toBe(true);
    await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "done", apply: true });
    const { data: lines } = await db.from("ledger_entries").select("user_id, amount_minor").eq("assignment_id", a.id).eq("kind", "correction");
    expect(lines!.reduce((n, l) => n + l.amount_minor, 0)).toBe(0);
    expect(lines!.find((l) => l.user_id === a.user_id)!.amount_minor).toBeGreaterThan(0);
  });
});

describe("skipping a week", () => {
  it("lets everything off, takes the week out of the balances, and Undo brings it back", async () => {
    const { house, weekId, a } = await dealtHouse();
    await reset(house.admin, { houseId: house.id, kind: "skip", week: weekId, apply: true });
    expect((await reread("weeks", weekId)).skipped_at).not.toBeNull();
    expect(await reread("assignments", a.id)).toMatchObject({ outcome: "excused", excused: true });
    const { data: balances } = await db.rpc("house_balances", { p_house: house.id, p_before: "2999-01-01" });
    expect(balances).toEqual([]);

    await undoLatestReset(house.admin, house.id);
    expect((await reread("weeks", weekId)).skipped_at).toBeNull();
    expect(await reread("assignments", a.id)).toMatchObject({ outcome: null, excused: false });
  });
});

describe("letting a month off", () => {
  it("takes its forfeits away and marks it", async () => {
    const { house, a } = await dealtHouse();
    await reset(house.admin, { houseId: house.id, kind: "result", assignment: a.id, outcome: "missed", apply: true });
    const month = monthOf(new Date(a.due_at), ZONE);
    const applied = await reset(house.admin, { houseId: house.id, kind: "letoff", month, apply: true });
    expect(applied.status).toBe(200);
    const { data: left } = await db.from("ledger_entries").select("id").eq("house_id", house.id).eq("kind", "forfeit");
    expect(left).toEqual([]);
    const { data: mark } = await db.from("month_let_offs").select("month").eq("house_id", house.id);
    expect(mark).toEqual([{ month }]);
  });
});

describe("handing over", () => {
  it("lets the only admin leave by making someone else admin", async () => {
    const house = await makeHouse();
    const [ben] = house.members;
    expectOk(await house.admin.db.rpc("hand_over", { p_house: house.id, p_to: ben.userId }));
    const { data } = await db.from("members").select("user_id, role").eq("house_id", house.id);
    expect(data!.find((m) => m.user_id === ben.userId)!.role).toBe("admin");
    expect(data!.some((m) => m.user_id === house.admin.userId)).toBe(false);
  });
});

describe("Ask Jonz's resets", () => {
  it("tells Jonz the week and what can be undone, and offers what it asks for with real numbers, changing nothing", async () => {
    const { house, a, owner } = await dealtHouse();
    expectOk(await owner.db.rpc("mark_done", { p_assignment: a.id }));
    let told: DraftContext | null = null;
    const said: boolean[] = [];
    const result = await chatTurn(
      { db: house.admin.db, userId: house.admin.userId },
      house.id,
      [{ role: "user", text: "That tick was a mistake, and reset the week" }],
      null,
      new Date(),
      async (ctx, tools): Promise<DraftAnswer> => {
        told = ctx;
        const ref = [...ctx.now!.matchAll(/(h\d+) [^;]*ticked/g)][0][1];
        expect(tools.may.resets).toBe(true);
        said.push((await tools.offerReset({ what: "undo", ref, person: null, outcome: null, week: null, month: null })).ok);
        said.push((await tools.offerReset({ what: "week", ref: null, person: null, outcome: null, week: "this", month: null })).ok);
        // Not a ref it was given: Jonz is told, and it's left off the card.
        said.push((await tools.offerReset({ what: "result", ref: "j99", person: null, outcome: "missed", week: null, month: null })).ok);
        return { raw: { reply: "Here's what I'd put right.", ask: { kind: "none" } }, inputTokens: 1, outputTokens: 1 };
      },
    );
    expect(said).toEqual([true, true, false]);
    expect(told!.now).toMatch(/This week, from .*: j1 /);
    if ("refusal" in result) throw new Error("refused");
    expect(result.resets!.map((r) => r.kind)).toEqual(["undo", "reset"]);
    const week = result.resets![1];
    if (week.kind !== "reset") throw new Error("not a reset");
    expect(week.preview.people[owner.userId].ticks).toBe(1);
    expect((await reread("assignments", a.id)).done_at).not.toBeNull();
  });
});
