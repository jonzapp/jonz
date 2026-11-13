import { nextWeek } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tickHouse } from "@/lib/engine/tick";
import { adminClient, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek, ZONE } from "@/tests/support/factories";
import { APP_ORIGIN, v1 } from "@/tests/support/v1";
import { rightNow } from "@/tests/support/clock";

/**
 * Kids without a sign-in, family step 4 (docs/specs/family-houses.md): a
 * parent adds a child (add_kid on /v1), ticks for them, and gives a
 * John a youngest age the deal keeps to.
 *
 * Johns are dealt next week and settled with a pretend time past that
 * week's end; ages count from next week's year, so nothing hangs on when
 * the suite runs.
 */

const HOUR = 3_600_000;
const db = adminClient();
const WEEK = nextWeek(thisWeek(), ZONE, 1);
const LATER = new Date(WEEK.endsAt.getTime() + 2 * 24 * HOUR);
const YEAR = Number(WEEK.startsOn.slice(0, 4));
const THIS_YEAR = rightNow().getUTCFullYear();
const savedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(() => {
  process.env.ALLOWED_ORIGINS = APP_ORIGIN;
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedOrigins;
});

const post = (actor: Actor, houseId: string, body: unknown) => v1(actor, `POST /v1/houses/${houseId}/kids`, body);

/** A family, Sam the parent and Leo a kid who signs in, with Maya added by Sam. */
async function withMaya() {
  const house = await makeHouse(["Sam", "Leo"], "family");
  const [sam, leo] = house.everyone;
  const res = await post(sam, house.id, { name: "Maya Park", bornYear: THIS_YEAR - 8 });
  expect(res.status).toBe(201);
  const { userId: maya } = (await res.json()) as { userId: string };
  return { house, sam, leo, maya };
}

describe("adding a child", () => {
  it("puts them in the family with no sign-in", async () => {
    const { house, maya } = await withMaya();
    const { data: row } = await db.from("members").select("role, signs_in, born_year").eq("user_id", maya).single();
    expect(row).toEqual({ role: "member", signs_in: false, born_year: THIS_YEAR - 8 });
    const { data: profile } = await db.from("profiles").select("display_name").eq("id", maya).single();
    expect(profile!.display_name).toBe("Maya Park");
    // Nobody can sign in as them.
    const { data: account } = await db.auth.admin.getUserById(maya);
    expect(account.user!.email).toMatch(/\.invalid$/);
    expect(new Date(account.user!.banned_until!).getTime()).toBeGreaterThan(rightNow().getTime());
    const { data: joined } = await db.from("events").select("kind").eq("house_id", house.id).eq("user_id", maya);
    expect(joined!.map((e) => e.kind)).toEqual(["joined"]);
  });

  it("is a parent's to do, and only in a family", async () => {
    const { house, leo } = await withMaya();
    expect((await post(leo, house.id, { name: "Kit", bornYear: THIS_YEAR - 5 })).status).toBe(403);
    const mates = await makeHouse(["Ava", "Ben"]);
    expect((await post(mates.everyone[0], mates.id, { name: "Kit", bornYear: THIS_YEAR - 5 })).status).toBe(403);
  });

  it("wants a name and a year that makes them 18 or under", async () => {
    const house = await makeHouse(["Sam"], "family");
    const sam = house.everyone[0];
    expect((await post(sam, house.id, { name: " ", bornYear: THIS_YEAR - 5 })).status).toBe(400);
    expect((await post(sam, house.id, { name: "Kit", bornYear: THIS_YEAR - 30 })).status).toBe(400);
    expect((await post(sam, house.id, { name: "Kit", bornYear: THIS_YEAR + 1 })).status).toBe(400);
    // add_kid keeps to the same, whoever calls it.
    const { data: made } = await db.auth.admin.createUser({ email: `kit-${crypto.randomUUID()}@kids.jonz.invalid` });
    const { error } = await db.rpc("add_kid", { p_parent: sam.userId, p_kid: made.user!.id, p_born: THIS_YEAR - 40 });
    expect(error?.message).toContain("bad_born_year");
  });

  it("can't be done from the app's own session", async () => {
    const { sam, maya } = await withMaya();
    expectDenied(await sam.db.rpc("add_kid", { p_parent: sam.userId, p_kid: maya, p_born: THIS_YEAR - 8 }));
  });
});

describe("ticking for a child", () => {
  it("lets a parent tick for them, and it stands without an OK and earns", async () => {
    const { house, sam, maya } = await withMaya();
    await addJohns(house.id, [{ name: "Feed the fish", pay: 30 }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    const a = assignments[0];
    expectOk(await db.from("assignments").update({ user_id: maya }).eq("id", a.id).select("id"));
    expectOk(await sam.db.rpc("mark_done", { p_assignment: a.id }));
    expect(await reread("assignments", a.id)).toMatchObject({ awaits_ok: false });
    // And take it back.
    expectOk(await sam.db.rpc("undo_done", { p_assignment: a.id }));
    expect((await reread("assignments", a.id)).done_at).toBeNull();
    expectOk(await sam.db.rpc("mark_done", { p_assignment: a.id }));
    await tickHouse(db, house.id, LATER);
    expect((await reread("assignments", a.id)).outcome).toBe("done");
    const { data: earned } = await db.from("pocket_earnings").select("user_id, amount_minor").eq("house_id", house.id);
    expect(earned).toEqual([{ user_id: maya, amount_minor: 30 }]);
  });

  it("is only for a kid who doesn't sign in, and only for a parent", async () => {
    const { house, sam, leo, maya } = await withMaya();
    await addJohns(house.id, [{ name: "Feed the fish" }, { name: "Water the plants" }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    const [forLeo, forMaya] = assignments;
    expectOk(await db.from("assignments").update({ user_id: leo.userId }).eq("id", forLeo.id).select("id"));
    expectOk(await db.from("assignments").update({ user_id: maya }).eq("id", forMaya.id).select("id"));
    // Leo signs in: his are his own.
    expectDenied(await sam.db.rpc("mark_done", { p_assignment: forLeo.id }));
    // A kid can't tick for another.
    expectDenied(await leo.db.rpc("mark_done", { p_assignment: forMaya.id }));
  });
});

describe("a John's youngest age", () => {
  it("keeps it from kids who are younger", async () => {
    const house = await makeHouse(["Sam", "Leo", "Maya"], "family");
    const [sam, leo, maya] = house.everyone;
    expectOk(await db.from("members").update({ born_year: YEAR - 6 }).eq("user_id", leo.userId).select("user_id"));
    expectOk(await db.from("members").update({ born_year: YEAR - 12 }).eq("user_id", maya.userId).select("user_id"));
    const specs = ["Use the oven", "Mow the lawn", "Iron the shirts", "Clean the hob"].map((name) => ({ name, minAge: 10 }));
    await addJohns(house.id, [...specs, { name: "Feed the fish" }, { name: "Tidy your room" }], WEEK);
    const { assignments } = await deal(house.id, WEEK, WEEK.startsAt);
    const aged = assignments.filter((a) => specs.some((s) => s.name === a.name));
    // Smart deals keep to a points budget, so one may wait for next week.
    expect(aged.length).toBeGreaterThan(0);
    expect(aged.every((a) => a.user_id !== leo.userId)).toBe(true);
    expect(aged.some((a) => a.user_id === maya.userId || a.user_id === sam.userId)).toBe(true);
  });

  it("is a parent's to set on the list", async () => {
    const house = await makeHouse(["Sam", "Leo"], "family");
    const [sam] = house.everyone;
    const [john] = await addJohns(house.id, [{ name: "Use the oven" }], WEEK);
    expectOk(await sam.db.from("johns").update({ min_age: 12 }).eq("id", john.id).select("id"));
    expect((await reread("johns", john.id)).min_age).toBe(12);
    const { error } = await sam.db.from("johns").update({ min_age: 40 }).eq("id", john.id).select("id");
    expect(error?.message).toContain("johns_min_age");
  });
});
