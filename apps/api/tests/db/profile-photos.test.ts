import { describe, expect, it } from "vitest";

import { GET } from "@/app/files/[what]/[bucket]/[...path]/route";
import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";

/**
 * Profile photos (20270112090000_baseline.sql). Google's photo follows
 * its identity in the database; a Microsoft photo is copied by the app into
 * the `avatars` bucket (private since avatars_private; shown on our address) and pointed at with set_my_photo. The attack
 * surface is the bucket's folders and what set_my_photo will accept.
 */

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], { type: "image/jpeg" });

async function photoOf(userId: string) {
  const { data } = await adminClient().from("profiles").select("avatar_url").eq("id", userId).single();
  return data!.avatar_url;
}

describe("the avatars bucket", () => {
  it("takes a photo only into your own folder, and shows it only through our address", async () => {
    const me = await signedInUser("Ava");
    const other = await signedInUser("Ben");
    const path = `${me.userId}/microsoft.jpg`;

    const denied = await other.db.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg" });
    expect(denied.error).not.toBeNull();

    const ok = await me.db.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg" });
    expect(ok.error).toBeNull();
    // Signing in again replaces it.
    const again = await me.db.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    expect(again.error).toBeNull();
    const overwrite = await other.db.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    expect(overwrite.error).not.toBeNull();

    // The bucket is private: Storage's public address shows nothing.
    const address = me.db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    expect((await fetch(address)).status).not.toBe(200);
    // Our own address reads it with the server's key, for anyone.
    const shown = await GET(new Request(`https://jonz.app/files/photo/avatars/${path}`), {
      params: Promise.resolve({ what: "photo", bucket: "avatars", path: path.split("/") }),
    });
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/jpeg");

    await adminClient().storage.from("avatars").remove([path]);
  });
});

describe("set_my_photo", () => {
  it("points your profile at a photo in your own folder", async () => {
    const me = await signedInUser("Ava");
    const address = `${me.db.storage.from("avatars").getPublicUrl(`${me.userId}/microsoft.jpg`).data.publicUrl}?v=123`;
    expectOk(await me.db.rpc("set_my_photo", { photo: address }));
    expect(await photoOf(me.userId)).toBe(address);
  });

  it("takes your photo on our own address too, still only in your folder", async () => {
    const me = await signedInUser("Ava");
    const other = await signedInUser("Ben");
    const address = `https://jonz.app/files/photo/avatars/${me.userId}/photo-1.jpg`;
    expectOk(await me.db.rpc("set_my_photo", { photo: address }));
    expect(await photoOf(me.userId)).toBe(address);
    for (const photo of [
      `https://jonz.app/files/photo/avatars/${other.userId}/photo-1.jpg`,
      `https://jonz.app/files/see/proofs/${me.userId}/photo-1.jpg`,
      `https://jonz.app/files/photo/avatars/${me.userId}/../x.jpg`,
    ]) {
      expectRule(await me.db.rpc("set_my_photo", { photo }), "That photo isn't yours.");
    }
  });

  it("refuses someone else's folder, and anywhere else on the web", async () => {
    const me = await signedInUser("Ava");
    const other = await signedInUser("Ben");
    const theirs = other.db.storage.from("avatars").getPublicUrl(`${other.userId}/microsoft.jpg`).data.publicUrl;
    const mine = me.db.storage.from("avatars").getPublicUrl(`${me.userId}/microsoft.jpg`).data.publicUrl;
    for (const photo of [
      theirs,
      "https://example.com/tracker.gif",
      `${mine}/../../${other.userId}/microsoft.jpg`,
      `${mine}?v=1&x=2`,
      `javascript:alert(1)//storage/v1/object/public/avatars/${me.userId}/a.jpg`,
    ]) {
      expectRule(await me.db.rpc("set_my_photo", { photo }), "That photo isn't yours.");
    }
    expect(await photoOf(me.userId)).toBeNull();
  });

  it("can't write the photo column directly", async () => {
    const me = await signedInUser("Ava");
    expectDenied(await me.db.from("profiles").update({ avatar_url: "https://example.com/x.gif" }).eq("id", me.userId));
  });
});
