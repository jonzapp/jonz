import { nextWeek } from "@app/core";
import { getHours } from "date-fns";
import { tz } from "@date-fns/tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as pushActionRoute } from "@/app/api/push-actions/route";
import { tickHouse, type PushMessage } from "@/lib/engine/tick";
import { payloadFor } from "@/lib/push";
import { pushToken } from "@/lib/push-token";
import { adminClient } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { actorFor, addJohns, deal, makeHouse, someoneElse, thisWeek, ZONE, type House } from "@/tests/support/factories";

/**
 * Notifications you can answer: reminders that say what's due and when, each
 * person's settings for what to send and when to keep quiet, and the buttons
 * (POST /api/push-actions), which tick a John or answer a housemate check as
 * the person the push went to, under the same rules as the app.
 */

const HOUR = 3_600_000;
const db = adminClient();
const saved = { vapid: process.env.VAPID_PRIVATE_KEY };

beforeAll(() => {
  process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
});

afterAll(() => {
  process.env.VAPID_PRIVATE_KEY = saved.vapid;
});

/** Records what the engine would push, and to whom. */
function recorder() {
  const sent: { to: string[]; message: PushMessage }[] = [];
  return { sent, notify: async (to: string[], message: PushMessage) => void sent.push({ to, message }) };
}

/**
 * A pretend "now" for the reminder tests: Wednesday 10:00 of next week. Reminders only go out when the
 * engine ticks, and ticks take the time they're given, so these tests read the same whatever the real
 * clock says (they used to break late on Sunday nights, when an hour on was next week).
 */
function pretendNow() {
  const week = nextWeek(thisWeek(), ZONE, 1);
  return new Date(week.startsAt.getTime() + 2 * 24 * HOUR + 10 * HOUR);
}

/** A house with Bins and Bathroom dealt, Bins due `hours` after `now` (the real time unless given). */
async function dueHouse(hours: number, { needsPhoto = false, now = new Date() } = {}) {
  const house = await makeHouse(["Ava", "Ben", "Cal"]);
  const week = thisWeek(now);
  await addJohns(house.id, [{ name: "Bins", needsPhoto }, { name: "Bathroom", points: 4 }], week);
  const { assignments } = await deal(house.id, week, now);
  const bins = assignments.find((a) => a.name === "Bins")!;
  // The other one out of the window, so only Bins is reminded.
  await db.from("assignments").update({ due_at: new Date(now.getTime() + 100 * HOUR).toISOString() }).neq("id", bins.id).eq("house_id", house.id);
  await db.from("assignments").update({ due_at: new Date(now.getTime() + hours * HOUR).toISOString() }).eq("id", bins.id);
  return { house, bins, owner: actorFor(house, bins.user_id) };
}

async function setPrefs(house: House, userId: string, prefs: Record<string, unknown>) {
  const me = actorFor(house, userId);
  expectOk(await me.db.from("notification_prefs").upsert({ user_id: userId, ...prefs }));
}

function action(token: string, act: string) {
  return pushActionRoute(
    new Request("http://localhost:3205/api/push-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action: act }),
    }),
  );
}

describe("reminders", () => {
  const now = pretendNow();

  it("names the John and when it's due, once per stage, with a Done button", async () => {
    const { house, bins } = await dueHouse(20, { now });
    const r = recorder();
    await tickHouse(db, house.id, now, r.notify);
    await tickHouse(db, house.id, now, r.notify);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].to).toEqual([bins.user_id]);
    expect(r.sent[0].message).toMatchObject({
      title: "Bins is due tomorrow",
      kind: "reminders",
      act: { assignmentId: bins.id },
      tag: `john:${bins.id}`,
    });
    expect(r.sent[0].message.body).toMatch(/^Due (today|tomorrow) \d\d:\d\d\. Tick it here when it’s done\.$/);
  });

  it("has no button for a John that needs a photo", async () => {
    const { house } = await dueHouse(2, { needsPhoto: true, now });
    const r = recorder();
    await tickHouse(db, house.id, now, r.notify);
    expect(r.sent[0].message.title).toBe("Bins is due soon");
    expect(r.sent[0].message.act).toBeUndefined();
    expect(r.sent[0].message.body).toContain("It needs a photo, so tick it in the app.");
  });

  it("sends nothing to someone who turned reminders off, and doesn't try again", async () => {
    const { house, bins } = await dueHouse(20, { now });
    await setPrefs(house, bins.user_id, { reminders: false });
    const r = recorder();
    await tickHouse(db, house.id, now, r.notify);
    expect(r.sent).toEqual([]);
    const { data } = await db.from("assignments").select("reminded").eq("id", bins.id).single();
    expect(data!.reminded).toBe(1);
  });

  it("holds a reminder through quiet hours, and sends it after", async () => {
    const { house, bins } = await dueHouse(20, { now });
    const hour = getHours(now, { in: tz(ZONE) });
    await setPrefs(house, bins.user_id, { quiet_from: hour, quiet_until: (hour + 1) % 24, timezone: ZONE });
    const r = recorder();
    await tickHouse(db, house.id, now, r.notify);
    expect(r.sent).toEqual([]);
    const { data } = await db.from("assignments").select("reminded").eq("id", bins.id).single();
    expect(data!.reminded).toBe(0);

    await tickHouse(db, house.id, new Date(now.getTime() + HOUR), r.notify);
    expect(r.sent).toHaveLength(1);
  });
});

describe("what each person's push carries", () => {
  it("gives each person their own token, and a vote two answers", () => {
    const now = new Date();
    const message: PushMessage = { title: "Vote", body: "", url: "/week", kind: "checks", zone: ZONE, act: { disputeId: crypto.randomUUID() } };
    const a = payloadFor("user-a", message, false, now);
    const b = payloadFor("user-b", message, true, now);
    expect(a.actions.map((x) => x.action)).toEqual(["held", "struck"]);
    expect(a.token).toBeTruthy();
    expect(a.token).not.toBe(b.token);
    expect(b.silent).toBe(true);
  });
});

describe("notification_prefs", () => {
  it("is yours to read and write, and nobody else's", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    expectOk(await ava.db.from("notification_prefs").insert({ reminders: false }));
    const { data: mine } = await ava.db.from("notification_prefs").select("user_id, reminders");
    expect(mine).toEqual([{ user_id: ava.userId, reminders: false }]);

    const { data: theirs } = await ben.db.from("notification_prefs").select("user_id");
    expect(theirs).toEqual([]);
    expectDenied(await ben.db.from("notification_prefs").insert({ user_id: ava.userId, reminders: true }));
    const { data: changed } = await ben.db.from("notification_prefs").update({ reminders: true }).eq("user_id", ava.userId).select();
    expect(changed).toEqual([]);
  });

  it("refuses half-set quiet hours", async () => {
    const house = await makeHouse(["Ava"]);
    const { error } = await house.admin.db.from("notification_prefs").insert({ quiet_from: 22 });
    expect(error).not.toBeNull();
  });

  it("can't be used to act as someone else: push_action is the server's alone", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    expectDenied(
      await ava.db.rpc("push_action", {
        p_user: ben.userId,
        p_assignment: crypto.randomUUID(),
        p_dispute: null as unknown as string,
        p_uphold: null as unknown as boolean,
      }),
    );
  });
});

describe("POST /api/push-actions", () => {
  it("ticks the John from the reminder, as its owner", async () => {
    const { bins } = await dueHouse(20);
    const token = pushToken({ userId: bins.user_id, assignmentId: bins.id }, new Date())!;
    const res = await action(token, "done");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, title: "Bins ticked", body: "The house can check it now." });
    const { data } = await db.from("assignments").select("done_at").eq("id", bins.id).single();
    expect(data!.done_at).not.toBeNull();
    const { data: events } = await db.from("events").select("kind, user_id").eq("assignment_id", bins.id);
    expect(events).toEqual([{ kind: "done", user_id: bins.user_id }]);

    // Pressed twice (two devices): still fine, nothing doubled.
    const again = await action(token, "done");
    expect(await again.json()).toMatchObject({ title: "Bins was already ticked" });
  });

  it("refuses a John that needs a photo, in the app's words", async () => {
    const { bins } = await dueHouse(20, { needsPhoto: true });
    const res = await action(pushToken({ userId: bins.user_id, assignmentId: bins.id }, new Date())!, "done");
    expect(res.status).toBe(409);
    const { data } = await db.from("assignments").select("done_at").eq("id", bins.id).single();
    expect(data!.done_at).toBeNull();
  });

  it("refuses a token for someone else's John", async () => {
    const { house, bins } = await dueHouse(20);
    const other = someoneElse(house, bins.user_id);
    const res = await action(pushToken({ userId: other.userId, assignmentId: bins.id }, new Date())!, "done");
    expect(res.status).toBe(403);
  });

  it("refuses a forged, mangled or expired token, and the wrong button", async () => {
    const { bins } = await dueHouse(20);
    const good = pushToken({ userId: bins.user_id, assignmentId: bins.id }, new Date())!;
    const [body, sig] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ u: bins.user_id, a: crypto.randomUUID(), e: 9e9 })).toString("base64url");
    expect((await action(`${forged}.${sig}`, "done")).status).toBe(401);
    expect((await action(`${body}.x${sig.slice(1)}`, "done")).status).toBe(401);
    expect((await action("nonsense", "done")).status).toBe(401);
    const old = pushToken({ userId: bins.user_id, assignmentId: bins.id }, new Date(Date.now() - 9 * 24 * HOUR))!;
    expect((await action(old, "done")).status).toBe(401);
    expect((await action(good, "held")).status).toBe(400);
    const { data } = await db.from("assignments").select("done_at").eq("id", bins.id).single();
    expect(data!.done_at).toBeNull();
  });

  it("answers a housemate check, and a vote that makes a majority decides it", async () => {
    const { house, bins, owner } = await dueHouse(20);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: bins.id }));
    const [raiser, voter] = house.everyone.filter((a) => a.userId !== owner.userId);
    const { data: disputeId } = await raiser.db.rpc("raise_dispute", { p_assignment: bins.id, p_reason: "Still full" });

    const res = await action(pushToken({ userId: voter.userId, disputeId: disputeId! }, new Date())!, "struck");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, title: "Vote counted on Bins", body: "You said it wasn’t done." });
    const { data: d } = await db.from("disputes").select("resolution").eq("id", disputeId!).single();
    expect(d!.resolution).toBe("upheld");
  });

  it("won't let the ticker vote on their own tick", async () => {
    const { house, bins, owner } = await dueHouse(20);
    expectOk(await owner.db.rpc("mark_done", { p_assignment: bins.id }));
    const raiser = someoneElse(house, owner.userId);
    const { data: disputeId } = await raiser.db.rpc("raise_dispute", { p_assignment: bins.id, p_reason: "Still full" });
    const res = await action(pushToken({ userId: owner.userId, disputeId: disputeId! }, new Date())!, "held");
    expect(res.status).toBe(403);
  });
});
