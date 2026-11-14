import { addDaysTo, localDate, nextWeek } from "@app/core";
import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser } from "@/tests/support/clients";
import { expectDenied, expectOk, expectRule } from "@/tests/support/expect";
import { addJohns, deal, makeHouse, reread, thisWeek, weeksAgo, ZONE } from "@/tests/support/factories";
import { rightNow } from "@/tests/support/clock";
import { loadBalances } from "@/lib/engine/deal-week";

/**
 * Groups and time away: who may shape them, and what the deal does with
 * them. The housemate side goes through each person's own session; the
 * engine is driven by hand with the service role, as in engine.test.ts.
 */

const db = adminClient();

async function group(house: Awaited<ReturnType<typeof makeHouse>>, name: string, userIds: string[]) {
  const { data, error } = await house.admin.db.rpc("save_group", {
    p_house: house.id,
    p_group: null as unknown as string,
    p_name: name,
    p_members: userIds,
  });
  expect(error).toBeNull();
  return data!;
}

async function sharesOf(weekId: string) {
  const { data } = await db.from("week_shares").select("user_id, share").eq("week_id", weekId);
  return new Map(data!.map((s) => [s.user_id, Number(s.share)]));
}

function pointsBy(assignments: { user_id: string; points: number }[]) {
  const out = new Map<string, number>();
  for (const a of assignments) out.set(a.user_id, (out.get(a.user_id) ?? 0) + a.points);
  return out;
}

describe("groups", () => {
  it("are made by an admin, of housemates, and seen by the house", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const [ava, ben, cal] = house.everyone;
    const id = await group(house, "Upstairs bathroom", [ava.userId, ben.userId]);

    const { data: seen } = await cal.db.from("groups").select("id, name").eq("house_id", house.id);
    expect(seen).toEqual([{ id, name: "Upstairs bathroom" }]);
    const { data: who } = await cal.db.from("group_members").select("user_id").eq("group_id", id);
    expect(who!.map((w) => w.user_id).sort()).toEqual([ava.userId, ben.userId].sort());
  });

  it("are refused to anyone but an admin", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const ben = house.members[0];
    expectDenied(
      await ben.db.rpc("save_group", {
        p_house: house.id,
        p_group: null as unknown as string,
        p_name: "Mine",
        p_members: [ben.userId],
      }),
    );
    expectDenied(await ben.db.from("groups").insert({ house_id: house.id, name: "Sneaky" }));
  });

  it("only ever hold housemates, and at least one", async () => {
    const house = await makeHouse(["Ava"]);
    const stranger = await signedInUser("Zed");
    const call = (members: string[]) =>
      house.admin.db.rpc("save_group", {
        p_house: house.id,
        p_group: null as unknown as string,
        p_name: "Odd",
        p_members: members,
      });
    expectRule(await call([house.admin.userId, stranger.userId]), "not_housemates");
    expectRule(await call([]), "group_empty");
  });

  it("are invisible outside the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await group(house, "Upstairs", [house.admin.userId]);
    const stranger = await signedInUser("Zed");
    const { data } = await stranger.db.from("groups").select("id").eq("house_id", house.id);
    expect(data).toEqual([]);
  });

  it("cannot be borrowed from another house", async () => {
    const mine = await makeHouse(["Ava"]);
    const theirs = await makeHouse(["Xan"]);
    const foreign = await group(theirs, "Theirs", [theirs.admin.userId]);
    const [john] = await addJohns(mine.id, [{ name: "Bins" }], thisWeek());
    const res = await mine.admin.db.from("johns").update({ group_id: foreign }).eq("id", john.id);
    expect(res.error).not.toBeNull();
    expect((await reread("johns", john.id)).group_id).toBeNull();
  });

  it("hand their Johns back to everyone when deleted", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const id = await group(house, "Upstairs", [house.admin.userId]);
    const [john] = await addJohns(house.id, [{ name: "Bathroom", groupId: id }], thisWeek());
    expectOk(await house.admin.db.rpc("delete_group", { p_group: id }));
    expect((await reread("johns", john.id)).group_id).toBeNull();
  });

  it("lose whoever leaves the house", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    const id = await group(house, "Upstairs", [ava.userId, ben.userId]);
    expectOk(await ben.db.rpc("remove_member", { p_house: house.id, p_user: ben.userId }));
    const { data } = await db.from("group_members").select("user_id").eq("group_id", id);
    expect(data!.map((m) => m.user_id)).toEqual([ava.userId]);
  });
});

describe("dealing with groups", () => {
  it("hands a group's John only to the group, and shares it only among them", async () => {
    const house = await makeHouse(["Ava", "Ben", "Cal", "Dee", "Eli"]);
    const [a, b, c, d, e] = house.everyone.map((x) => x.userId);
    const up = await group(house, "Upstairs", [a, b, c]);
    const down = await group(house, "Downstairs", [d, e]);
    const week = weeksAgo(1);
    await addJohns(
      house.id,
      [
        { name: "Upstairs bathroom", points: 6, groupId: up },
        { name: "Downstairs bathroom", points: 6, groupId: down },
        { name: "Kitchen", points: 5 },
      ],
      week,
    );
    const { weekId, assignments } = await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));

    const upstairs = assignments.find((x) => x.name === "Upstairs bathroom")!;
    const downstairs = assignments.find((x) => x.name === "Downstairs bathroom")!;
    expect([a, b, c]).toContain(upstairs.user_id);
    expect([d, e]).toContain(downstairs.user_id);
    expect(upstairs.group_name).toBe("Upstairs");
    expect(assignments.find((x) => x.name === "Kitchen")!.group_name).toBeNull();

    const shares = await sharesOf(weekId);
    expect(shares.get(a)).toBe(3); // 6 / 3 + 5 / 5
    expect(shares.get(d)).toBe(4); // 6 / 2 + 5 / 5
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(17);
  });
});

describe("time away", () => {
  /** Three housemates and six two-point Johns, all kept to the week's Sunday evening. */
  async function threeHouse() {
    const house = await makeHouse(["Ava", "Ben", "Cal"]);
    const week = weeksAgo(2);
    await addJohns(
      house.id,
      ["Bins", "Hob", "Hoover", "Mop", "Shop", "Plants"].map((name) => ({ name, points: 2, dueDow: 7 as const, keepDay: true })),
      week,
    );
    return { house, week, cal: house.everyone[2] };
  }

  async function awayFor(houseId: string, userId: string, from: string, to: string) {
    expectOk(await db.from("away_periods").insert({ house_id: houseId, user_id: userId, starts_on: from, ends_on: to }));
  }

  const sunday = (week: { startsOn: string }) => addDaysTo(week.startsOn, 6);

  it("never hands someone a John due while they're away, but keeps their share", async () => {
    const { house, week, cal } = await threeHouse();
    await awayFor(house.id, cal.userId, sunday(week), sunday(week));
    const { weekId, assignments } = await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));

    expect(assignments).toHaveLength(6);
    expect(assignments.some((x) => x.user_id === cal.userId)).toBe(false);
    expect((await sharesOf(weekId)).get(cal.userId)).toBe(4);
    const after = nextWeek(week, ZONE, 1);
    const { balances } = await loadBalances(db, house.id, after.startsOn, house.everyone.map((x) => x.userId));
    expect(balances.get(cal.userId)).toBe(-4);
  });

  it("hands the away share to the others when the house doesn't make time away up", async () => {
    const { house, week, cal } = await threeHouse();
    expectOk(await house.admin.db.from("houses").update({ away_makeup: 0 }).eq("id", house.id));
    await awayFor(house.id, cal.userId, sunday(week), sunday(week));
    const { weekId } = await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));
    const shares = await sharesOf(weekId);
    expect(shares.get(cal.userId)).toBe(0);
    expect(shares.get(house.admin.userId)).toBe(6);
  });

  it("catches someone up the week after, by no more than half a week extra", async () => {
    const { house, week, cal } = await threeHouse();
    await awayFor(house.id, cal.userId, sunday(week), sunday(week));
    await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));

    const back = nextWeek(week, ZONE, 1);
    const { weekId, assignments } = await deal(house.id, back, new Date(back.startsAt.getTime() - 60_000));
    const share = (await sharesOf(weekId)).get(cal.userId)!;
    const handed = pointsBy(assignments).get(cal.userId) ?? 0;
    expect(share).toBe(4);
    expect(handed).toBeGreaterThan(share);
    expect(handed).toBeLessThanOrEqual(share * 1.5);
  });

  it("skips a group's John when the whole group is away", async () => {
    const house = await makeHouse(["Ava", "Ben", "Dee"]);
    const dee = house.everyone[2];
    const down = await group(house, "Downstairs", [dee.userId]);
    const week = weeksAgo(1);
    await addJohns(house.id, [{ name: "Downstairs bathroom", groupId: down, dueDow: 7 }, { name: "Kitchen" }], week);
    await awayFor(house.id, dee.userId, week.startsOn, sunday(week));
    const { weekId } = await deal(house.id, week, new Date(week.startsAt.getTime() - 60_000));
    const { data } = await db.from("assignments").select("name").eq("week_id", weekId);
    expect(data!.map((x) => x.name)).toEqual(["Kitchen"]);
  });

  it("is booked ahead, once at a time, and not for months", async () => {
    const house = await makeHouse(["Ava"]);
    const me = house.admin;
    const today = localDate(rightNow(), ZONE);
    const away = (from: string, to: string) => me.db.rpc("set_away", { p_starts: from, p_ends: to });
    expectRule(await away(addDaysTo(today, -1), addDaysTo(today, 2)), "away_in_past");
    expectRule(await away(addDaysTo(today, 5), addDaysTo(today, 4)), "away_backwards");
    expectRule(await away(addDaysTo(today, 1), addDaysTo(today, 120)), "away_too_long");
    expectOk(await away(addDaysTo(today, 3), addDaysTo(today, 6)));
    expectRule(await away(addDaysTo(today, 5), addDaysTo(today, 9)), "away_overlaps");
  });

  it("makes the Johns you already have due before you go, and puts them back if you cancel", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    const [ava, ben] = house.everyone;
    const week = nextWeek(thisWeek(), ZONE, 1);
    await addJohns(house.id, [{ name: "Bathroom", dueDow: 3, dueTime: "20:00" }, { name: "Bins", dueDow: 5 }], week);
    const { assignments } = await deal(house.id, week, rightNow());
    const bathroom = assignments.find((x) => x.name === "Bathroom")!;
    const bins = assignments.find((x) => x.name === "Bins")!;
    await db.from("assignments").update({ user_id: ava.userId }).eq("id", bathroom.id);
    await db.from("assignments").update({ user_id: ben.userId }).eq("id", bins.id);

    const dueDay = localDate(new Date(bathroom.due_at), ZONE);
    const res = await ava.db.rpc("set_away", { p_starts: dueDay, p_ends: addDaysTo(dueDay, 3), p_note: "Lisbon" });
    expectOk(res);
    expect(res.data).toBe(1);

    const [y, m, d] = dueDay.split("-").map(Number);
    const nightBefore = new TZDate(y, m - 1, d, 0, 0, 0, ZONE).getTime() - 60_000;
    const moved = await reread("assignments", bathroom.id);
    expect(new Date(moved.due_at as string).getTime()).toBe(nightBefore);
    expect(new Date(moved.original_due_at as string).getTime()).toBe(new Date(bathroom.due_at).getTime());
    expect((await reread("assignments", bins.id)).due_at).toBe(bins.due_at);

    const { data: trip } = await ava.db.from("away_periods").select("id, note").eq("user_id", ava.userId).single();
    expect(trip!.note).toBe("Lisbon");
    const { data: wall } = await ben.db.from("events").select("kind").eq("house_id", house.id).eq("kind", "away");
    expect(wall).toHaveLength(1);

    expectDenied(await ben.db.rpc("cancel_away", { p_away: trip!.id }));
    expectOk(await ava.db.rpc("cancel_away", { p_away: trip!.id }));
    const back = await reread("assignments", bathroom.id);
    expect(new Date(back.due_at as string).getTime()).toBe(new Date(bathroom.due_at).getTime());
    expect(back.original_due_at).toBeNull();
    const { data: gone } = await db.from("away_periods").select("id").eq("id", trip!.id);
    expect(gone).toEqual([]);
  });

  it("is written only through set_away, and seen only by the house", async () => {
    const house = await makeHouse(["Ava"]);
    const me = house.admin;
    const today = localDate(rightNow(), ZONE);
    expectDenied(
      await me.db.from("away_periods").insert({ house_id: house.id, user_id: me.userId, starts_on: today, ends_on: today }),
    );
    expectOk(await me.db.rpc("set_away", { p_starts: addDaysTo(today, 1), p_ends: addDaysTo(today, 2) }));
    const stranger = await signedInUser("Zed");
    const { data } = await stranger.db.from("away_periods").select("id").eq("house_id", house.id);
    expect(data).toEqual([]);
  });
});
