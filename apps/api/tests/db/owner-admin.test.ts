import { beforeEach, describe, expect, it } from "vitest";

import { OWNER_PERMISSION_NAMES, qrShape } from "@app/core";

import { GET as noticesRoute } from "@/app/api/notices/route";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { passSecondFactor, totp } from "@/tests/support/mfa";
import { scanQr } from "@/tests/support/qr-scan";

/**
 * The owner's admin page (docs/specs/owner-admin.md): only someone in
 * app_owners whose session has passed a second factor can write a notice or
 * read the audit log, every write leaves an audit entry, and nobody can
 * change or delete an entry. Everyone, signed in or not, reads the notices
 * that are on.
 *
 * Notices are global, and other suites and the Playwright run share this
 * stack, so a test's notice either starts in 2099 or is ended before the
 * test finishes: none is left showing.
 */

const db = adminClient();
const LATER = "2099-01-01T00:00:00Z";

function notice(over: Partial<{ p_kind: string; p_title: string; p_starts_at: string | null; p_ends_at: string | null }> = {}) {
  return {
    p_id: null,
    p_kind: "status",
    p_title: "Jonz is slow right now",
    p_body: "Our database host is fixing a problem.",
    p_link_label: null,
    p_link_url: null,
    p_starts_at: LATER,
    p_ends_at: null,
    ...over,
  };
}

/** Leaves an entry in the audit log, and no notice showing. */
async function endedNotice() {
  const saved = await owner.db.rpc("save_notice", notice());
  expectOk(saved);
  expectOk(await owner.db.rpc("end_notice", { p_id: saved.data! }));
}

let owner: Actor;
let ownerNoCode: Actor;
let housemate: Actor;

// Users live for one test (tests/db/setup.ts deletes them after each), and
// deleting one cascades their app_owners row, so every test gets its own.
beforeEach(async () => {
  owner = await signedInUser("Owner");
  ownerNoCode = await signedInUser("Owner without a code");
  housemate = await signedInUser("Housemate");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
  // A housemate with a second factor of their own is still not the owner.
  await passSecondFactor(housemate);
});

describe("who the owner is", () => {
  it("is someone in app_owners who has passed a second factor this session", async () => {
    expect((await owner.db.rpc("is_owner")).data).toBe(true);
    expect((await ownerNoCode.db.rpc("is_owner")).data).toBe(false);
    expect((await housemate.db.rpc("is_owner")).data).toBe(false);
  });

  it("tells the admin page whether to ask for the code, and tells anyone else nothing", async () => {
    expect((await owner.db.rpc("owner_status")).data).toEqual({ owner: true, mfa: true, role: "owner", permissions: [...OWNER_PERMISSION_NAMES].sort() });
    expect((await ownerNoCode.db.rpc("owner_status")).data).toEqual({ owner: true, mfa: false, role: null, permissions: [] });
    expect((await housemate.db.rpc("owner_status")).data).toEqual({ owner: false, mfa: true, role: null, permissions: [] });
  });

  it("can't be read or changed through the API, not even by the owner", async () => {
    const read = await owner.db.from("app_owners").select("user_id");
    expect(read.error?.code ?? "").toBe("42501");
    expectDenied(await housemate.db.from("app_owners").insert({ user_id: housemate.userId }));
    expectDenied(await visitor().rpc("is_owner"));
  });
});

describe("adding the authenticator", () => {
  // The QR code is drawn from Supabase's own markup, which has changed shape
  // under us before (#74): whatever Supabase sends, the app's drawing of it
  // has to scan back to the link the authenticator app needs.
  it("draws Supabase's QR code so it scans, and its key's code opens the admin page", async () => {
    const { data, error } = await ownerNoCode.db.auth.mfa.enroll({ factorType: "totp", friendlyName: "Jonz admin" });
    if (error) throw error;
    const qr = qrShape(data.totp.qr_code);
    expect(qr).not.toBeNull();
    expect(scanQr(qr!)).toBe(data.totp.uri);

    expectOk(await ownerNoCode.db.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) }));
    expect((await ownerNoCode.db.rpc("owner_status")).data).toMatchObject({ owner: true, mfa: true, role: "owner" });
  });
});

describe("writing a notice", () => {
  it("is the owner's, with the code: not a housemate's, nor the owner's before the code", async () => {
    expectDenied(await housemate.db.rpc("save_notice", notice()));
    expectDenied(await ownerNoCode.db.rpc("save_notice", notice()));
    expectDenied(await visitor().rpc("save_notice", notice()));
    expectDenied(await housemate.db.from("notices").insert({ kind: "news", title: "Hi" }));
  });

  it("saves, changes and ends a notice, logging each with before and after", async () => {
    const saved = await owner.db.rpc("save_notice", notice({ p_title: "Ticks may be slow" }));
    expectOk(saved);
    const id = saved.data!;

    expectOk(await owner.db.rpc("save_notice", { ...notice(), p_id: id }));
    expectOk(await owner.db.rpc("end_notice", { p_id: id }));

    const { data: log } = await owner.db
      .from("admin_audit")
      .select("action, actor, target_id, before, after")
      .eq("target_id", id)
      .order("id");
    expect(log!.map((e) => e.action)).toEqual(["notice.save", "notice.save", "notice.end"]);
    expect(log!.every((e) => e.actor === owner.userId)).toBe(true);
    expect(log![0].before).toBeNull();
    expect((log![1].before as { title: string }).title).toBe("Ticks may be slow");
    expect((log![1].after as { title: string }).title).toBe("Jonz is slow right now");
  });

  it("refuses an end before the start, a bad link, and a kind it doesn't know", async () => {
    expectRule(await owner.db.rpc("save_notice", notice({ p_ends_at: "2098-01-01T00:00:00Z" })), "notice_ends_first");
    const badLink = await owner.db.rpc("save_notice", { ...notice(), p_link_label: "Go", p_link_url: "javascript:alert(1)" });
    expect(badLink.error).not.toBeNull();
    const badKind = await owner.db.rpc("save_notice", notice({ p_kind: "party" }));
    expect(badKind.error).not.toBeNull();
  });
});

describe("reading notices", () => {
  it("shows everyone, signed in or not, only the notices that are on; the owner sees them all", async () => {
    const later = (await owner.db.rpc("save_notice", notice({ p_kind: "news", p_title: "Later" }))).data!;
    const now = (await owner.db.rpc("save_notice", notice({ p_kind: "news", p_title: "On now", p_starts_at: null }))).data!;
    try {
      for (const reader of [visitor(), housemate.db]) {
        const { data } = await reader.from("notices").select("id").in("id", [later, now]);
        expect(data!.map((n) => n.id)).toEqual([now]);
      }
      const { data: all } = await owner.db.from("notices").select("id").in("id", [later, now]);
      expect(all!.map((n) => n.id).sort()).toEqual([later, now].sort());

      // GET /api/notices, as the app asks for them: the one on now, not the later one.
      const res = await noticesRoute(new Request("http://localhost:3205/api/notices"));
      const ids = ((await res.json()) as { notices: { id: string }[] }).notices.map((n) => n.id);
      expect(ids).toContain(now);
      expect(ids).not.toContain(later);
    } finally {
      expectOk(await owner.db.rpc("end_notice", { p_id: now }));
    }
  });
});

describe("the audit log", () => {
  it("is read by the owner with the code, and nobody else", async () => {
    await endedNotice();
    expect((await owner.db.from("admin_audit").select("id").limit(1)).data!.length).toBe(1);
    expect((await ownerNoCode.db.from("admin_audit").select("id")).data).toEqual([]);
    expect((await housemate.db.from("admin_audit").select("id")).data).toEqual([]);
  });

  it("can only grow: no one changes or deletes an entry, the owner and the service role included", async () => {
    await endedNotice();
    const { data: entry } = await db.from("admin_audit").select("id").order("id", { ascending: false }).limit(1).single();
    expectDenied(await db.from("admin_audit").update({ reason: "tidied" }).eq("id", entry!.id));
    expectDenied(await db.from("admin_audit").delete().eq("id", entry!.id));
    const ownerEdit = await owner.db.from("admin_audit").update({ reason: "tidied" }).eq("id", entry!.id).select("id");
    expect(ownerEdit.error ?? ownerEdit.data!.length === 0).toBeTruthy();
    expectDenied(await owner.db.from("admin_audit").insert({ action: "notice.save", target_kind: "notice" }));
  });
});
