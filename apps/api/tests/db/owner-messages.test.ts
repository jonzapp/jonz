import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { pushIn } from "@/lib/engine/tick";
import { sendMessage, sendOutbox, type MessageOutbox } from "@/lib/moves/messages";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * Messages from the owner (docs/specs/owner-admin.md, "Messages"): only the
 * owner, with their code, sends; a message reaches a person, a house or
 * everyone, as a push, a Wall post ("From Jonz") and an email; a test goes
 * to the owner alone and never on a Wall; every send is in the audit log;
 * and each person is pushed and emailed once however many senders run.
 *
 * Other suites share this stack, so nothing here goes on every Wall, and
 * each test reads back only its own message.
 */

const db = adminClient();
const FAR = () => Date.now() + 30_000;

let house: House;
let ava: Actor;
let ben: Actor;
let owner: Actor;
let ownerNoCode: Actor;
let subject: string;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  [ava, ben] = house.everyone;
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
  subject = `About last week ${randomUUID().slice(0, 8)}`;
});

type Told = { to: string[]; title: string; body: string; url: string; kind: string };
const watching = (): MessageOutbox & { told: Told[]; emails: { to: string; subject: string; key?: string }[] } => {
  const told: Told[] = [];
  const emails: { to: string; subject: string; key?: string }[] = [];
  return {
    db,
    told,
    emails,
    notify: async (to, message) => {
      told.push({ to, title: pushIn(message, "en").title, body: pushIn(message, "en").body, url: message.url, kind: message.kind });
    },
    email: vi.fn(async (to: string, message: { subject: string }, options: { idempotencyKey?: string }) => {
      emails.push({ to, subject: message.subject, key: options.idempotencyKey });
      return { sent: true as const, id: "test" };
    }) as unknown as MessageOutbox["email"],
  };
};

function message(over: Partial<Parameters<typeof sendMessage>[1]> = {}): Parameters<typeof sendMessage>[1] {
  return {
    audience: "house",
    personId: null,
    houseId: house.id,
    subject,
    body: "A bug in Monday’s reset took points it shouldn’t have. We’ve put them back.",
    push: true,
    wall: false,
    email: false,
    ...over,
  };
}

async function emailOf(actor: Actor): Promise<string> {
  const { data } = await db.auth.admin.getUserById(actor.userId);
  return data.user!.email!;
}

describe("who may send", () => {
  it("is the owner with their code: not before the code, not a housemate, not a visitor", async () => {
    const args = {
      p_audience: "house",
      p_person: null,
      p_house: house.id,
      p_subject: subject,
      p_body: "Hi",
      p_push: true,
      p_wall: true,
      p_email: false,
    };
    expectDenied(await ownerNoCode.db.rpc("owner_send_message", args));
    expectDenied(await ava.db.rpc("owner_send_message", args));
    expectDenied(await visitor().rpc("owner_send_message", args));
    expectDenied(await ava.db.rpc("owner_message_reach", { p_audience: "everyone" }));
    expectDenied(await ava.db.rpc("owner_people_find", { p_q: "ben" }));
    expectDenied(await ava.db.rpc("owner_messages_page", {}));
    // The outbox is the API's alone.
    expectDenied(await owner.db.rpc("take_message_outbox", {}));
    const read = await owner.db.from("owner_message_outbox").select("*");
    expect(read.error?.code ?? "").toBe("42501");
  });
});

describe("a message to a house", () => {
  it("pushes everyone in it, posts From Jonz on its Wall, and is in the audit log", async () => {
    const out = watching();
    const sent = await sendMessage({ db: owner.db, userId: owner.userId }, message({ wall: true }), out, FAR());
    if ("refusal" in sent) throw new Error(sent.refusal.message);
    expect(sent).toMatchObject({ people: 2, walls: 1, sent: 2 });

    expect(out.told).toHaveLength(1);
    expect(new Set(out.told[0].to)).toEqual(new Set([ava.userId, ben.userId]));
    expect(out.told[0]).toMatchObject({ title: subject, url: "/house/wall", kind: "support" });
    expect(out.emails).toHaveLength(0);

    // Housemates read it on their Wall, as Jonz's.
    const { data: wall } = await ben.db.from("events").select("kind, user_id, data").eq("house_id", house.id).eq("kind", "jonz_message");
    expect(wall).toHaveLength(1);
    expect(wall![0].user_id).toBeNull();
    expect((wall![0].data as { subject: string }).subject).toBe(subject);

    const { data: log } = await owner.db.from("admin_audit").select("action, actor, after").eq("target_id", sent.id);
    expect(log).toHaveLength(1);
    expect(log![0]).toMatchObject({ action: "message.send", actor: owner.userId });
    expect((log![0].after as { people: number; house: string }).house).toBe(house.id);
  });

  it("says how far it reaches before it's sent", async () => {
    expectOk(await db.from("push_subscriptions").insert({ user_id: ava.userId, endpoint: `https://web.push.apple.com/${randomUUID()}`, p256dh: "k", auth: "a" }));
    const reach = await owner.db.rpc("owner_message_reach", { p_audience: "house", p_house: house.id });
    expectOk(reach);
    expect(reach.data).toEqual({ people: 2, push: 1, email: 2, houses: 1 });
  });
});

describe("a message to a person", () => {
  it("reaches only them, by push and email, and never goes on a Wall", async () => {
    const out = watching();
    const sent = await sendMessage({ db: owner.db, userId: owner.userId }, message({ audience: "person", personId: ben.userId, houseId: null, email: true }), out, FAR());
    if ("refusal" in sent) throw new Error(sent.refusal.message);
    expect(sent.people).toBe(1);
    expect(out.told.map((t) => t.to)).toEqual([[ben.userId]]);
    expect(out.emails).toEqual([{ to: await emailOf(ben), subject, key: `message-${sent.id}-${ben.userId}` }]);

    const refused = await sendMessage({ db: owner.db, userId: owner.userId }, message({ audience: "person", personId: ben.userId, houseId: null, wall: true }), out, FAR());
    expect("refusal" in refused && refused.refusal.message).toContain("message_wall_person");
  });

  it("finds people by name or email, with their house", async () => {
    const found = await owner.db.rpc("owner_people_find", { p_q: (await emailOf(ben)).slice(0, 12) });
    expectOk(found);
    expect(found.data!.map((p) => p.id)).toContain(ben.userId);
    expect(found.data!.find((p) => p.id === ben.userId)!.house_id).toBe(house.id);
  });
});

describe("a test", () => {
  it("goes to the owner alone, the ways the message would, less the Wall", async () => {
    const out = watching();
    const sent = await sendMessage({ db: owner.db, userId: owner.userId }, message({ audience: "test", houseId: null, wall: true, email: true }), out, FAR());
    if ("refusal" in sent) throw new Error(sent.refusal.message);
    expect(sent).toMatchObject({ people: 1, walls: 0 });
    expect(out.told.map((t) => t.to)).toEqual([[owner.userId]]);
    expect(out.emails.map((e) => e.subject)).toEqual([`Test: ${subject}`]);
    const { data: wall } = await db.from("events").select("id").eq("kind", "jonz_message").contains("data", { message: sent.id });
    expect(wall).toHaveLength(0);
    const { data: log } = await owner.db.from("admin_audit").select("action").eq("target_id", sent.id);
    expect(log![0].action).toBe("message.test");
  });

  it("is still a push when the message is only for the Wall", async () => {
    const out = watching();
    const sent = await sendMessage({ db: owner.db, userId: owner.userId }, message({ audience: "test", houseId: null, push: false, wall: true }), out, FAR());
    if ("refusal" in sent) throw new Error(sent.refusal.message);
    expect(out.told.map((t) => t.to)).toEqual([[owner.userId]]);
  });
});

describe("what can't be sent", () => {
  it("refuses no way to send it, a house that's empty, and words too long", async () => {
    const send = (over: Record<string, unknown>) =>
      owner.db.rpc("owner_send_message", {
        p_audience: "house",
        p_person: null,
        p_house: house.id,
        p_subject: subject,
        p_body: "Hi",
        p_push: true,
        p_wall: false,
        p_email: false,
        ...over,
      });
    expectRule(await send({ p_push: false }), "message_no_way");
    expectRule(await send({ p_house: randomUUID() }), "message_nobody");
    expect((await send({ p_body: "x".repeat(501) })).error).not.toBeNull();
    expect((await send({ p_subject: " " })).error).not.toBeNull();
  });
});

describe("sending what's waiting", () => {
  it("reaches each person once, however many senders run at once, and leaves the outbox empty", async () => {
    // Left in the outbox, as a send to everyone too big for one request would be.
    const res = await owner.db.rpc("owner_send_message", {
      p_audience: "house",
      p_person: null,
      p_house: house.id,
      p_subject: subject,
      p_body: "Hi",
      p_push: true,
      p_wall: false,
      p_email: true,
    });
    expectOk(res);
    const id = (res.data as { id: string }).id;

    const a = watching();
    const b = watching();
    await Promise.all([sendOutbox(a, { message: id, until: FAR() }), sendOutbox(b, { message: id, until: FAR() })]);
    const pushed = [...a.told, ...b.told].flatMap((t) => t.to).sort();
    expect(pushed).toEqual([ava.userId, ben.userId].sort());
    expect([...a.emails, ...b.emails]).toHaveLength(2);

    const { count } = await db.from("owner_message_outbox").select("*", { count: "exact", head: true }).eq("message_id", id);
    expect(count).toBe(0);
  });
});

describe("the sent list", () => {
  it("finds a message by its words or its house, newest first, with what's still sending", async () => {
    const out = watching();
    const first = await sendMessage({ db: owner.db, userId: owner.userId }, message(), out, FAR());
    const second = await sendMessage({ db: owner.db, userId: owner.userId }, message({ body: "And another thing" }), out, FAR());
    if ("refusal" in first || "refusal" in second) throw new Error("not sent");

    const page = await owner.db.rpc("owner_messages_page", { p_q: subject });
    expectOk(page);
    expect(page.data!.map((m) => m.id)).toEqual([second.id, first.id]);
    expect(page.data![0]).toMatchObject({ audience: "house", people: 2, waiting: 0, by_push: true });

    const byWords = await owner.db.rpc("owner_messages_page", { p_q: "another thing" });
    expect(byWords.data!.map((m) => m.id)).toContain(second.id);
    const pushOnly = await owner.db.rpc("owner_messages_count", { p_q: subject, p_way: "email" });
    expect(pushOnly.data).toBe(0);
  });
});
