import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, thisWeek, ZONE } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";
import { track } from "@/tests/support/scope";

/**
 * Each house's own kinds of John (20270115090000_john_kinds.sql): the six it
 * starts with, in its maker's language; an admin adding, renaming,
 * recolouring, ordering and deleting them; a John written by kind id or by
 * kind name; and the reads that carry them. Each John's older category went
 * in 20270117090000_drop_john_category.sql.
 */

const db = adminClient();

/**
 * A call by name to the functions db-types.ts doesn't list (the kinds ones,
 * the John writes and the reads), as the operations reach them.
 */
const rpc = (who: Actor, fn: string, args: Record<string, unknown>) =>
  who.db.rpc(fn as never, args as never) as unknown as Promise<{ data: string | null; error: { code?: string; message: string } | null }>;

type Kind = { id: string; name: string; colour: string; position: number; preset: string | null };

async function kindsOf(houseId: string): Promise<Kind[]> {
  const { data } = await db.from("john_kinds").select("id, name, colour, position, preset").eq("house_id", houseId).order("position");
  return data!;
}

const named = (kinds: Kind[], preset: string) => kinds.find((k) => k.preset === preset)!;

/** A John's kind, by its id: null for none. */
async function johnKind(johnId: string) {
  const { data } = await db.from("johns").select("john_kind_id").eq("id", johnId).single();
  return data!.john_kind_id;
}

describe("a new house's kinds", () => {
  it("are the six starting kinds, in order, with the first six ready colours", async () => {
    const house = await makeHouse(["Ava"]);
    expect(await kindsOf(house.id)).toEqual([
      { id: expect.any(String), name: "Kitchen", colour: "#7a4e2d", position: 0, preset: "kitchen" },
      { id: expect.any(String), name: "Bathroom", colour: "#1f5fae", position: 1, preset: "bathroom" },
      { id: expect.any(String), name: "Bins & recycling", colour: "#2a2d30", position: 2, preset: "bins" },
      { id: expect.any(String), name: "Floors & hoovering", colour: "#0f7c7a", position: 3, preset: "floors" },
      { id: expect.any(String), name: "Errands & shopping", colour: "#6a3d9a", position: 4, preset: "errands" },
      { id: expect.any(String), name: "Everything else", colour: "#8a9096", position: 5, preset: "other" },
    ]);
  });

  it("are named in French for a house made by someone who reads Jonz in French", async () => {
    const amelie = await signedInUser("Amélie");
    expectOk(await amelie.db.rpc("set_my_language", { p_language: "fr" }));
    const made = await amelie.db.rpc("create_house", { p_name: "Chez Amélie", p_timezone: ZONE, p_currency: "EUR", p_week_starts: 1 });
    expectOk(made);
    track.house(made.data!);
    expect((await kindsOf(made.data!)).map((k) => k.name)).toEqual([
      "Cuisine",
      "Salle de bain",
      "Poubelles et tri",
      "Sols et aspirateur",
      "Courses et démarches",
      "Tout le reste",
    ]);
  });

  it("are seen by everyone in the house and changed only by an admin", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    const { data: seen } = await ben.db.from("john_kinds").select("id").eq("house_id", house.id);
    expect(seen).toHaveLength(6);
    const kitchen = named(await kindsOf(house.id), "kitchen");
    expectDenied(await rpc(ben, "save_kind", { p_house: house.id, p_kind: kitchen.id, p_name: "Cooking", p_colour: "#4f9a2e" }));
    expectDenied(await rpc(ben, "save_kind", { p_house: house.id, p_kind: null, p_name: "Garden", p_colour: "#4f9a2e" }));
    expectDenied(await rpc(ben, "order_kinds", { p_house: house.id, p_kinds: [kitchen.id] }));
    expectDenied(await rpc(ben, "delete_kind", { p_kind: kitchen.id }));
    expect(await kindsOf(house.id)).toHaveLength(6);
    expect(named(await kindsOf(house.id), "kitchen").name).toBe("Kitchen");

    const stranger = await signedInUser("Zed");
    const { data: hidden } = await stranger.db.from("john_kinds").select("id").eq("house_id", house.id);
    expect(hidden).toEqual([]);
  });
});

describe("save_kind", () => {
  it("adds a kind before Everything else, in the colour given", async () => {
    const house = await makeHouse(["Ava"]);
    const res = await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: null, p_name: " Garden ", p_colour: "#4F9A2E" });
    expectOk(res);
    const kinds = await kindsOf(house.id);
    expect(kinds.map((k) => k.name)).toEqual(["Kitchen", "Bathroom", "Bins & recycling", "Floors & hoovering", "Errands & shopping", "Garden", "Everything else"]);
    expect(kinds.find((k) => k.id === res.data)).toMatchObject({ name: "Garden", colour: "#4f9a2e", preset: null });
  });

  it("renames and recolours a kind, and keeps its Johns in it", async () => {
    const house = await makeHouse(["Ava"]);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    const kitchen = named(await kindsOf(house.id), "kitchen");
    expectOk(await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: kitchen.id, p_name: "Cooking", p_colour: "#c2417a" }));
    expect(named(await kindsOf(house.id), "kitchen")).toMatchObject({ name: "Cooking", colour: "#c2417a" });
    expect(await johnKind(dishes.id)).toBe(kitchen.id);
  });

  it("refuses a name another kind has, whatever its capitals, a blank or long name, and a colour that isn't one", async () => {
    const house = await makeHouse(["Ava"]);
    const kitchen = named(await kindsOf(house.id), "kitchen");
    const save = (name: string, colour = "#4f9a2e", kind: string | null = null) =>
      rpc(house.admin, "save_kind", { p_house: house.id, p_kind: kind, p_name: name, p_colour: colour });
    expectRule(await save("bathroom"), "kind_name_taken");
    expectRule(await save("Bathroom", "#4f9a2e", kitchen.id), "kind_name_taken");
    expectRule(await save("   "), "bad_kind_name");
    expectRule(await save("x".repeat(31)), "bad_kind_name");
    expectRule(await save("Garden", "green"), "bad_colour");
    expectRule(await save("Garden", "#4f9a2e", crypto.randomUUID()), "unknown_kind");
    expect(await kindsOf(house.id)).toHaveLength(6);
  });
});

describe("order_kinds", () => {
  it("puts the kinds in the order given, and any left out after them in their old order", async () => {
    const house = await makeHouse(["Ava"]);
    const kinds = await kindsOf(house.id);
    const other = named(kinds, "other");
    const bins = named(kinds, "bins");
    expectOk(await rpc(house.admin, "order_kinds", { p_house: house.id, p_kinds: [other.id, bins.id] }));
    expect((await kindsOf(house.id)).map((k) => [k.preset, k.position])).toEqual([
      ["other", 0],
      ["bins", 1],
      ["kitchen", 2],
      ["bathroom", 3],
      ["floors", 4],
      ["errands", 5],
    ]);
  });
});

describe("delete_kind", () => {
  it("moves its Johns, archived ones too, to the kind picked", async () => {
    const house = await makeHouse(["Ava"]);
    const [dishes, oven] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }, { name: "Oven", preset: "kitchen" }], thisWeek());
    await db.from("johns").update({ archived_at: rightNow().toISOString() }).eq("id", oven.id);
    const kinds = await kindsOf(house.id);
    const bathroom = named(kinds, "bathroom");
    expectOk(await rpc(house.admin, "delete_kind", { p_kind: named(kinds, "kitchen").id, p_move_to: bathroom.id }));
    expect((await kindsOf(house.id)).map((k) => k.preset)).toEqual(["bathroom", "bins", "floors", "errands", "other"]);
    expect(await johnKind(dishes.id)).toBe(bathroom.id);
    expect(await johnKind(oven.id)).toBe(bathroom.id);
  });

  it("leaves them with no kind when no kind is picked (no kind C, 14 Nov)", async () => {
    const house = await makeHouse(["Ava"]);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    const kinds = await kindsOf(house.id);
    expectOk(await rpc(house.admin, "delete_kind", { p_kind: named(kinds, "kitchen").id }));
    expect(await johnKind(dishes.id)).toBeNull();
  });

  it("refuses to move them to the kind going or to another house's", async () => {
    const house = await makeHouse(["Ava"]);
    const elsewhere = await makeHouse(["Zed"]);
    const kitchen = named(await kindsOf(house.id), "kitchen");
    expectRule(await rpc(house.admin, "delete_kind", { p_kind: kitchen.id, p_move_to: kitchen.id }), "unknown_kind");
    expectRule(await rpc(house.admin, "delete_kind", { p_kind: kitchen.id, p_move_to: named(await kindsOf(elsewhere.id), "other").id }), "unknown_kind");
    expect(await kindsOf(house.id)).toHaveLength(6);
  });

  it("lets any kind go, Everything else and the last one too, and a John added after has none", async () => {
    const house = await makeHouse(["Ava"]);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "other" }], thisWeek());
    for (const k of await kindsOf(house.id)) expectOk(await rpc(house.admin, "delete_kind", { p_kind: k.id }));
    expect(await kindsOf(house.id)).toEqual([]);
    expect(await johnKind(dishes.id)).toBeNull();
    const [hob] = await addJohns(house.id, [{ name: "Hob", preset: "kitchen" }], thisWeek());
    expect(await johnKind(hob.id)).toBeNull();
  });
});

describe("a John's kind", () => {
  const fields = (more: Record<string, unknown>) => ({
    p_name: "Lawn",
    p_points: 2,
    p_every_weeks: 1,
    p_due_dow: 6,
    p_due_time: "12:00",
    p_needs_photo: false,
    p_group: null,
    ...more,
  });
  const john = (houseId: string, more: Record<string, unknown>) => ({ p_house: houseId, ...fields(more) });

  it("has none when written without one, and no older category to give it one", async () => {
    const house = await makeHouse(["Ava"]);
    const res = await rpc(house.admin, "add_john", john(house.id, {}));
    expectOk(res);
    expect(await johnKind(res.data!)).toBeNull();
    // The older category is gone from the John, its writes and what was dealt.
    expect((await rpc(house.admin, "add_john", john(house.id, { p_category: "bins" }))).error).not.toBeNull();
    expect((await db.from("johns").select("category").limit(1)).error).not.toBeNull();
    expect((await db.from("assignments").select("category").limit(1)).error).not.toBeNull();
  });

  it("is the kind named by id, or by name (made if the house has none by it)", async () => {
    const house = await makeHouse(["Ava"]);
    const kinds = await kindsOf(house.id);
    const floors = named(kinds, "floors");
    const byId = await rpc(house.admin, "add_john", john(house.id, { p_kind: floors.id, p_kind_name: "Kitchen" }));
    expectOk(byId);
    expect(await johnKind(byId.data!)).toBe(floors.id);

    const byName = await rpc(house.admin, "add_john", john(house.id, { p_kind_name: "kitchen" }));
    expect(await johnKind(byName.data!)).toBe(named(kinds, "kitchen").id);

    const made = await rpc(house.admin, "add_john", john(house.id, { p_kind_name: "Garden" }));
    expectOk(made);
    const garden = (await kindsOf(house.id)).find((k) => k.name === "Garden")!;
    // The first ready colour no kind has yet, before Everything else.
    expect(garden).toMatchObject({ colour: "#c2417a", preset: null, position: 5 });
    expect(await johnKind(made.data!)).toBe(garden.id);

    expectRule(await rpc(house.admin, "add_john", john(house.id, { p_kind: crypto.randomUUID() })), "unknown_kind");
  });

  it("changes when a change names one, and stays when it doesn't", async () => {
    const house = await makeHouse(["Ava"]);
    const kinds = await kindsOf(house.id);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    const change = (more: Record<string, unknown>) => rpc(house.admin, "change_john", { ...fields({ p_name: "Dishes", ...more }), p_john: dishes.id });
    expectOk(await change({}));
    expect(await johnKind(dishes.id)).toBe(named(kinds, "kitchen").id);
    expectOk(await change({ p_kind: named(kinds, "errands").id }));
    expect(await johnKind(dishes.id)).toBe(named(kinds, "errands").id);
    expectOk(await change({ p_kind_name: "bathroom" }));
    expect(await johnKind(dishes.id)).toBe(named(kinds, "bathroom").id);
  });

  it("stays none after its kind is deleted until a change gives it one", async () => {
    const house = await makeHouse(["Ava"]);
    const kinds = await kindsOf(house.id);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    expectOk(await rpc(house.admin, "delete_kind", { p_kind: named(kinds, "kitchen").id }));
    const change = (more: Record<string, unknown>) => rpc(house.admin, "change_john", { ...fields({ p_name: "Dishes", ...more }), p_john: dishes.id });
    expectOk(await change({ p_points: 3 }));
    expect(await johnKind(dishes.id)).toBeNull();
    expectOk(await change({ p_kind: named(kinds, "bins").id }));
    expect(await johnKind(dishes.id)).toBe(named(kinds, "bins").id);
  });
});

describe("the reads", () => {
  it("john_list gives the kinds in order and each John's kind", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [dishes] = await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    const kinds = await kindsOf(house.id);
    const { data } = await rpc(house.members[0], "john_list", { p_house: house.id });
    const list = data as unknown as { johns: { id: string; john_kind_id: string }[]; kinds: Kind[] };
    expect(list.johns).toEqual([expect.objectContaining({ id: dishes.id, john_kind_id: named(kinds, "kitchen").id })]);
    expect(list.kinds.map((k) => k.name)).toEqual(kinds.map((k) => k.name));
  });

  it("house_today gives each John dealt its kind's name and colour", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    await deal(house.id, thisWeek(), rightNow());
    const kitchen = named(await kindsOf(house.id), "kitchen");
    expectOk(await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: kitchen.id, p_name: "Cooking", p_colour: "#c2417a" }));
    const { data } = await rpc(house.members[0], "house_today", { p_house: house.id });
    const today = data as unknown as { assignments: { name: string; kind_name: string; kind_colour: string }[] };
    expect(today.assignments).toEqual([expect.objectContaining({ name: "Dishes", kind_name: "Cooking", kind_colour: "#c2417a" })]);
  });

  it("house_today says a John dealt with no kind has none: an empty name and no colour", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    await deal(house.id, thisWeek(), rightNow());
    expectOk(await rpc(house.admin, "delete_kind", { p_kind: named(await kindsOf(house.id), "kitchen").id }));
    const { data } = await rpc(house.members[0], "house_today", { p_house: house.id });
    const today = data as unknown as { assignments: { name: string; kind_name: string | null; kind_colour: string | null }[] };
    expect(today.assignments).toEqual([expect.objectContaining({ name: "Dishes", kind_name: "", kind_colour: null })]);
  });
});

describe("starting again", () => {
  it("a house started from another keeps its kinds, and its Johns stay in them", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    const garden = await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: null, p_name: "Garden", p_colour: "#4f9a2e" });
    await addJohns(house.id, [{ name: "Lawn" }], thisWeek());
    await db.from("johns").update({ john_kind_id: garden.data! }).eq("house_id", house.id);
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    const res = await ben.db.rpc("start_house_from", { p_from: house.id, p_name: "Ben's new place", p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1 });
    expectOk(res);
    track.house(res.data!);
    const kinds = await kindsOf(res.data!);
    expect(kinds.map((k) => k.name)).toEqual((await kindsOf(house.id)).map((k) => k.name));
    const { data: lawn } = await db.from("johns").select("john_kind_id").eq("house_id", res.data!).single();
    expect(kinds.find((k) => k.id === lawn!.john_kind_id)).toMatchObject({ name: "Garden", colour: "#4f9a2e" });
  });

  it("a John with no kind comes across with none", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    await addJohns(house.id, [{ name: "Dishes", preset: "kitchen" }], thisWeek());
    expectOk(await rpc(house.admin, "delete_kind", { p_kind: named(await kindsOf(house.id), "kitchen").id }));
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    const res = await ben.db.rpc("start_house_from", { p_from: house.id, p_name: "Ben's new place", p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1 });
    expectOk(res);
    track.house(res.data!);
    const { data: dishes } = await db.from("johns").select("name, john_kind_id").eq("house_id", res.data!).single();
    expect(dishes).toEqual({ name: "Dishes", john_kind_id: null });
    expect(await kindsOf(res.data!)).toHaveLength(5);
  });

  it("resetting everything puts the six starting kinds back", async () => {
    const house = await makeHouse(["Ava"]);
    const kinds = await kindsOf(house.id);
    expectOk(await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: null, p_name: "Garden", p_colour: "#4f9a2e" }));
    expectOk(await rpc(house.admin, "save_kind", { p_house: house.id, p_kind: named(kinds, "kitchen").id, p_name: "Cooking", p_colour: "#c2417a" }));
    expectOk(await house.admin.db.rpc("reset_house_data", { p_house: house.id, p_everything: true }));
    expect((await kindsOf(house.id)).map((k) => [k.name, k.colour])).toEqual(kinds.map((k) => [k.name, k.colour]));
  });
});
