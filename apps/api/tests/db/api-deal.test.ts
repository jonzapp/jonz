import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { addJohns, makeHouse, thisWeek } from "@/tests/support/factories";
import { APP_ORIGIN, preflight, problemOf, v1 } from "@/tests/support/v1";

/**
 * Dealing the week (deal_week on /v1), called as the app calls it: a bearer
 * token and JSON. deal_week is the engine's, so the executor's check is all
 * that stands between a housemate and re-dealing the house: these prove it
 * holds.
 */

const db = adminClient();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = APP_ORIGIN;
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

const dealAs = (actor: Actor | undefined, houseId: string) => v1(actor, `POST /v1/houses/${houseId}/deal`, {});

/** This week's deal in the house: its John names, by who has them. */
async function dealtIn(houseId: string) {
  const { data: week } = await db.from("weeks").select("id").eq("house_id", houseId).eq("starts_on", thisWeek().startsOn).maybeSingle();
  if (!week) return null;
  const { data } = await db.from("assignments").select("id, name, user_id").eq("week_id", week.id).order("name");
  return data!;
}

describe("POST /v1/houses/{houseId}/deal", () => {
  it("refuses a caller with no token", async () => {
    const res = await dealAs(undefined, crypto.randomUUID());
    expect(res.status).toBe(401);
    expect(await problemOf(res)).toEqual({ code: "unauthenticated", detail: "Sign in first." });
  });

  it("asks which house", async () => {
    const house = await makeHouse(["Ava"]);
    const res = await dealAs(house.admin, "flat-3");
    expect(res.status).toBe(400);
    expect((await problemOf(res)).code).toBe("invalid_input");
  });

  it("refuses anyone outside the house, and deals nothing", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    const stranger = await signedInUser("Zed");
    const res = await dealAs(stranger, house.id);
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe("forbidden");
    expect(await dealtIn(house.id)).toBeNull();
  });

  it("is for admins only", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    const res = await dealAs(house.members[0], house.id);
    expect(res.status).toBe(403);
    expect(await problemOf(res)).toEqual({ code: "forbidden", detail: "You need weeks:write in this house." });
    expect(await dealtIn(house.id)).toBeNull();
  });

  it("needs a John to hand out", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const res = await dealAs(house.admin, house.id);
    expect(res.status).toBe(400);
    expect(await problemOf(res)).toEqual({ code: "rejected", detail: "no_johns" });
  });

  it("hands out the first week, and starts the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Bathroom" }], thisWeek());
    const res = await dealAs(house.admin, house.id);
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(await res.json()).toEqual({ ok: true });

    const dealt = await dealtIn(house.id);
    expect(dealt!.map((a) => a.name)).toEqual(["Bathroom", "Bins"]);
    // Two Johns of the same effort, two people: one each.
    expect(new Set(dealt!.map((a) => a.user_id)).size).toBe(2);
    const { data: h } = await db.from("houses").select("first_dealt_at").eq("id", house.id).single();
    expect(h!.first_dealt_at).not.toBeNull();
  });

  it("re-deals a week nobody has ticked in, with a John added since", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek());
    expect((await dealAs(house.admin, house.id)).status).toBe(201);
    await addJohns(house.id, [{ name: "Hoover" }], thisWeek());

    const res = await dealAs(house.admin, house.id);
    expect(res.status).toBe(201);
    expect((await dealtIn(house.id))!.map((a) => a.name)).toEqual(["Bins", "Hoover"]);
  });

  it("won't re-deal once a John is ticked", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }, { name: "Bathroom" }], thisWeek());
    expect((await dealAs(house.admin, house.id)).status).toBe(201);
    const before = await dealtIn(house.id);
    const ticked = before![0];
    const owner = house.everyone.find((a) => a.userId === ticked.user_id)!;
    const { error } = await owner.db.rpc("mark_done", { p_assignment: ticked.id });
    expect(error).toBeNull();

    const res = await dealAs(house.admin, house.id);
    expect(res.status).toBe(400);
    expect(await problemOf(res)).toEqual({ code: "rejected", detail: "deal_week: week_started" });
    expect(await dealtIn(house.id)).toEqual(before);
  });

  it("answers a browser's preflight", async () => {
    const res = await preflight(`/v1/houses/${crypto.randomUUID()}/deal`);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  });
});
