import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";

/**
 * Each person's language (20270102090000_profile_language.sql): null until
 * the app saves their phone's, then whichever they pick on You. Only theirs
 * to change, and only to a language Jonz has.
 */

async function languageOf(userId: string) {
  const { data } = await adminClient().from("profiles").select("language").eq("id", userId).single();
  return data!.language;
}

describe("your language", () => {
  it("is none until it's saved, then the one you picked", async () => {
    const ava = await signedInUser("Ava");
    expect((await ava.db.rpc("my_language")).data).toBeNull();

    expect((await ava.db.rpc("set_my_language", { p_language: "en-XA" })).error).toBeNull();
    expect((await ava.db.rpc("my_language")).data).toBe("en-XA");
    expect(await languageOf(ava.userId)).toBe("en-XA");
  });

  it("takes only a language Jonz has", async () => {
    const ava = await signedInUser("Ava");
    const { error } = await ava.db.rpc("set_my_language", { p_language: "fr" });
    expect(error?.message).toMatch(/profiles_language_check/);
    expect(await languageOf(ava.userId)).toBeNull();
  });

  it("is only yours to change", async () => {
    const ava = await signedInUser("Ava");
    const ben = await signedInUser("Ben");
    await ben.db.rpc("set_my_language", { p_language: "en" });
    await ava.db.from("profiles").update({ language: "en-XA" }).eq("id", ben.userId);
    expect(await languageOf(ben.userId)).toBe("en");
  });
});
