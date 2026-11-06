import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectOk } from "@/tests/support/expect";
import { makeHouse } from "@/tests/support/factories";

/**
 * Ask Jonz chats (20261127090000_ask_chats.sql): kept until the person
 * deletes them, seen only by them, kept only in a house they're in, and
 * gone when they leave it.
 */

const TURNS = [
  { role: "user", text: "Add Ivy to main floor" },
  { role: "assistant", text: "Here’s the change.", ask: null, hadCard: true },
];

async function chatsOf(userId: string) {
  const { data } = await adminClient().from("ask_chats").select("id").eq("user_id", userId);
  return data ?? [];
}

describe("ask_chats", () => {
  it("keeps your chat for you alone: housemates can't read, change or delete it", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    const kept = await ava.db.from("ask_chats").insert({ house_id: house.id, title: "Add Ivy", turns: TURNS }).select("id").single();
    expectOk(kept);
    const id = kept.data!.id;

    expect((await ava.db.from("ask_chats").select("title, turns").eq("id", id).single()).data).toEqual({ title: "Add Ivy", turns: TURNS });
    expect((await ben.db.from("ask_chats").select("id").eq("id", id)).data).toEqual([]);

    await ben.db.from("ask_chats").update({ title: "Mine now" }).eq("id", id);
    await ben.db.from("ask_chats").delete().eq("id", id);
    const after = await adminClient().from("ask_chats").select("title").eq("id", id).single();
    expect(after.data?.title).toBe("Add Ivy");

    expectOk(await ava.db.from("ask_chats").update({ title: "Ivy upstairs" }).eq("id", id));
    expectOk(await ava.db.from("ask_chats").delete().eq("id", id));
    expect(await chatsOf(ava.userId)).toEqual([]);
  });

  it("keeps a chat only in a house you're in, and only as yourself", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const stranger = await signedInUser("Zed");
    expect((await stranger.db.from("ask_chats").insert({ house_id: house.id, title: "Hello", turns: [] })).error).not.toBeNull();
    const [ava, ben] = house.everyone;
    const posing = await ava.db.from("ask_chats").insert({ house_id: house.id, user_id: ben.userId, title: "Hello", turns: [] });
    expect(posing.error).not.toBeNull();
    // Only the title and turns change after: never whose or which house it is.
    const kept = await ava.db.from("ask_chats").insert({ house_id: house.id, title: "Hello", turns: [] }).select("id").single();
    expectOk(kept);
    expect((await ava.db.from("ask_chats").update({ user_id: ben.userId }).eq("id", kept.data!.id)).error).not.toBeNull();
  });

  it("refuses a blank title and turns that aren't a list", async () => {
    const house = await makeHouse(["Ava"]);
    expect((await house.admin.db.from("ask_chats").insert({ house_id: house.id, title: "  ", turns: [] })).error).not.toBeNull();
    expect((await house.admin.db.from("ask_chats").insert({ house_id: house.id, title: "Hi", turns: { role: "user" } })).error).not.toBeNull();
  });

  it("goes when you leave the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.everyone[1];
    expectOk(await ben.db.from("ask_chats").insert({ house_id: house.id, title: "Bins", turns: TURNS }));
    expect(await chatsOf(ben.userId)).toHaveLength(1);
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expect(await chatsOf(ben.userId)).toEqual([]);
  });
});
