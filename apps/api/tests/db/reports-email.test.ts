import { createHmac, randomUUID } from "node:crypto";

import { refTag } from "@app/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as fixedRoute } from "@/app/api/reports/[id]/fixed/route";
import { POST as inboundRoute } from "@/app/api/email/inbound/route";
import { readInbound, verifySvix } from "@/lib/inbound";
import { fixReport, receiveEmail, replyToReport, type Inbound, type Outbox } from "@/lib/moves/reports";
import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * Report a problem, steps 2 and 3 (docs/specs/report-a-problem.md): an email
 * to support@jonz.app becomes a report, a reply to Jonz's email writes back
 * on the report it answers, and the owner's reply goes back by email. "Same
 * as" folds one report into another, and marking that one fixed fixes them
 * all and tells everyone who reported it.
 *
 * Every search below looks for this test's own words or address, since
 * reports outlive the users that sent them here.
 */

const db = adminClient();

let house: House;
let ava: Actor;
let ben: Actor;
let owner: Actor;
let words: string;
let sam: string;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  [ava, ben] = house.everyone;
  owner = await signedInUser("Glyn Finck");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }]));
  await passSecondFactor(owner);
  words = `The Stake shows the wrong month ${randomUUID()}`;
  sam = `sam-${randomUUID().slice(0, 8)}@example.com`;
});

const quiet = (): Outbox & { told: { to: string[]; title: string; url: string }[]; emails: { to: string; subject: string; text: string }[] } => {
  const told: { to: string[]; title: string; url: string }[] = [];
  const emails: { to: string; subject: string; text: string }[] = [];
  return {
    db,
    told,
    emails,
    notify: async (to, message) => {
      told.push({ to, title: message.title, url: message.url });
    },
    email: vi.fn(async (to: string, message: { subject: string; text: string }) => {
      emails.push({ to, subject: message.subject, text: message.text });
      return { sent: true as const, id: "test" };
    }) as unknown as Outbox["email"],
  };
};

const mail = (over: Partial<Inbound> = {}): Inbound => ({
  emailId: randomUUID(),
  from: sam,
  name: "Sam Lee",
  subject: "Paying the Stake",
  words,
  trusted: false,
  ...over,
});

async function emailed(over: Partial<Inbound> = {}, out = quiet()): Promise<string> {
  const done = await receiveEmail(mail(over), out);
  expect(done.did).toBe("report");
  return done.report!;
}

async function sent(actor: Actor, text = words): Promise<string> {
  const res = await actor.db.rpc("send_report", { p_kind: "problem", p_words: text });
  expectOk(res);
  return res.data!;
}

const emailOf = async (actor: Actor) => (await db.auth.admin.getUserById(actor.userId)).data.user!.email!;

describe("email to support", () => {
  it("becomes a question in the Inbox, from the address it came from, and tells the owner", async () => {
    const out = quiet();
    const id = await emailed({}, out);
    const { data: row } = await db.from("reports").select("*").eq("id", id).single();
    expect(row).toMatchObject({ user_id: null, source: "email", kind: "question", state: "new", from_email: sam, from_name: "Sam Lee", subject: "Paying the Stake", words });
    expect(out.told.filter((t) => t.to.includes(owner.userId))).toEqual([{ to: expect.arrayContaining([owner.userId]), title: "Sam emailed support", url: `/admin/inbox/${id}` }]);
    const page = (await owner.db.rpc("owner_reports_page", { p_q: sam })).data!;
    expect(page).toMatchObject([{ id, name: "Sam Lee", email: sam, source: "email", subject: "Paying the Stake" }]);
  });

  it("is one report however many times Resend sends it", async () => {
    const one = mail();
    expect((await receiveEmail(one, quiet())).did).toBe("report");
    expect((await receiveEmail(one, quiet())).did).toBe("skipped");
    expect((await owner.db.rpc("owner_reports_count", { p_q: sam })).data).toBe(1);
  });

  it("belongs to the Jonz account with that address only when DMARC passed", async () => {
    const address = await emailOf(ava);
    const spoofed = await emailed({ from: address.toUpperCase(), words: `${words} spoofed` });
    expect((await db.from("reports").select("user_id").eq("id", spoofed).single()).data!.user_id).toBeNull();
    const real = await emailed({ from: address, trusted: true, subject: "Another thing" });
    const { data: row } = await db.from("reports").select("user_id, house_id").eq("id", real).single();
    expect(row).toEqual({ user_id: ava.userId, house_id: house.id });
    // So it's under her Your reports too.
    expect((await ava.db.rpc("my_reports")).data!.map((r) => r.id)).toContain(real);
  });

  it("writes back on the report a reply names, or the one with the same subject", async () => {
    const id = await emailed();
    // The reply email's subject carries the reference.
    const byRef = await receiveEmail(mail({ subject: `Re: Paying the Stake ${refTag(id)}`, words: "Thanks, card works." }), quiet());
    expect(byRef).toMatchObject({ did: "message", report: id });
    // A mail app that dropped the reference: the same subject, same address.
    const bySubject = await receiveEmail(mail({ subject: "RE: paying the stake", words: "One more thing." }), quiet());
    expect(bySubject).toMatchObject({ did: "message", report: id });
    const { data: thread } = await db.from("report_messages").select("from_owner, body").eq("report_id", id).order("id");
    expect(thread).toEqual([
      { from_owner: false, body: "Thanks, card works." },
      { from_owner: false, body: "One more thing." },
    ]);
    // Someone else quoting the reference starts their own report.
    const other = await receiveEmail(mail({ from: `other-${sam}`, subject: `Re: ${refTag(id)}` }), quiet());
    expect(other.did).toBe("report");
  });

  it("writes back on a report sent from the app when its sender answers the reply email", async () => {
    const id = await sent(ava);
    const reply = await receiveEmail(mail({ from: await emailOf(ava), trusted: true, subject: `Re: something ${refTag(id)}`, words: "Still there today." }), quiet());
    expect(reply).toMatchObject({ did: "message", report: id });
    expect((await db.from("reports").select("state").eq("id", id).single()).data!.state).toBe("new");
  });

  it("takes ten new reports a day from one address", async () => {
    for (let i = 0; i < 10; i++) await emailed({ subject: `Subject ${i}` });
    expect((await receiveEmail(mail({ subject: "Eleven" }), quiet())).did).toBe("skipped");
  });

  it("is only for the server", async () => {
    expectDenied(await ava.db.rpc("receive_email", { p_email_id: randomUUID(), p_from: sam, p_name: "", p_subject: "", p_topic: "", p_ref: "", p_body: "Hi", p_trusted: true }));
  });

  it("can be narrowed to the app or email", async () => {
    const byEmail = await emailed();
    const fromApp = await sent(ben);
    const only = async (from: "app" | "email") => (await owner.db.rpc("owner_reports_page", { p_q: words, p_from: from })).data!.map((r) => r.id);
    expect(await only("email")).toEqual([byEmail]);
    expect(await only("app")).toEqual([fromApp]);
    expect((await owner.db.rpc("owner_reports_count", { p_q: words, p_from: "email" })).data).toBe(1);
  });

  it("answers an emailed report by email alone, under its subject", async () => {
    const id = await emailed();
    const out = quiet();
    expect(await replyToReport({ db: owner.db, userId: owner.userId }, id, { body: "Yes, by card." }, out)).toBeNull();
    expect(out.told).toEqual([]);
    expect(out.emails).toEqual([{ to: sam, subject: `Re: Paying the Stake ${refTag(id)}`, text: expect.stringContaining("Hi Sam,") }]);
  });
});

describe("Same as", () => {
  it("folds a report into the one that says the same thing, taking it out of Waiting", async () => {
    const main = await sent(ava);
    const again = await sent(ben, `${words} again`);
    expect((await owner.db.rpc("owner_same_as", { p_report: again, p_main: main })).data).toBe(main);
    const waiting = (await owner.db.rpc("owner_reports_page", { p_q: words, p_state: "waiting" })).data!;
    expect(waiting.map((r) => r.id)).toEqual([main]);
    expect(waiting[0].also).toBe(1);
    const opened = (await owner.db.rpc("owner_open_report", { p_report: main })).data as { also: { id: string; name: string }[] };
    expect(opened.also).toMatchObject([{ id: again, name: "Ben" }]);
    const folded = (await owner.db.rpc("owner_open_report", { p_report: again })).data as { same_as: { id: string; name: string } };
    expect(folded.same_as).toMatchObject({ id: main, name: "Ava" });
    // Not the same after all.
    expectOk(await owner.db.rpc("owner_same_as", { p_report: again, p_main: null as unknown as string }));
    expect((await owner.db.rpc("owner_reports_count", { p_q: words, p_state: "waiting" })).data).toBe(2);
    const { data: log } = await db.from("admin_audit").select("action, after").eq("target_id", again).order("id");
    expect(log).toEqual([
      { action: "report.same_as", after: { same_as: main } },
      { action: "report.same_as", after: { same_as: null } },
    ]);
  });

  it("always lands on the top of a pile, and never on itself", async () => {
    const main = await sent(ava);
    const second = await sent(ben, `${words} second`);
    const third = await emailed();
    expectOk(await owner.db.rpc("owner_same_as", { p_report: second, p_main: main }));
    // Onto the folded one means onto the one it's folded into.
    expect((await owner.db.rpc("owner_same_as", { p_report: third, p_main: second })).data).toBe(main);
    expectRule(await owner.db.rpc("owner_same_as", { p_report: main, p_main: second }), "report_same");
    // Folding a pile into another brings the pile along.
    const other = await sent(ava, `${words} other`);
    expectOk(await owner.db.rpc("owner_same_as", { p_report: main, p_main: other }));
    const { data: rows } = await db.from("reports").select("id, same_as").in("id", [main, second, third]);
    expect(rows!.every((r) => r.same_as === other)).toBe(true);
  });

  it("finds the reports it might be, leaving out this one and its pile", async () => {
    const main = await sent(ava);
    const again = await sent(ben, `${words} again`);
    expectOk(await owner.db.rpc("owner_same_as", { p_report: again, p_main: main }));
    const found = (await owner.db.rpc("owner_same_as_find", { p_report: main, p_q: words })).data!;
    expect(found.map((r) => r.id)).toEqual([]);
    const from = await sent(ben, `${words} later`);
    expect((await owner.db.rpc("owner_same_as_find", { p_report: from, p_q: words })).data!.map((r) => r.id)).toEqual([main]);
  });

  it("is only for the owner", async () => {
    const main = await sent(ava);
    const again = await sent(ben);
    expectDenied(await ava.db.rpc("owner_same_as", { p_report: again, p_main: main }));
    expectDenied(await ava.db.rpc("owner_same_as_find", { p_report: again, p_q: "" }));
    expectDenied(await ava.db.rpc("owner_fix_report", { p_report: main }));
  });
});

describe("fixed, and telling everyone", () => {
  it("fixes the report and its pile, and tells each sender in the app and by email", async () => {
    const main = await sent(ava);
    const again = await sent(ben, `${words} again`);
    const byEmail = await emailed();
    expectOk(await owner.db.rpc("owner_same_as", { p_report: again, p_main: main }));
    expectOk(await owner.db.rpc("owner_same_as", { p_report: byEmail, p_main: main }));
    const out = quiet();
    const done = await fixReport({ db: owner.db, userId: owner.userId }, main, { note: "Fixed in today's update.", tell: true }, out);
    expect(done).toEqual({ fixed: 3, told: 3 });
    const { data: rows } = await db.from("reports").select("state").in("id", [main, again, byEmail]);
    expect(rows!.map((r) => r.state)).toEqual(["fixed", "fixed", "fixed"]);
    expect(out.told.map((t) => [t.to, t.title])).toEqual([
      [[ava.userId], "Fixed: the problem you reported"],
      [[ben.userId], "Fixed: the problem you reported"],
    ]);
    expect(out.emails.map((e) => e.to).sort()).toEqual([await emailOf(ava), await emailOf(ben), sam].sort());
    expect(out.emails.every((e) => e.subject.startsWith("Fixed: ") && e.text.includes("Fixed in today's update."))).toBe(true);
    // The note is in each conversation, from Jonz.
    const { data: said } = await ben.db.from("report_messages").select("from_owner, author_name, body").eq("report_id", again);
    expect(said).toEqual([{ from_owner: true, author_name: "Glyn", body: "Fixed in today's update." }]);
    const { data: log } = await db.from("admin_audit").select("action, after").eq("target_id", main).eq("action", "report.fixed");
    expect(log).toEqual([{ action: "report.fixed", after: { state: "fixed", reports: 3, told: 3, note: "Fixed in today's update." } }]);
  });

  it("says a plain thank you without a note, tells nobody when asked not to, and never twice", async () => {
    const main = await sent(ava);
    const out = quiet();
    expect(await fixReport({ db: owner.db, userId: owner.userId }, main, { note: null, tell: true }, out)).toEqual({ fixed: 1, told: 1 });
    expect(out.emails[0].text).toContain("This is fixed now. Thank you for telling us.");
    // Already fixed: nothing more to do.
    expect(await fixReport({ db: owner.db, userId: owner.userId }, main, { note: null, tell: true }, quiet())).toEqual({ fixed: 0, told: 0 });
    const quietly = await sent(ben);
    const none = quiet();
    expect(await fixReport({ db: owner.db, userId: owner.userId }, quietly, { note: null, tell: false }, none)).toEqual({ fixed: 1, told: 0 });
    expect(none.emails).toEqual([]);
    expect((await ben.db.from("report_messages").select("id").eq("report_id", quietly)).data).toEqual([]);
  });

  it("answers the app as the app calls it", async () => {
    const id = await sent(ava);
    const token = async (a: Actor) => (await a.db.auth.getSession()).data.session!.access_token;
    const post = async (body: unknown, a: Actor) =>
      new Request(`http://localhost:3205/api/reports/${id}/fixed`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token(a)}` },
        body: JSON.stringify(body),
      });
    const params = { params: Promise.resolve({ id }) };
    expect((await fixedRoute(await post({ note: null, tell: false }, ben), params)).status).toBe(403);
    expect((await fixedRoute(await post({ tell: "yes" }, owner), params)).status).toBe(400);
    const done = await fixedRoute(await post({ note: null, tell: false }, owner), params);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ ok: true, fixed: 1, told: 0 });
  });
});

describe("the inbound webhook", () => {
  const secret = `whsec_${Buffer.from("a test secret for jonz").toString("base64")}`;
  const sign = (id: string, at: number, body: string) =>
    `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${at}.${body}`).digest("base64")}`;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("checks Resend's signature and its time", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const at = Math.floor(now.getTime() / 1000);
    const body = '{"type":"email.received"}';
    expect(verifySvix(body, { id: "msg_1", timestamp: String(at), signature: `v1,bad ${sign("msg_1", at, body)}` }, secret, now)).toBe(true);
    expect(verifySvix(`${body} `, { id: "msg_1", timestamp: String(at), signature: sign("msg_1", at, body) }, secret, now)).toBe(false);
    expect(verifySvix(body, { id: "msg_1", timestamp: String(at - 600), signature: sign("msg_1", at - 600, body) }, secret, now)).toBe(false);
    expect(verifySvix(body, { id: null, timestamp: String(at), signature: sign("msg_1", at, body) }, secret, now)).toBe(false);
  });

  it("reads what the Inbox keeps from a received email, and leaves out automatic replies", () => {
    const base = { id: "e1", from: sam, to: ["support@jonz.app"], subject: "Help", html: null, authentication: { dmarc: "pass" } };
    expect(readInbound({ ...base, text: "Hi\n\nOn Tue, Jonz wrote:\n> old", headers: { from: `Sam Lee <${sam}>` } })).toEqual({
      inbound: { emailId: "e1", from: sam, name: "Sam Lee", subject: "Help", words: "Hi", trusted: true },
    });
    expect(readInbound({ ...base, text: "Away", headers: { "auto-submitted": "auto-replied" } })).toEqual({ skip: "automatic" });
    expect(readInbound({ ...base, subject: "", text: "", headers: null })).toEqual({ skip: "empty" });
  });

  it("turns a signed email.received event into a report, once", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    vi.stubEnv("RESEND_RECEIVING_KEY", "re_test");
    const emailId = randomUUID();
    const real = globalThis.fetch;
    const resend = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).startsWith("https://api.resend.com/")) return real(url, init);
      expect(String(url)).toBe(`https://api.resend.com/emails/receiving/${emailId}`);
      return Response.json({ id: emailId, from: sam, to: ["support@jonz.app"], subject: "Webhook test", text: words, html: null, headers: { from: `Sam <${sam}>` }, authentication: { dmarc: "fail" } });
    });
    vi.stubGlobal("fetch", resend);
    const body = JSON.stringify({ type: "email.received", data: { email_id: emailId } });
    const call = () => {
      const at = Math.floor(Date.now() / 1000);
      return inboundRoute(
        new Request("http://localhost:3205/api/email/inbound", {
          method: "POST",
          headers: { "svix-id": "msg_1", "svix-timestamp": String(at), "svix-signature": sign("msg_1", at, body) },
          body,
        }),
      );
    };
    const first = await call();
    expect(await first.json()).toEqual({ received: true, did: "report" });
    expect(await (await call()).json()).toEqual({ received: true, did: "skipped" });
    const unsigned = await inboundRoute(new Request("http://localhost:3205/api/email/inbound", { method: "POST", body }));
    expect(unsigned.status).toBe(400);
    expect((await owner.db.rpc("owner_reports_count", { p_q: sam })).data).toBe(1);
  });

  it("waits for its settings", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const res = await inboundRoute(new Request("http://localhost:3205/api/email/inbound", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
  });
});

describe("deleting an account", () => {
  it("forgets the address and name an emailed report came with", async () => {
    const address = await emailOf(ava);
    const id = await emailed({ from: address, name: "Ava Brown", trusted: true });
    expectOk(await db.rpc("finish_account_deletion", { p_user: ava.userId }));
    const { data: row } = await db.from("reports").select("from_email, from_name").eq("id", id).single();
    expect(row).toEqual({ from_email: null, from_name: null });
    const out = quiet();
    expect(await replyToReport({ db: owner.db, userId: owner.userId }, id, { body: "Thanks." }, out)).toBeNull();
    expect(out.emails).toEqual([]);
  });
});

describe("a folded report", () => {
  it("is waiting again when its sender writes back", async () => {
    const main = await sent(ava);
    const again = await sent(ben, `${words} again`);
    expectOk(await owner.db.rpc("owner_same_as", { p_report: again, p_main: main }));
    expect((await owner.db.rpc("owner_reports_page", { p_q: words, p_state: "waiting" })).data!.map((r) => r.id)).toEqual([main]);
    expectOk(await ben.db.rpc("write_back", { p_report: again, p_body: "It happened again today." }));
    expect((await owner.db.rpc("owner_reports_page", { p_q: words, p_state: "waiting" })).data!.map((r) => r.id).sort()).toEqual([main, again].sort());
  });
});
