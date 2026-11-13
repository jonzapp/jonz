import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { actorFor, addJohns, deal, makeHouse, someoneElse, thisWeek, type House } from "@/tests/support/factories";
import { APP_ORIGIN, preflight, problemOf, v1 } from "@/tests/support/v1";

/**
 * Disputing a tick and voting on it (raise_dispute and cast_vote on /v1),
 * called as the app calls them: a bearer token and JSON. The handlers run
 * here against the local stack, so what they let through is what production
 * would.
 */

const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = APP_ORIGIN;
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

const dispute = (actor: Actor | undefined, { assignmentId, ...body }: { assignmentId: string; reason: unknown }) =>
  v1(actor, `POST /v1/assignments/${assignmentId}/disputes`, body);

const castVote = (actor: Actor | undefined, disputeId: string, body: unknown) => v1(actor, `POST /v1/disputes/${disputeId}/votes`, body);

/** A house with this week dealt and one John ticked by its owner. */
async function tickedHouse(names: string[]) {
  const house = await makeHouse(names);
  await addJohns(house.id, [{ name: "Bins" }, { name: "Bathroom", points: 4 }], thisWeek());
  const { assignments } = await deal(house.id, thisWeek(), new Date());
  const john = assignments[0];
  const owner = actorFor(house, john.user_id);
  const { error } = await owner.db.rpc("mark_done", { p_assignment: john.id });
  if (error) throw error;
  return { house, john, owner };
}

async function stateOf(assignmentId: string) {
  const { data: a } = await db.from("assignments").select("done_at").eq("id", assignmentId).single();
  const { data: d } = await db.from("disputes").select("id, resolution").eq("assignment_id", assignmentId);
  return { done: a!.done_at !== null, disputes: d ?? [] };
}

function voterIn(house: House, ...not: string[]): Actor {
  return house.everyone.find((x) => !not.includes(x.userId))!;
}

describe("POST /v1/assignments/{assignmentId}/disputes", () => {
  it("refuses a caller with no token", async () => {
    const res = await dispute(undefined, { assignmentId: crypto.randomUUID(), reason: "Still full" });
    expect(res.status).toBe(401);
    expect(await problemOf(res)).toEqual({ code: "unauthenticated", detail: "Sign in first." });
  });

  it("asks for a reason in words", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "   " });
    expect(res.status).toBe(400);
    expect((await problemOf(res)).code).toBe("invalid_input");
    expect((await stateOf(john.id)).disputes).toEqual([]);
  });

  it("waits in a house of two, where the one who asked is the only voter (fair checks)", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "Still full" });
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(await res.json()).toEqual({ ok: true });

    // Whoever ticked it has until the vote closes to answer with a photo.
    const state = await stateOf(john.id);
    expect(state.done).toBe(true);
    expect(state.disputes).toEqual([{ id: expect.any(String), resolution: null }]);
  });

  it("leaves it to the vote in a bigger house", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben", "Cal"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "Still full" });
    expect(res.status).toBe(201);
    const state = await stateOf(john.id);
    expect(state.done).toBe(true);
    expect(state.disputes).toEqual([{ id: expect.any(String), resolution: null }]);
  });

  it("won't let you dispute your own tick, or one in someone else's house", async () => {
    const { john, owner } = await tickedHouse(["Ava", "Ben"]);
    const own = await dispute(owner, { assignmentId: john.id, reason: "Me?" });
    expect(own.status).toBe(403);

    const stranger = await signedInUser("Zed");
    const outsider = await dispute(stranger, { assignmentId: john.id, reason: "Who?" });
    expect(outsider.status).toBe(404);
    expect(await problemOf(outsider)).toEqual({ code: "not_found", detail: "That isn't there, or isn't yours to see." });
    expect((await stateOf(john.id)).disputes).toEqual([]);
  });

  it("says when someone got there first", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben", "Cal"]);
    const first = voterIn(house, owner.userId);
    expect((await dispute(first, { assignmentId: john.id, reason: "Still full" })).status).toBe(201);
    const second = await dispute(voterIn(house, owner.userId, first.userId), { assignmentId: john.id, reason: "Me too" });
    expect(second.status).toBe(400);
    expect(await problemOf(second)).toEqual({ code: "rejected", detail: "already_disputed" });
  });

  it("answers a preflight from the app's web build", async () => {
    const res = await preflight(`/v1/assignments/${crypto.randomUUID()}/disputes`);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  });
});

describe("POST /v1/disputes/{disputeId}/votes", () => {
  async function openDispute() {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben", "Cal"]);
    const raiser = voterIn(house, owner.userId);
    await dispute(raiser, { assignmentId: john.id, reason: "Still full" });
    const { disputes } = await stateOf(john.id);
    return { house, john, owner, raiser, disputeId: disputes[0].id, third: voterIn(house, owner.userId, raiser.userId) };
  }

  it("decides at once when a vote makes the majority", async () => {
    const { john, third, disputeId } = await openDispute();
    const res = await castVote(third, disputeId, { uphold: true });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const state = await stateOf(john.id);
    expect(state.done).toBe(false);
    expect(state.disputes[0].resolution).toBe("upheld");
  });

  it("can't be cast on your own John", async () => {
    const { owner, disputeId, john } = await openDispute();
    const res = await castVote(owner, disputeId, { uphold: false });
    expect(res.status).toBe(403);
    expect(await problemOf(res)).toEqual({ code: "forbidden", detail: "You can't do that in this house." });
    expect((await stateOf(john.id)).disputes[0].resolution).toBeNull();
  });

  it("asks for a yes or a no, and refuses a dispute that isn't one", async () => {
    const { third, disputeId } = await openDispute();
    const vague = await castVote(third, disputeId, { uphold: "maybe" });
    expect(vague.status).toBe(400);
    expect((await problemOf(vague)).code).toBe("invalid_input");

    const nowhere = await castVote(third, "not-a-dispute", { uphold: true });
    expect(nowhere.status).toBe(400);
  });

  it("refuses a caller with no token", async () => {
    const { disputeId } = await openDispute();
    expect((await castVote(undefined, disputeId, { uphold: true })).status).toBe(401);
  });
});
