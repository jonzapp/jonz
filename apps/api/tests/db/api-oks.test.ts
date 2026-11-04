import { nextWeek } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as answer } from "@/app/api/oks/[id]/route";
import { adminClient, type Actor } from "@/tests/support/clients";
import { addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";

/**
 * POST /api/oks/:assignmentId, called as the app calls it: a bearer token
 * and JSON. A parent answers a kid's tick in a family (lib/moves/oks.ts).
 * The John is dealt next week, so the tick is never late whenever this runs.
 */

const BASE = "http://localhost:3205/api/oks";
const db = adminClient();
const WEEK = nextWeek(thisWeek(), ZONE, 1);
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = "http://localhost:8205";
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

async function post(actor: Actor | undefined, id: string, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost:8205" };
  if (actor) headers.authorization = `Bearer ${(await actor.db.auth.getSession()).data.session!.access_token}`;
  return answer(new Request(`${BASE}/${id}`, { method: "POST", headers, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
}

/** A family where Leo has ticked his John. */
async function ticked() {
  const house = await makeHouse(["Sam", "Leo"], "family");
  const [sam, leo] = house.everyone;
  await addJohns(house.id, [{ name: "Feed the fish" }], WEEK);
  const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
  const a = assignments[0];
  await db.from("assignments").update({ user_id: leo.userId }).eq("id", a.id);
  const { error } = await leo.db.rpc("mark_done", { p_assignment: a.id });
  if (error) throw error;
  return { sam, leo, a };
}

describe("POST /api/oks/:id", () => {
  it("lets a parent OK a kid's tick", async () => {
    const { sam, a } = await ticked();
    const res = await post(sam, a.id, { ok: true });
    expect(res.status).toBe(200);
    expect(await reread("assignments", a.id)).toMatchObject({ awaits_ok: false, okayed_by: sam.userId });
  });

  it("sends it back on Not yet", async () => {
    const { sam, a } = await ticked();
    expect((await post(sam, a.id, { ok: false })).status).toBe(200);
    expect((await reread("assignments", a.id)).done_at).toBeNull();
  });

  it("refuses a kid, a stranger and a body without an answer", async () => {
    const { leo, a } = await ticked();
    const kid = await post(leo, a.id, { ok: true });
    expect(kid.status).toBeGreaterThanOrEqual(400);
    expect(await kid.json()).toMatchObject({ error: "Only a parent can OK a John." });
    expect((await post(undefined, a.id, { ok: true })).status).toBe(401);
    expect((await post(leo, a.id, {})).status).toBe(400);
    expect((await reread("assignments", a.id)).awaits_ok).toBe(true);
  });
});
