import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDeletions } from "@/lib/account/deletions";
import type { PassStripe } from "@/lib/pass/stripe";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";
import { fromNow, rightNow } from "@/tests/support/clock";

/**
 * Deleting an account (supabase/migrations/*_delete_account.sql and
 * lib/account/deletions.ts): asking starts 30 days in which the house sees
 * you as away and a Pass you pay for stops renewing; Keep my account undoes
 * both; the owner can list, bring forward, stop or start one; and on the day
 * the clock takes you out of the house (handing it on if you were its only
 * admin), takes your name, photo and sign-in away, and keeps what the house
 * did. Every step writes the audit log, by account id only.
 */

const db = adminClient();
const DAY = 86_400_000;
const PASSWORD = "db-tests-not-a-secret";

/** A Stripe stand-in whose subscriptions are all active, remembering what it was told. */
function fakeStripe() {
  const stopping = new Set<string>();
  const calls = { stopped: [] as string[], resumed: [] as string[] };
  const stripe: PassStripe = {
    priceId: async (key) => `price_${key}`,
    checkout: async () => "https://checkout.stripe.com/c/pay/cs_test_1",
    portal: async () => "https://billing.stripe.com/p/session/test_1",
    subscription: async (id) => ({
      id,
      status: "active",
      customer: "cus_ava",
      metadata: {},
      lookupKey: "jonz_pass_yearly",
      periodEnd: Math.floor((fromNow(200 * DAY).getTime()) / 1000),
      endedAt: null,
      cancelAtPeriodEnd: stopping.has(id),
    }),
    stopRenewing: async (id) => {
      stopping.add(id);
      calls.stopped.push(id);
    },
    resumeRenewing: async (id) => {
      stopping.delete(id);
      calls.resumed.push(id);
    },
  };
  return { stripe, calls };
}

/** Ava's house, where she is the only admin and pays for a yearly Pass. */
async function avasHouse(): Promise<{ house: House; ava: Actor; ben: Actor; cal: Actor; sub: string }> {
  const house = await makeHouse(["Ava", "Ben", "Cal"]);
  const sub = `sub_${house.id.slice(0, 8)}`;
  await db
    .from("houses")
    .update({ pass_plan: "yearly", pass_ends_at: fromNow(200 * DAY).toISOString(), pass_bought_by: house.admin.userId })
    .eq("id", house.id);
  await db.from("house_pass_billing").insert({ house_id: house.id, stripe_customer_id: "cus_ava", stripe_subscription_id: sub });
  return { house, ava: house.admin, ben: house.members[0], cal: house.members[1], sub };
}

async function deletionOf(userId: string) {
  const { data } = await db
    .from("account_deletions")
    .select("*")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .single();
  return data!;
}

async function awayOf(houseId: string, userId: string) {
  const { data } = await db.from("away_periods").select("starts_on, ends_on").eq("house_id", houseId).eq("user_id", userId).order("starts_on");
  return data ?? [];
}

async function auditFor(userId: string) {
  const { data } = await db.from("admin_audit").select("actor, action, reason, after").eq("target_id", userId).order("id");
  return data ?? [];
}

/** Today in the test houses' zone, as YYYY-MM-DD. */
function londonDay(at: Date | string | number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(at));
}

describe("asking to delete", () => {
  it("says what goes and stays first: the house, and until when the Pass you pay for lasts", async () => {
    const { ava, ben } = await avasHouse();
    const { data: mine } = await ava.db.rpc("account_deletion_preview");
    expect(mine).toMatchObject({ house: "Ava's house", pass_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    const { data: theirs } = await ben.db.rpc("account_deletion_preview");
    expect(theirs).toMatchObject({ house: "Ava's house", pass_until: null });
    expect((await visitor().rpc("account_deletion_preview")).error).not.toBeNull();
  });

  it("starts 30 days in which the house sees you as away, writes the audit log, and asking again changes nothing", async () => {
    const { house, ava } = await avasHouse();
    const { data: goes, error } = await ava.db.rpc("request_account_deletion");
    expect(error).toBeNull();
    const due = Date.parse(goes!);
    expect(due).toBeGreaterThan(fromNow(29.9 * DAY).getTime());
    expect(due).toBeLessThan(fromNow(30.1 * DAY).getTime());

    expect(await awayOf(house.id, ava.userId)).toEqual([{ starts_on: londonDay(rightNow()), ends_on: londonDay(goes!) }]);
    expect((await ava.db.rpc("account_deletion_status")).data).toEqual({ delete_after: goes, requested_by: "self" });
    expect(await auditFor(ava.userId)).toEqual([
      { actor: ava.userId, action: "account.delete_request", reason: null, after: { requested_by: "self", delete_after: goes } },
    ]);

    expect((await ava.db.rpc("request_account_deletion")).data).toBe(goes);
    expect(await auditFor(ava.userId)).toHaveLength(1);
    // Nobody reads the table itself.
    const { data: rows } = await ava.db.from("account_deletions").select("id");
    expect(rows ?? []).toEqual([]);
  });

  it("fills the days around time away already set, and keeping the account takes back only its own", async () => {
    const { house, ava } = await avasHouse();
    const from = fromNow(10 * DAY);
    const to = fromNow(12 * DAY);
    expectOk(await ava.db.rpc("set_away", { p_starts: londonDay(from), p_ends: londonDay(to), p_note: "Trip" }));
    const { data: goes } = await ava.db.rpc("request_account_deletion");
    const away = await awayOf(house.id, ava.userId);
    expect(away.map((a) => [a.starts_on, a.ends_on])).toEqual([
      [londonDay(rightNow()), londonDay(from.getTime() - DAY)],
      [londonDay(from), londonDay(to)],
      [londonDay(to.getTime() + DAY), londonDay(goes!)],
    ]);

    expectOk(await ava.db.rpc("keep_account"));
    expect(await awayOf(house.id, ava.userId)).toEqual([{ starts_on: londonDay(from), ends_on: londonDay(to) }]);
    expect((await ava.db.rpc("account_deletion_status")).data).toBeNull();
    expect((await deletionOf(ava.userId)).state).toBe("kept");
    expect((await auditFor(ava.userId)).map((e) => e.action)).toEqual(["account.delete_request", "account.delete_keep"]);
  });

  it("works for someone in no house", async () => {
    const loner = await signedInUser("Loner");
    expectOk(await loner.db.rpc("request_account_deletion"));
    expect((await loner.db.rpc("account_deletion_preview")).data).toMatchObject({ house: null, pass_until: null });
    expect((await deletionOf(loner.userId)).away_ids).toEqual([]);
  });
});

describe("the owner's Deletions", () => {
  let owner: Actor;

  beforeEach(async () => {
    owner = await signedInUser("Owner");
    expectOk(await db.from("app_owners").insert({ user_id: owner.userId }));
    await passSecondFactor(owner);
  });

  it("lists who is waiting, with their email and house, for the owner with their code only", async () => {
    const { ava, ben } = await avasHouse();
    await ava.db.rpc("request_account_deletion");
    const { data: list } = await owner.db.rpc("owner_deletions");
    const row = list!.find((r) => r.user_id === ava.userId)!;
    expect(row).toMatchObject({ name: "Ava", house_name: "Ava's house", requested_by: "self", email: expect.stringContaining("@test.local") });
    expectDenied(await ben.db.rpc("owner_deletions"));
    expectDenied(await ben.db.rpc("owner_delete_now", { p_user: ava.userId }));
    expectDenied(await ben.db.rpc("owner_stop_deletion", { p_user: ava.userId }));
  });

  it("finds who is waiting by their words, who started it and how soon it goes, a page at a time, for the owner only", async () => {
    const { house, ava, ben, cal } = await avasHouse();
    await ava.db.rpc("request_account_deletion");
    await ben.db.rpc("request_account_deletion");
    const { data: user } = await db.auth.admin.getUserById(cal.userId);
    expectOk(await owner.db.rpc("owner_request_deletion", { p_email: user.user!.email!, p_reason: "Email of 31 Oct" }));
    // Ava's goes tomorrow; the others wait out their 30 days.
    await db.from("account_deletions").update({ deletes_at: fromNow(DAY / 2).toISOString() }).eq("user_id", ava.userId);

    const count = async (args: Record<string, string>) => (await owner.db.rpc("owner_deletions_count", args)).data;
    const names = async (args: Record<string, string>) => ((await owner.db.rpc("owner_deletions_page", args)).data ?? []).map((r) => r.name);
    // This house's people, found by its name, soonest first.
    const houseName = `Busy ${house.id.slice(0, 8)}`;
    await db.from("houses").update({ name: houseName }).eq("id", house.id);
    const ours = { p_q: houseName.toLowerCase() };
    expect(await names(ours)).toEqual(["Ava", expect.any(String), expect.any(String)]);
    expect(await count(ours)).toBe(3);
    expect(await names({ ...ours, p_by: "owner" })).toEqual(["Cal"]);
    expect(await names({ ...ours, p_by: "self" })).toHaveLength(2);
    expect(await names({ ...ours, p_goes: "day" })).toEqual(["Ava"]);
    expect(await count({ ...ours, p_goes: "week" })).toBe(1);
    expect(await count({ ...ours, p_after: fromNow(DAY).toISOString() })).toBe(0);
    // By an account id's start, or an email, whatever its case; LIKE's wildcards are only letters.
    expect(await names({ p_q: ben.userId.slice(0, 13) })).toEqual(["Ben"]);
    expect(await names({ p_q: user.user!.email!.toUpperCase() })).toEqual(["Cal"]);
    expect(await count({ p_q: "%" })).toBe(0);

    // A page of one, then the next after it.
    const { data: first } = await owner.db.rpc("owner_deletions_page", { ...ours, p_limit: 1 });
    const { data: next } = await owner.db.rpc("owner_deletions_page", {
      ...ours,
      p_limit: 1,
      p_cursor_at: first![0].deletes_at,
      p_cursor_user: first![0].user_id,
    });
    expect(first!.map((r) => r.name)).toEqual(["Ava"]);
    expect(next!).toHaveLength(1);
    expect(next![0].name).not.toBe("Ava");

    expectDenied(await ben.db.rpc("owner_deletions_page", ours));
    expectDenied(await ben.db.rpc("owner_deletions_count", ours));
  });

  it("brings one forward and stops another, each with its reason in the audit log", async () => {
    const { ava, ben } = await avasHouse();
    await ava.db.rpc("request_account_deletion");
    await ben.db.rpc("request_account_deletion");
    expectOk(await owner.db.rpc("owner_delete_now", { p_user: ava.userId, p_reason: "Asked by email for it sooner" }));
    expect(Date.parse((await deletionOf(ava.userId)).deletes_at)).toBeLessThanOrEqual(fromNow(5_000).getTime());
    expectOk(await owner.db.rpc("owner_stop_deletion", { p_user: ben.userId, p_reason: "Changed their mind" }));
    expect((await deletionOf(ben.userId)).state).toBe("kept");
    expectRule(await owner.db.rpc("owner_stop_deletion", { p_user: ben.userId }), "no_deletion");

    expect((await auditFor(ava.userId)).at(-1)).toMatchObject({ actor: owner.userId, action: "account.delete_now", reason: "Asked by email for it sooner" });
    expect((await auditFor(ben.userId)).at(-1)).toMatchObject({ actor: owner.userId, action: "account.delete_stop", reason: "Changed their mind" });
    // What the owner did isn't in the house's History.
    const { data: actions } = await db.from("house_actions").select("id").eq("done_by", owner.userId);
    expect(actions).toEqual([]);
  });

  it("starts the 30 days for someone who emailed, by their address", async () => {
    const { house, cal } = await avasHouse();
    const { data: user } = await db.auth.admin.getUserById(cal.userId);
    const { data: who, error } = await owner.db.rpc("owner_request_deletion", { p_email: ` ${user.user!.email!.toUpperCase()} `, p_reason: "Email of 31 Oct" });
    expect(error).toBeNull();
    expect(who).toBe(cal.userId);
    expect((await deletionOf(cal.userId)).requested_by).toBe("owner");
    expect(await awayOf(house.id, cal.userId)).toHaveLength(1);
    expectRule(await owner.db.rpc("owner_request_deletion", { p_email: user.user!.email! }), "already_deleting");
    expectRule(await owner.db.rpc("owner_request_deletion", { p_email: "nobody@test.local" }), "no_account");
    expect((await auditFor(cal.userId))[0]).toMatchObject({ actor: owner.userId, action: "account.delete_request", reason: "Email of 31 Oct" });
  });
});

describe("the clock", () => {
  it("stops the Pass the account pays for as the 30 days start, and starts it again if they keep it", async () => {
    const { ava, sub } = await avasHouse();
    const { stripe, calls } = fakeStripe();
    await ava.db.rpc("request_account_deletion");
    const first = await runDeletions(db, stripe, rightNow());
    expect(first.errors).toEqual([]);
    expect(calls.stopped).toContain(sub);
    expect(await deletionOf(ava.userId)).toMatchObject({ stripe_subscription_id: sub, pass_stopped_at: expect.any(String) });

    // Told once.
    await runDeletions(db, stripe, rightNow());
    expect(calls.stopped.filter((id) => id === sub)).toHaveLength(1);

    await ava.db.rpc("keep_account");
    await runDeletions(db, stripe, rightNow());
    expect(calls.resumed).toContain(sub);
    expect((await deletionOf(ava.userId)).pass_resumed_at).not.toBeNull();
  });

  it("on the day: out of the house, the longest-standing housemate becomes admin, name and sign-in gone, history kept", async () => {
    const { house, ava, ben, cal } = await avasHouse();
    const { data: user } = await db.auth.admin.getUserById(ava.userId);
    const email = user.user!.email!;
    await ava.db.rpc("request_account_deletion");
    // As if the 30 days were up.
    await db.from("account_deletions").update({ deletes_at: fromNow(-60_000).toISOString() }).eq("user_id", ava.userId);

    const sent: { to: string; subject: string; text: string; key?: string }[] = [];
    const run = await runDeletions(db, fakeStripe().stripe, rightNow(), async (to, message, options) => {
      sent.push({ to, subject: message.subject, text: message.text, key: options.idempotencyKey });
      return { sent: true, id: "em_1" };
    });
    expect(run.errors).toEqual([]);
    expect(run.finished).toBeGreaterThanOrEqual(1);
    // One last email, to the address she had, by her first name, once.
    const hers = sent.filter((mail) => mail.to === email);
    expect(hers).toEqual([
      {
        to: email,
        subject: "Your Jonz account is deleted",
        text: expect.stringContaining("Hi Ava,"),
        key: `account-deleted-${(await deletionOf(ava.userId)).id}`,
      },
    ]);
    expect(run.emailed).toBe(sent.length);

    const { data: members } = await db.from("members").select("user_id, role").eq("house_id", house.id).order("joined_at");
    expect(members).toEqual([
      { user_id: ben.userId, role: "admin" },
      { user_id: cal.userId, role: "member" },
    ]);
    const { data: profile } = await db.from("profiles").select("display_name, avatar_url, deleted_at").eq("id", ava.userId).single();
    expect(profile).toMatchObject({ display_name: "Someone who left", avatar_url: null, deleted_at: expect.any(String) });
    const { data: pass } = await db.from("houses").select("pass_plan, pass_bought_by").eq("id", house.id).single();
    expect(pass).toEqual({ pass_plan: "yearly", pass_bought_by: null });
    // The Wall still has her joining, under the name that's left.
    const { data: joined } = await db.from("events").select("id").eq("house_id", house.id).eq("user_id", ava.userId).eq("kind", "joined");
    expect(joined).toHaveLength(1);

    // The sign-in is gone: the old address and password open nothing.
    const { error: signIn } = await visitor().auth.signInWithPassword({ email, password: PASSWORD });
    expect(signIn).not.toBeNull();

    expect((await deletionOf(ava.userId)).state).toBe("done");
    expect((await auditFor(ava.userId)).at(-1)).toMatchObject({ actor: null, action: "account.delete_done" });
    // The log never held her name or email.
    const words = JSON.stringify(await auditFor(ava.userId));
    expect(words).not.toContain("Ava");
    expect(words).not.toContain(email);
  });

  it("deletes the account even when the last email can't go", async () => {
    const solo = await makeHouse(["Dee"]);
    await solo.admin.db.rpc("request_account_deletion");
    await db.from("account_deletions").update({ deletes_at: fromNow(-60_000).toISOString() }).eq("user_id", solo.admin.userId);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = await runDeletions(db, null, rightNow(), async () => {
      throw new Error("Resend is down");
    });
    quiet.mockRestore();
    expect(run.errors).toEqual([]);
    expect(run.emailed).toBe(0);
    expect((await deletionOf(solo.admin.userId)).state).toBe("done");
  });

  it("leaves a house empty, and closed, when its last member goes", async () => {
    const solo = await makeHouse(["Solo"]);
    await solo.admin.db.rpc("request_account_deletion");
    await db.from("account_deletions").update({ deletes_at: fromNow(-60_000).toISOString() }).eq("user_id", solo.admin.userId);
    const run = await runDeletions(db, null, rightNow());
    expect(run.errors).toEqual([]);
    const { data: members } = await db.from("members").select("user_id").eq("house_id", solo.id);
    expect(members).toEqual([]);
    const someone = await signedInUser("Someone");
    expectRule(await someone.db.rpc("join_house", { p_code: solo.code }), "unknown_code");
  });
});
