import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OPTIONS, POST as raise } from "@/app/api/disputes/route";
import { POST as vote } from "@/app/api/disputes/[id]/votes/route";
import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { actorFor, addJohns, deal, makeHouse, someoneElse, thisWeek, type House } from "@/tests/support/factories";

/**
 * POST /api/disputes and POST /api/disputes/:id/votes, called as the app
 * calls them: a bearer token and JSON. The handlers run here against the
 * local stack, so what they let through is what production would.
 */

const BASE = "http://localhost:3205/api/disputes";
const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = "http://localhost:8205";
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

async function tokenOf(actor: Actor): Promise<string> {
  const { data } = await actor.db.auth.getSession();
  return data.session!.access_token;
}

async function request(url: string, body: unknown, actor?: Actor): Promise<Request> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:8205" };
  if (actor) headers.authorization = `Bearer ${await tokenOf(actor)}`;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function dispute(actor: Actor | undefined, body: unknown) {
  return raise(await request(BASE, body, actor));
}

async function castVote(actor: Actor | undefined, disputeId: string, body: unknown) {
  return vote(await request(`${BASE}/${disputeId}/votes`, body, actor), { params: Promise.resolve({ id: disputeId }) });
}

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

describe("POST /api/disputes", () => {
  it("refuses a caller with no token", async () => {
    const res = await dispute(undefined, { assignmentId: crypto.randomUUID(), reason: "Still full" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in first." });
  });

  it("asks for a reason in words", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Say what’s wrong with it." });
    expect((await stateOf(john.id)).disputes).toEqual([]);
  });

  it("waits in a house of two, where the one who asked is the only voter (fair checks)", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "Still full" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8205");
    expect(await res.json()).toEqual({ ok: true });

    // Whoever ticked it has until the vote closes to answer with a photo.
    const state = await stateOf(john.id);
    expect(state.done).toBe(true);
    expect(state.disputes).toEqual([{ id: expect.any(String), resolution: null }]);
  });

  it("leaves it to the vote in a bigger house", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben", "Cal"]);
    const res = await dispute(someoneElse(house, owner.userId), { assignmentId: john.id, reason: "Still full" });
    expect(res.status).toBe(200);
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
    expect(outsider.status).toBe(403);
    expect(await outsider.json()).toEqual({ error: "That isn’t in your house." });
    expect((await stateOf(john.id)).disputes).toEqual([]);
  });

  it("says when someone got there first", async () => {
    const { house, john, owner } = await tickedHouse(["Ava", "Ben", "Cal"]);
    const first = voterIn(house, owner.userId);
    expect((await dispute(first, { assignmentId: john.id, reason: "Still full" })).status).toBe(200);
    const second = await dispute(voterIn(house, owner.userId, first.userId), { assignmentId: john.id, reason: "Me too" });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "Someone’s already disputing that tick." });
  });

  it("answers a preflight from the app's web build", async () => {
    const res = OPTIONS(new Request(BASE, { method: "OPTIONS", headers: { origin: "http://localhost:8205" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8205");
  });
});

describe("POST /api/disputes/:id/votes", () => {
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
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const state = await stateOf(john.id);
    expect(state.done).toBe(false);
    expect(state.disputes[0].resolution).toBe("upheld");
  });

  it("can't be cast on your own John", async () => {
    const { owner, disputeId, john } = await openDispute();
    const res = await castVote(owner, disputeId, { uphold: false });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You can’t vote on your own John, or on a cover of it." });
    expect((await stateOf(john.id)).disputes[0].resolution).toBeNull();
  });

  it("asks for a yes or a no, and refuses a dispute that isn't one", async () => {
    const { third, disputeId } = await openDispute();
    const vague = await castVote(third, disputeId, { uphold: "maybe" });
    expect(vague.status).toBe(400);
    expect(await vague.json()).toEqual({ error: "Say whether it was done." });

    const nowhere = await castVote(third, "not-a-dispute", { uphold: true });
    expect(nowhere.status).toBe(404);
  });

  it("refuses a caller with no token", async () => {
    const { disputeId } = await openDispute();
    expect((await castVote(undefined, disputeId, { uphold: true })).status).toBe(401);
  });
});
