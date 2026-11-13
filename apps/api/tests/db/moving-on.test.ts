import { addDaysTo, localDate, weekWindow } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, thisWeek, ZONE } from "@/tests/support/factories";
import { fromNow, rightNow } from "@/tests/support/clock";
import { remindMovers } from "@/lib/engine/remind";
import { pushIn, type PushMessage, type SaidPush } from "@/lib/engine/shared";

/**
 * Bring Jonz to your next house (docs/specs/moving-on.md): the moving-out
 * date, what leaving writes down, starting a new house from the old list,
 * the deal leaving movers out, and the one reminder.
 */

const db = adminClient();
const DAY = 86_400_000;

function recorder() {
  const sent: { to: string[]; message: SaidPush }[] = [];
  return { sent, notify: async (to: string[], message: PushMessage) => void sent.push({ to, message: pushIn(message, "en") }) };
}

async function movesOf(userId: string) {
  const { data } = await db.from("moves").select("*").eq("user_id", userId).order("left_at");
  return data!;
}

describe("set_moving_out", () => {
  it("sets your own date, tells the Wall, and clears it again", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    const on = addDaysTo(localDate(rightNow(), ZONE), 10);

    expectOk(await ben.db.rpc("set_moving_out", { p_on: on }));
    const { data: me } = await db.from("members").select("moving_out_on").eq("user_id", ben.userId).single();
    expect(me!.moving_out_on).toBe(on);
    // Housemates read it as they read each other.
    const { data: seen } = await house.admin.db.from("members").select("moving_out_on").eq("user_id", ben.userId).single();
    expect(seen!.moving_out_on).toBe(on);

    // The same date again says nothing more.
    expectOk(await ben.db.rpc("set_moving_out", { p_on: on }));
    expectOk(await ben.db.rpc("set_moving_out", { p_on: null as unknown as string }));
    const { data: events } = await db
      .from("events")
      .select("kind, user_id, data")
      .eq("house_id", house.id)
      .eq("kind", "moving_out")
      .order("created_at");
    expect(events).toEqual([
      { kind: "moving_out", user_id: ben.userId, data: { on } },
      { kind: "moving_out", user_id: ben.userId, data: { on: null } },
    ]);
  });

  it("refuses a day in the past, or more than a year off", async () => {
    const house = await makeHouse(["Ava"]);
    const today = localDate(rightNow(), ZONE);
    expectRule(await house.admin.db.rpc("set_moving_out", { p_on: addDaysTo(today, -1) }), "moving_in_past");
    expectRule(await house.admin.db.rpc("set_moving_out", { p_on: addDaysTo(today, 400) }), "moving_too_far");
    expectOk(await house.admin.db.rpc("set_moving_out", { p_on: today }));
  });

  it("refuses someone in no house", async () => {
    const loner = await signedInUser("Lou");
    expectDenied(await loner.db.rpc("set_moving_out", { p_on: localDate(rightNow(), ZONE) }));
  });

  it("can't be written straight to the column", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    await ben.db.from("members").update({ moving_out_on: "2030-01-01" }).eq("user_id", ben.userId);
    const { data } = await db.from("members").select("moving_out_on").eq("user_id", ben.userId).single();
    expect(data!.moving_out_on).toBeNull();
  });
});

describe("leaving", () => {
  it("writes down the move, and the Wall says who went", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));

    const moves = await movesOf(ben.userId);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from_house_id: house.id, to_house_id: null, how: null, reminded_at: null });
    const { data: post } = await db.from("events").select("user_id, data").eq("house_id", house.id).eq("kind", "moved_out");
    expect(post).toEqual([{ user_id: ben.userId, data: { who: "Ben" } }]);
  });

  it("the last one out leaves no post, but still has a move", async () => {
    const house = await makeHouse(["Ava"]);
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: house.admin.userId }));
    expect(await movesOf(house.admin.userId)).toHaveLength(1);
    const { data: post } = await db.from("events").select("id").eq("house_id", house.id).eq("kind", "moved_out");
    expect(post).toEqual([]);
  });

  it("handing over as you go is leaving too", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    expectOk(await house.admin.db.rpc("hand_over", { p_house: house.id, p_to: house.members[0].userId }));
    expect(await movesOf(house.admin.userId)).toHaveLength(1);
  });

  it("someone an admin removes has no move, unless they'd said they were moving out", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    expectOk(await cal.db.rpc("set_moving_out", { p_on: localDate(rightNow(), ZONE) }));
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    expectOk(await house.admin.db.rpc("remove_member", { p_house: house.id, p_user: cal.userId }));
    expect(await movesOf(ben.userId)).toHaveLength(0);
    expect(await movesOf(cal.userId)).toHaveLength(1);
  });

  it("each person reads only their own moves", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    const { data: mine } = await ben.db.from("moves").select("id");
    expect(mine).toHaveLength(1);
    const { data: theirs } = await house.admin.db.from("moves").select("id");
    expect(theirs).toEqual([]);
    // And nobody writes one by hand.
    const { error } = await ben.db.from("moves").insert({ user_id: ben.userId, from_house_id: house.id });
    expect(error?.code).toBe("42501");
  });
});

describe("start_house_from", () => {
  it("starts a house with the old list, groups left behind, and says how you moved", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    const week = thisWeek();
    const [bins] = await addJohns(house.id, [{ name: "Bins", points: 3, dueDow: 2 }, { name: "Hoover", crew: 2 }], week);
    const { data: groupId } = await house.admin.db.rpc("save_group", {
      p_house: house.id,
      p_group: null as unknown as string,
      p_name: "Upstairs",
      p_members: [house.admin.userId, ben.userId],
    });
    await db.from("johns").update({ group_id: groupId }).eq("id", bins.id);
    await addJohns(house.id, [{ name: "Gone" }], week).then((gone) =>
      db.from("johns").update({ archived_at: rightNow().toISOString() }).eq("id", gone[0].id),
    );
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));

    const { data: offer } = await ben.db.rpc("moving_on");
    expect(offer).toMatchObject([{ from_house_id: house.id, house_name: "Ava's house", johns: 2 }]);

    const res = await ben.db.rpc("start_house_from", {
      p_from: house.id,
      p_name: "Ben's new place",
      p_timezone: ZONE,
      p_currency: "GBP",
      p_week_starts: 1,
    });
    expectOk(res);
    const { data: johns } = await db
      .from("johns")
      .select("name, points, due_dow, crew, group_id, anchor_week")
      .eq("house_id", res.data!)
      .order("name");
    expect(johns).toEqual([
      { name: "Bins", points: 3, due_dow: 2, crew: 1, group_id: null, anchor_week: expect.any(Number) },
      { name: "Hoover", points: 2, due_dow: 7, crew: 2, group_id: null, anchor_week: expect.any(Number) },
    ]);
    const { data: role } = await db.from("members").select("role").eq("house_id", res.data!).eq("user_id", ben.userId).single();
    expect(role!.role).toBe("admin");
    expect(await movesOf(ben.userId)).toMatchObject([{ from_house_id: house.id, to_house_id: res.data, how: "copied" }]);
    // Moved on: nothing more to offer.
    const { data: after } = await ben.db.rpc("moving_on");
    expect(after).toEqual([]);
  });

  it("refuses a house you never left", async () => {
    const house = await makeHouse(["Ava"]);
    const stranger = await signedInUser("Sid");
    expectDenied(
      await stranger.db.rpc("start_house_from", {
        p_from: house.id,
        p_name: "Mine now",
        p_timezone: ZONE,
        p_currency: "GBP",
        p_week_starts: 1,
      }),
    );
  });

  it("a plain new house, or joining one, counts as moving on too", async () => {
    const old = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = old.members;
    const next = await makeHouse(["Dee"]);
    for (const who of [ben, cal]) expectOk(await who.db.rpc("remove_member", { p_house: old.id, p_user: who.userId }));

    const started = await ben.db.rpc("create_house", { p_name: "Ben's", p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1 });
    expectOk(started);
    expectOk(await cal.db.rpc("join_house", { p_code: next.code }));
    expect(await movesOf(ben.userId)).toMatchObject([{ to_house_id: started.data, how: "started" }]);
    expect(await movesOf(cal.userId)).toMatchObject([{ to_house_id: next.id, how: "joined" }]);
  });
});

describe("the deal and moving out", () => {
  it("deals nothing from the moving-out day, and nothing at all once gone", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    // A week a fortnight ahead, dealt just before it starts.
    const week = weekWindow(fromNow(14 * DAY), ZONE, 1);
    const wednesday = addDaysTo(week.startsOn, 2);
    await addJohns(
      house.id,
      [1, 2, 3, 4, 5, 6, 7].map((d) => ({ name: `Day ${d}`, dueDow: d as 1 | 2 | 3 | 4 | 5 | 6 | 7, keepDay: true })),
      week,
    );
    await db.from("members").update({ moving_out_on: wednesday }).eq("user_id", ben.userId);
    await db.from("members").update({ moving_out_on: week.startsOn }).eq("user_id", cal.userId);

    const { weekId, assignments } = await deal(house.id, week, new Date(week.startsAt.getTime() - 3_600_000));
    const bens = assignments.filter((a) => a.user_id === ben.userId);
    for (const a of bens) expect(localDate(new Date(a.due_at), ZONE) < wednesday).toBe(true);
    expect(assignments.some((a) => a.user_id === cal.userId)).toBe(false);
    const { data: shares } = await db.from("week_shares").select("user_id").eq("week_id", weekId);
    expect(shares!.map((s) => s.user_id).sort()).toEqual([house.admin.userId, ben.userId].sort());
  });
});

describe("the one reminder", () => {
  it("goes two weeks after leaving, once, to someone still in no house", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    for (const who of [ben, cal]) expectOk(await who.db.rpc("remove_member", { p_house: house.id, p_user: who.userId }));
    // Cal has found a house since.
    expectOk(await cal.db.rpc("create_house", { p_name: "Cal's", p_timezone: ZONE, p_currency: "GBP", p_week_starts: 1 }));
    await db
      .from("moves")
      .update({ left_at: fromNow(-15 * DAY).toISOString() })
      .in("user_id", [ben.userId, cal.userId]);

    const r = recorder();
    await remindMovers(db, rightNow(), r.notify);
    await remindMovers(db, rightNow(), r.notify);
    const ours = r.sent.filter((s) => s.to.includes(ben.userId) || s.to.includes(cal.userId));
    expect(ours).toHaveLength(1);
    expect(ours[0]).toMatchObject({
      to: [ben.userId],
      message: { title: "Settled into your new place?", body: "Bring Jonz with you.", kind: "reminders" },
    });
  });

  it("isn't sent before two weeks, and not after a month", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    for (const who of [ben, cal]) expectOk(await who.db.rpc("remove_member", { p_house: house.id, p_user: who.userId }));
    await db.from("moves").update({ left_at: fromNow(-31 * DAY).toISOString() }).eq("user_id", cal.userId);
    const r = recorder();
    await remindMovers(db, rightNow(), r.notify);
    expect(r.sent.filter((s) => s.to.includes(ben.userId) || s.to.includes(cal.userId))).toEqual([]);
  });

  it("waits out quiet hours, and is dropped for someone with reminders off", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ben, cal] = house.members;
    for (const who of [ben, cal]) expectOk(await who.db.rpc("remove_member", { p_house: house.id, p_user: who.userId }));
    await db
      .from("moves")
      .update({ left_at: fromNow(-15 * DAY).toISOString() })
      .in("user_id", [ben.userId, cal.userId]);
    const now = rightNow();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: ZONE }).format(now));
    expectOk(
      await db.from("notification_prefs").insert({ user_id: ben.userId, quiet_from: hour, quiet_until: (hour + 2) % 24, timezone: ZONE }),
    );
    expectOk(await db.from("notification_prefs").insert({ user_id: cal.userId, reminders: false }));
    const r = recorder();
    await remindMovers(db, now, r.notify);
    expect(r.sent.filter((s) => s.to.includes(ben.userId) || s.to.includes(cal.userId))).toEqual([]);
    const moves = await db.from("moves").select("user_id, reminded_at").in("user_id", [ben.userId, cal.userId]);
    expect(moves.data!.find((m) => m.user_id === ben.userId)!.reminded_at).toBeNull();
    expect(moves.data!.find((m) => m.user_id === cal.userId)!.reminded_at).not.toBeNull();
  });
});
