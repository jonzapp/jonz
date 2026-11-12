import { randomUUID } from "node:crypto";

import { camelKeys, OPERATION_IO } from "@app/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as replyRoute } from "@/app/api/reports/[id]/reply/route";
import { POST as sendRoute } from "@/app/api/reports/route";
import { pushIn } from "@/lib/engine/tick";
import { replyToReport, sendReport, writeBack, type Outbox } from "@/lib/moves/reports";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * Report a problem (docs/specs/report-a-problem.md): anyone signed in sends
 * a problem, an idea or a question, with screenshots in their own folder,
 * five a day. Only they and the owner (with their code) can read it. The
 * owner replies, marks it fixed or opens it again, each in the audit log;
 * the sender reads the replies and writes back. Deleting an account takes
 * its name, email and screenshots off its reports.
 *
 * Reports outlive the users who sent them here (the cleanup deletes users,
 * which leaves their reports with no sender), so every search below looks
 * for this test's own words.
 */

const db = adminClient();
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");

let house: House;
let ava: Actor;
let ben: Actor;
let owner: Actor;
let ownerNoCode: Actor;
let words: string;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  [ava, ben] = house.everyone;
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
  words = `The bins John vanished from Today ${randomUUID()}`;
});

async function screenshot(actor: Actor, folder = actor.userId): Promise<string> {
  const path = `${folder}/${randomUUID()}.jpg`;
  const upload = await actor.db.storage.from("report-shots").upload(path, JPEG, { contentType: "image/jpeg" });
  expectOk(upload);
  return path;
}

async function send(actor: Actor, over: Partial<{ p_kind: string; p_words: string; p_shots: string[]; p_details: { pages: string } }> = {}) {
  return actor.db.rpc("send_report", { p_kind: "problem", p_words: words, p_details: { pages: "Today, then House" }, p_shots: [], ...over });
}

async function sent(actor: Actor, over: Parameters<typeof send>[1] = {}): Promise<string> {
  const res = await send(actor, over);
  expectOk(res);
  return res.data!;
}

const quiet = (): Outbox & { told: { to: string[]; title: string; url: string }[]; emails: { to: string; subject: string }[] } => {
  const told: { to: string[]; title: string; url: string }[] = [];
  const emails: { to: string; subject: string }[] = [];
  return {
    db,
    told,
    emails,
    notify: async (to, message) => {
      told.push({ to, title: pushIn(message, "en").title, url: message.url });
    },
    email: vi.fn(async (to: string, message: { subject: string }) => {
      emails.push({ to, subject: message.subject });
      return { sent: true as const, id: "test" };
    }) as unknown as Outbox["email"],
  };
};

describe("sending one", () => {
  it("keeps what they said, their house, the details and their screenshots, as new", async () => {
    const shot = await screenshot(ava);
    const id = await sent(ava, { p_shots: [shot] });
    const { data: row } = await db.from("reports").select("*").eq("id", id).single();
    expect(row).toMatchObject({
      user_id: ava.userId,
      house_id: house.id,
      kind: "problem",
      state: "new",
      words,
      details: { pages: "Today, then House" },
      shots: [shot],
    });
  });

  it("needs a kind, words, and screenshots that are really theirs and really uploaded", async () => {
    expectRule(await send(ava, { p_kind: "complaint" }), "report_kind");
    expectRule(await send(ava, { p_words: "   " }), "report_words");
    expectRule(await send(ava, { p_words: "x".repeat(2001) }), "report_words");
    expectRule(await send(ava, { p_shots: [`${ava.userId}/${randomUUID()}.jpg`] }), "report_shot");
    const bens = await screenshot(ben);
    expectRule(await send(ava, { p_shots: [bens] }), "report_shot");
    const four = await Promise.all([1, 2, 3, 4].map(() => screenshot(ava)));
    expectRule(await send(ava, { p_shots: four }), "report_shot");
  });

  it("can't put a screenshot in someone else's folder", async () => {
    const denied = await ava.db.storage.from("report-shots").upload(`${ben.userId}/${randomUUID()}.jpg`, JPEG, { contentType: "image/jpeg" });
    expect(denied.error).not.toBeNull();
  });

  it("takes five a day from each person", async () => {
    for (let i = 0; i < 5; i++) await sent(ava);
    expectRule(await send(ava), "report_limit");
    // Ben has his own five.
    await sent(ben);
  });

  it("needs someone signed in", async () => {
    expectDenied(await visitor().rpc("send_report", { p_kind: "idea", p_words: "Dark mode" }));
  });
});

describe("your reports", () => {
  it("are yours alone to read, with their screenshots", async () => {
    const shot = await screenshot(ava);
    const id = await sent(ava, { p_shots: [shot] });
    expect((await ava.db.from("reports").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await ben.db.from("reports").select("id").eq("id", id)).data).toHaveLength(0);
    expect((await ava.db.storage.from("report-shots").download(shot)).error).toBeNull();
    expect((await ben.db.storage.from("report-shots").download(shot)).error).not.toBeNull();
    // Nobody writes the tables directly, not even about their own.
    expectDenied(await ava.db.from("reports").update({ state: "fixed" }).eq("id", id));
    expectDenied(await ava.db.from("report_messages").insert({ report_id: id, from_owner: true, body: "Fixed!" }));
  });

  it("say when a reply is waiting, until they open it", async () => {
    const id = await sent(ava);
    expectOk(await owner.db.rpc("owner_reply_report", { p_report: id, p_body: "Thanks Ava, looking now." }));
    const mine = (await ava.db.rpc("my_reports")).data!.find((r) => r.id === id)!;
    expect(mine).toMatchObject({ state: "replied", replies: 1, unread: true });
    expectOk(await ava.db.rpc("see_report", { p_report: id }));
    expect((await ava.db.rpc("my_reports")).data!.find((r) => r.id === id)).toMatchObject({ unread: false });
    const { data: thread } = await ava.db.from("report_messages").select("from_owner, author_name, body").eq("report_id", id);
    expect(thread).toEqual([{ from_owner: true, author_name: "Glyn", body: "Thanks Ava, looking now." }]);
  });

  it("can be written back on, which puts it back in the owner's Inbox as new", async () => {
    const id = await sent(ava);
    expectOk(await owner.db.rpc("owner_reply_report", { p_report: id, p_body: "Which page?" }));
    expectOk(await ava.db.rpc("write_back", { p_report: id, p_body: "Today, after ticking the dishes." }));
    expect((await db.from("reports").select("state").eq("id", id).single()).data!.state).toBe("new");
    expectRule(await ben.db.rpc("write_back", { p_report: id, p_body: "Me too" }), "not_found");
  });
});

describe("the owner's Inbox", () => {
  it("is only for the owner, signed in with their code", async () => {
    const id = await sent(ava);
    for (const someone of [ownerNoCode, ben]) {
      expectDenied(await someone.db.rpc("owner_reports_page", { p_q: words }));
      expectDenied(await someone.db.rpc("owner_reports_count", { p_q: words }));
      expectDenied(await someone.db.rpc("owner_open_report", { p_report: id }));
      expectDenied(await someone.db.rpc("owner_reply_report", { p_report: id, p_body: "Hi" }));
      expectDenied(await someone.db.rpc("owner_set_report_state", { p_report: id, p_state: "fixed" }));
    }
    expectDenied(await ben.db.rpc("owner_reports_find" as never, { p_q: words } as never));
  });

  it("finds them by name, email, house or words, newest first, and filters by state and kind", async () => {
    const first = await sent(ava);
    const idea = await sent(ben, { p_kind: "idea" });
    const page = (await owner.db.rpc("owner_reports_page", { p_q: words })).data!;
    expect(page.map((r) => r.id)).toEqual([idea, first]);
    expect(page[1]).toMatchObject({ name: "Ava", house_name: "Ava's house", kind: "problem", state: "new" });
    expect(page[1].email).toMatch(/@test\.local$/);
    expect((await owner.db.rpc("owner_reports_count", { p_q: words })).data).toBe(2);
    expect((await owner.db.rpc("owner_reports_page", { p_q: words, p_kind: "idea" })).data!.map((r) => r.id)).toEqual([idea]);
    expectOk(await owner.db.rpc("owner_set_report_state", { p_report: idea, p_state: "fixed" }));
    expect((await owner.db.rpc("owner_reports_page", { p_q: words, p_state: "waiting" })).data!.map((r) => r.id)).toEqual([first]);
    expect((await owner.db.rpc("owner_reports_page", { p_q: words, p_state: "fixed" })).data!.map((r) => r.id)).toEqual([idea]);
    // A page at a time, after the last one shown.
    const after = (
      await owner.db.rpc("owner_reports_page", { p_q: words, p_cursor_at: page[0].created_at, p_cursor_id: page[0].id })
    ).data!;
    expect(after.map((r) => r.id)).toEqual([first]);
    // Searching by who sent it.
    const { data: email } = await db.auth.admin.getUserById(ben.userId);
    expect((await owner.db.rpc("owner_reports_page", { p_q: email.user!.email! })).data!.map((r) => r.id)).toEqual([idea]);
  });

  it("marks one read when it's opened, with the conversation and the screenshots the owner can open", async () => {
    const shot = await screenshot(ava);
    const id = await sent(ava, { p_shots: [shot] });
    expectOk(await ava.db.rpc("write_back", { p_report: id, p_body: "It came back after a refresh." }));
    const opened = await owner.db.rpc("owner_open_report", { p_report: id });
    expectOk(opened);
    expect(opened.data).toMatchObject({
      id,
      name: "Ava",
      house_name: "Ava's house",
      role: "admin",
      state: "open",
      words,
      shots: [shot],
      messages: [{ from_owner: false, body: "It came back after a refresh." }],
    });
    // What /v1 and the admin Inbox read: it failed its own contract once a report had a message, so the
    // Inbox errored on every report with a reply (12 Nov 2026).
    const fit = OPERATION_IO.owner_open_report.output.safeParse(camelKeys(opened.data));
    expect(fit.error?.issues ?? []).toEqual([]);
    expect((await owner.db.storage.from("report-shots").download(shot)).error).toBeNull();
    expect((await ownerNoCode.db.storage.from("report-shots").download(shot)).error).not.toBeNull();
  });

  it("replies, marks fixed and opens again, each in the audit log", async () => {
    const id = await sent(ava);
    expectRule(await owner.db.rpc("owner_reply_report", { p_report: id, p_body: " " }), "report_words");
    expectOk(await owner.db.rpc("owner_reply_report", { p_report: id, p_body: "Fixed in today's update." }));
    expectOk(await owner.db.rpc("owner_set_report_state", { p_report: id, p_state: "fixed" }));
    expectOk(await owner.db.rpc("owner_set_report_state", { p_report: id, p_state: "open" }));
    expectRule(await owner.db.rpc("owner_set_report_state", { p_report: id, p_state: "replied" }), "report_state");
    const { data: log } = await db.from("admin_audit").select("actor, action, before, after").eq("target_id", id).order("id");
    expect(log).toEqual([
      { actor: owner.userId, action: "report.reply", before: { state: "new" }, after: { state: "replied", reply: "Fixed in today's update." } },
      { actor: owner.userId, action: "report.fixed", before: { state: "replied" }, after: { state: "fixed" } },
      { actor: owner.userId, action: "report.reopen", before: { state: "fixed" }, after: { state: "open" } },
    ]);
  });
});

describe("telling the other side", () => {
  it("tells every owner about a new report and about writing back", async () => {
    const out = quiet();
    const result = await sendReport({ db: ava.db, userId: ava.userId }, { kind: "problem", words, details: null, shots: [] }, out);
    expect(result).toHaveProperty("id");
    const id = (result as { id: string }).id;
    expect(await writeBack({ db: ava.db, userId: ava.userId }, id, { body: "Still gone." }, out)).toBeNull();
    const toOwners = out.told.map((t) => ({ ...t, to: t.to.filter((u) => u === owner.userId || u === ownerNoCode.userId).sort() }));
    expect(toOwners).toEqual([
      { to: [owner.userId, ownerNoCode.userId].sort(), title: "Ava sent a problem", url: `/admin/inbox/${id}` },
      { to: [owner.userId, ownerNoCode.userId].sort(), title: "Ava wrote back", url: `/admin/inbox/${id}` },
    ]);
  });

  it("tells the sender about a reply by push and by email, signed with the owner's first name", async () => {
    const id = await sent(ava);
    const out = quiet();
    expect(await replyToReport({ db: owner.db, userId: owner.userId }, id, { body: "Thanks, fixed." }, out)).toBeNull();
    expect(out.told).toEqual([{ to: [ava.userId], title: "Glyn at Jonz replied", url: `/you/reports/${id}` }]);
    const { data: who } = await db.auth.admin.getUserById(ava.userId);
    expect(out.emails).toEqual([{ to: who.user!.email!, subject: `Re: ${words.slice(0, 59)}… (ref ${id.slice(0, 8)})` }]);
  });

  it("answers the app as the app calls it", async () => {
    const token = async (a: Actor) => (await a.db.auth.getSession()).data.session!.access_token;
    const post = async (url: string, body: unknown, a: Actor) =>
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token(a)}` },
        body: JSON.stringify(body),
      });
    const made = await sendRoute(await post("http://localhost:3205/api/reports", { kind: "idea", words, details: null, shots: [] }, ava));
    expect(made.status).toBe(200);
    const { id } = (await made.json()) as { id: string };
    const bad = await sendRoute(await post("http://localhost:3205/api/reports", { kind: "idea", words: "", details: null, shots: [] }, ava));
    expect(bad.status).toBe(400);

    const params = { params: Promise.resolve({ id }) };
    const notOwner = await replyRoute(await post(`http://localhost:3205/api/reports/${id}/reply`, { body: "Hi" }, ben), params);
    expect(notOwner.status).toBe(403);
    const replied = await replyRoute(await post(`http://localhost:3205/api/reports/${id}/reply`, { body: "Good idea." }, owner), params);
    expect(replied.status).toBe(200);
  });
});

describe("deleting an account", () => {
  it("takes the name, the email and the screenshots off their reports, and leaves nobody to tell", async () => {
    const shot = await screenshot(ava);
    const id = await sent(ava, { p_shots: [shot] });
    expectOk(await db.rpc("finish_account_deletion", { p_user: ava.userId }));
    const opened = (await owner.db.rpc("owner_open_report", { p_report: id })).data as { name: string; email: string | null; shots: string[] };
    expect(opened).toMatchObject({ name: "Someone who left", email: null, shots: [] });
    const out = quiet();
    expect(await replyToReport({ db: owner.db, userId: owner.userId }, id, { body: "Thanks." }, out)).toBeNull();
    expect(out.told).toEqual([]);
    expect(out.emails).toEqual([]);
  });
});
